from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from typing import Any
from zipfile import BadZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel, ConfigDict

from app.domain.rebalance import PortfolioPosition

CENT = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


class B3XlsxParseError(ValueError):
    pass


class B3ImportResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    positions: list[PortfolioPosition]
    patrimonio_total: Decimal
    resumo_por_classe: dict[str, Decimal]


def _normalize_header(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _decimal_cell(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    text = str(value).strip().replace("R$", "").replace(" ", "")
    if not text:
        return None
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        parsed = Decimal(text)
    except (InvalidOperation, TypeError, ValueError) as error:
        raise B3XlsxParseError(f"Valor numérico inválido: {value!r}.") from error
    if not parsed.is_finite():
        raise B3XlsxParseError("A planilha contém valor numérico não finito.")
    return parsed


def _classify(raw_class: Any, ticker: str, sheet_name: str) -> str:
    text = _normalize_header(raw_class or sheet_name)
    if any(term in text for term in ("fiagro", "fiag")):
        return "FIAGRO"
    if any(term in text for term in ("fii", "fundosimobiliarios", "imobiliario")):
        return "FIIs"
    if any(term in text for term in ("tesouro", "titulopublico")):
        return "Tesouro"
    if "etf" in text:
        return "ETF"
    if any(term in text for term in ("aca", "acoes", "stock")):
        return "Ações"
    if ticker.startswith(("LTN", "NTN", "LFT", "TESOURO")):
        return "Tesouro"
    if ticker.endswith("11"):
        return "FIIs"
    return "Ações"


def _find_header_row(rows: list[tuple[Any, ...]]) -> tuple[int, dict[str, int]] | None:
    ticker_names = {
        "ativo",
        "ticker",
        "codigo",
        "codigodenegociacao",
        "papel",
        "negociacao",
        "produto",
    }
    quantity_names = {"quantidade", "qtde", "posicao", "disponivel", "total"}
    for row_index, row in enumerate(rows[:15]):
        headers = {_normalize_header(value): index for index, value in enumerate(row)}
        if ticker_names.intersection(headers) and quantity_names.intersection(headers):
            return row_index, headers
    return None


def _get_value(
    row: tuple[Any, ...],
    headers: dict[str, int],
    names: tuple[str, ...],
) -> Any:
    for name in names:
        index = headers.get(_normalize_header(name))
        if index is not None and index < len(row):
            value = row[index]
            if value is not None and value != "":
                return value
    return None


def parse_b3_xlsx(content: bytes) -> B3ImportResult:
    if not content:
        raise B3XlsxParseError("O arquivo XLSX está vazio.")
    try:
        workbook = load_workbook(BytesIO(content), data_only=True, read_only=True)
    except (BadZipFile, InvalidFileException, OSError, ValueError) as error:
        raise B3XlsxParseError("O arquivo não é uma planilha XLSX válida.") from error

    positions: list[PortfolioPosition] = []
    for worksheet in workbook.worksheets:
        rows = list(worksheet.iter_rows(values_only=True))
        header_match = _find_header_row(rows)
        if header_match is None:
            continue
        header_index, headers = header_match

        for row_number, row in enumerate(rows[header_index + 1 :], start=header_index + 2):
            if not any(value is not None and value != "" for value in row):
                continue
            ticker_value = _get_value(
                row,
                headers,
                (
                    "Ativo",
                    "Ticker",
                    "Código",
                    "Código de Negociação",
                    "Papel",
                    "Negociação",
                    "Produto",
                ),
            )
            if ticker_value is None:
                continue
            ticker = str(ticker_value).strip().upper().split()[0]
            if not ticker:
                continue

            quantity = _decimal_cell(
                _get_value(
                    row,
                    headers,
                    ("Quantidade", "Qtde", "Posição", "Disponível", "Total"),
                )
            )
            if quantity is None or quantity <= 0:
                continue

            current_price = _decimal_cell(
                _get_value(
                    row,
                    headers,
                    (
                        "Preço Atual",
                        "Preco Atual",
                        "Preço",
                        "Cotação",
                        "Price",
                    ),
                )
            )
            total_value = _decimal_cell(
                _get_value(
                    row,
                    headers,
                    ("Valor Atual", "Patrimônio Atual", "Valor Total", "Current Value"),
                )
            )
            if current_price is None and total_value is not None:
                current_price = (total_value / quantity).quantize(
                    FOUR_PLACES, rounding=ROUND_HALF_UP
                )
            if current_price is None or current_price <= 0:
                raise B3XlsxParseError(
                    f"Preço atual ausente ou inválido na linha {row_number}."
                )

            average_price = _decimal_cell(
                _get_value(
                    row,
                    headers,
                    ("Preço Médio", "Preco Medio", "Preço de Aquisição", "Average Price"),
                )
            )
            raw_class = _get_value(
                row,
                headers,
                ("Classe", "Categoria", "Tipo", "Class", "Asset Class"),
            )
            segment = _get_value(row, headers, ("Segmento", "Setor", "Segment"))
            positions.append(
                PortfolioPosition(
                    ticker=ticker,
                    classe=_classify(raw_class, ticker, worksheet.title),
                    segmento=str(segment).strip() if segment else "Outros",
                    quantidade=quantity,
                    preco_medio=average_price,
                    preco_atual=current_price,
                )
            )

    workbook.close()
    if not positions:
        raise B3XlsxParseError(
            "Nenhuma posição válida foi encontrada na planilha."
        )

    totals: dict[str, Decimal] = {}
    for position in positions:
        value = (position.quantidade * position.preco_atual).quantize(
            CENT, rounding=ROUND_HALF_UP
        )
        totals[position.classe] = totals.get(position.classe, Decimal("0")) + value
    patrimony = sum(totals.values(), Decimal("0")).quantize(
        CENT, rounding=ROUND_HALF_UP
    )
    return B3ImportResult(
        positions=positions,
        patrimonio_total=patrimony,
        resumo_por_classe=totals,
    )
