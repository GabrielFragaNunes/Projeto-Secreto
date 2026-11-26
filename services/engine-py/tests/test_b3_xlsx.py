from io import BytesIO
from decimal import Decimal

from openpyxl import Workbook
import pytest

from app.parsers.b3_xlsx import parse_b3_xlsx


def workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Ações"
    sheet.append(
        [
            " ATIVO ",
            "Categoria",
            "Preço Médio",
            "PREÇO ATUAL",
            "Quantidade",
            "Patrimônio Atual",
        ]
    )
    sheet.append(["ABCD3", "ações", "1.234,56", "1.300,00", "2", "999999"])
    sheet.append([None, None, None, None, None, None])
    sheet.append(["TOTAL", None, None, None, None, "999999"])
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def test_parser_normalizes_headers_and_recalculates_portfolio_value() -> None:
    result = parse_b3_xlsx(workbook_bytes())

    assert result.total_ativos == 1
    assert result.positions[0].ticker == "ABCD3"
    assert result.positions[0].classe == "Ações"
    assert result.positions[0].preco_medio == Decimal("1234.56")
    assert result.patrimonio_total == Decimal("2600.00")
    assert result.resumo_por_classe == {"Ações": Decimal("2600.00")}


def test_parser_uses_normalized_sheet_name_for_empty_category() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "fii"
    sheet.append(["ATIVO", "CATEGORIA", "PREÇO MÉDIO", "PREÇO ATUAL", "QUANTIDADE"])
    sheet.append(["ABCD11", None, "10,00", "12,00", "3"])
    output = BytesIO()
    workbook.save(output)
    workbook.close()

    result = parse_b3_xlsx(output.getvalue())

    assert result.positions[0].classe == "FIIs"
    assert result.positions[0].segmento == "Outros"


def test_parser_reports_missing_columns_in_portuguese() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["ATIVO", "CATEGORIA"])
    sheet.append(["ABCD3", "Ações"])
    output = BytesIO()
    workbook.save(output)
    workbook.close()

    with pytest.raises(ValueError, match="Colunas obrigatórias ausentes"):
        parse_b3_xlsx(output.getvalue())


def test_parser_rejects_duplicate_tickers_across_sheets() -> None:
    workbook = Workbook()
    first = workbook.active
    first.title = "Ações"
    headers = ["ATIVO", "CATEGORIA", "PREÇO MÉDIO", "PREÇO ATUAL", "QUANTIDADE"]
    first.append(headers)
    first.append(["ABCD3", "Ações", "1,00", "2,00", "1"])
    second = workbook.create_sheet("FIIs")
    second.append(headers)
    second.append(["ABCD3", "FIIs", "1,00", "2,00", "1"])
    output = BytesIO()
    workbook.save(output)
    workbook.close()

    with pytest.raises(ValueError, match="tickers duplicados"):
        parse_b3_xlsx(output.getvalue())
