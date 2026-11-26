from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from openpyxl import load_workbook

from app.domain.models import AssetClass, ImportXlsxResult, PositionItem

REQUIRED_COLUMNS = (
    "ATIVO",
    "CATEGORIA",
    "PREÇO MÉDIO",
    "PREÇO ATUAL",
    "QUANTIDADE",
)
CENT = Decimal("0.01")
ZERO = Decimal("0")


def _normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    without_accents = "".join(
        character for character in text if not unicodedata.combining(character)
    )
    return re.sub(r"\s+", " ", without_accents).strip().casefold()


def _normalize_class(value: object) -> AssetClass | None:
    normalized = _normalize_text(value)
    aliases: dict[str, AssetClass] = {
        "fii": "FIIs",
        "fiis": "FIIs",
        "fundo imobiliario": "FIIs",
        "fundos imobiliarios": "FIIs",
        "fundo de investimento imobiliario": "FIIs",
        "fundos de investimento imobiliario": "FIIs",
        "acao": "Ações",
        "acoes": "Ações",
        "tesouro": "Tesouro",
        "tesouro direto": "Tesouro",
        "etf": "ETF",
        "fiagro": "FIAGRO",
        "renda fixa": "Renda Fixa",
    }
    return aliases.get(normalized)


def _decimal_value(value: object, *, row_number: int, column: str) -> Decimal:
    if value is None or isinstance(value, bool):
        raise ValueError(
            f"Linha {row_number}: valor inválido na coluna {column}."
        )
    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, (int, float)):
        try:
            result = Decimal(str(value))
        except InvalidOperation as error:
            raise ValueError(
                f"Linha {row_number}: valor inválido na coluna {column}."
            ) from error
    elif isinstance(value, str):
        normalized = value.strip().replace(" ", "")
        if "," in normalized:
            normalized = normalized.replace(".", "").replace(",", ".")
        try:
            result = Decimal(normalized)
        except InvalidOperation as error:
            raise ValueError(
                f"Linha {row_number}: valor inválido na coluna {column}."
            ) from error
    else:
        raise ValueError(f"Linha {row_number}: valor inválido na coluna {column}.")
    if not result.is_finite():
        raise ValueError(f"Linha {row_number}: valor inválido na coluna {column}.")
    return result


def _load_workbook(source: bytes | bytearray | BinaryIO | str | Path):
    if isinstance(source, (bytes, bytearray)):
        return load_workbook(BytesIO(source), read_only=True, data_only=True)
    return load_workbook(source, read_only=True, data_only=True)


def parse_b3_xlsx(
    source: bytes | bytearray | BinaryIO | str | Path,
) -> ImportXlsxResult:
    """Read B3 workbook positions and recalculate marked portfolio values."""
    workbook = _load_workbook(source)
    positions: list[PositionItem] = []

    try:
        for worksheet in workbook.worksheets:
            rows = worksheet.iter_rows(values_only=True)
            header_row = next(rows, None)
            if header_row is None or all(value is None for value in header_row):
                continue

            headers: dict[str, int] = {}
            for index, value in enumerate(header_row):
                if value is not None:
                    headers[_normalize_text(value)] = index
            required_normalized = {
                _normalize_text(column): column for column in REQUIRED_COLUMNS
            }
            missing = [
                display
                for normalized, display in required_normalized.items()
                if normalized not in headers
            ]
            if missing:
                raise ValueError(
                    f"Aba '{worksheet.title}' com layout inválido. "
                    f"Colunas obrigatórias ausentes: {', '.join(missing)}."
                )

            for row_number, values in enumerate(rows, start=2):
                ticker_value = values[headers[_normalize_text("ATIVO")]]
                ticker = str(ticker_value).strip() if ticker_value is not None else ""
                if not ticker or _normalize_text(ticker).startswith("total"):
                    continue

                category_value = values[headers[_normalize_text("CATEGORIA")]]
                asset_class = (
                    _normalize_class(category_value)
                    if category_value is not None and str(category_value).strip()
                    else _normalize_class(worksheet.title)
                )
                if asset_class is None:
                    raise ValueError(
                        f"Linha {row_number} da aba '{worksheet.title}': "
                        "categoria não reconhecida."
                    )

                average_price = _decimal_value(
                    values[headers[_normalize_text("PREÇO MÉDIO")]],
                    row_number=row_number,
                    column="PREÇO MÉDIO",
                )
                current_price = _decimal_value(
                    values[headers[_normalize_text("PREÇO ATUAL")]],
                    row_number=row_number,
                    column="PREÇO ATUAL",
                )
                quantity = _decimal_value(
                    values[headers[_normalize_text("QUANTIDADE")]],
                    row_number=row_number,
                    column="QUANTIDADE",
                )
                if average_price < ZERO or current_price < ZERO or quantity < ZERO:
                    raise ValueError(
                        f"Linha {row_number} da aba '{worksheet.title}': "
                        "preços e quantidade não podem ser negativos."
                    )
                positions.append(
                    PositionItem(
                        ticker=ticker,
                        classe=asset_class,
                        quantidade=quantity,
                        preco_medio=average_price,
                        preco_atual=current_price,
                    )
                )
    finally:
        workbook.close()

    tickers = [position.ticker for position in positions]
    if len(tickers) != len(set(tickers)):
        raise ValueError("A planilha contém tickers duplicados.")

    totals_by_class: dict[str, Decimal] = {}
    for position in positions:
        value = (position.preco_atual * position.quantidade).quantize(
            CENT, rounding=ROUND_HALF_UP
        )
        totals_by_class[position.classe] = (
            totals_by_class.get(position.classe, ZERO) + value
        )
    total = sum(totals_by_class.values(), ZERO).quantize(
        CENT, rounding=ROUND_HALF_UP
    )
    return ImportXlsxResult(
        positions=positions,
        total_ativos=len(positions),
        patrimonio_total=total,
        resumo_por_classe=totals_by_class,
    )
