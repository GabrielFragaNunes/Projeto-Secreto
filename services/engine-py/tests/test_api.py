from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.main import app

client = TestClient(app)


def test_simulation_endpoint_returns_calculated_result() -> None:
    response = client.post(
        "/v1/aporte/simular",
        json={
            "positions": [
                {
                    "ticker": "PETR4",
                    "classe": "Ações",
                    "segmento": "Energia",
                    "quantidade": 10,
                    "preco_medio": 9,
                    "preco_atual": 10,
                }
            ],
            "policy": {"metas_classe": {"Ações": 1}},
            "aporte_disponivel": 50,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_alocado"] == 50
    assert payload["ordens"][0]["quantidade_calculada"] == 5


def test_simulation_endpoint_rejects_class_targets_not_summing_to_one() -> None:
    response = client.post(
        "/v1/aporte/simular",
        json={
            "positions": [],
            "policy": {"metas_classe": {"FIIs": 0.5, "Ações": 0.49}},
            "aporte_disponivel": 100,
        },
    )
    assert response.status_code == 422


def test_xlsx_import_endpoint_parses_workbook_created_in_memory() -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Ações"
    sheet.append(
        ["Ativo", "Classe", "Segmento", "Quantidade", "Preço Atual", "Preço Médio"]
    )
    sheet.append(["PETR4", "Ações", "Energia", 10, 38.25, 30.5])
    stream = BytesIO()
    workbook.save(stream)

    response = client.post(
        "/v1/import/xlsx",
        files={
            "file": (
                "carteira.xlsx",
                stream.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["positions"][0]["ticker"] == "PETR4"
    assert payload["positions"][0]["preco_atual"] == 38.25
    assert payload["patrimonio_total"] == 382.5
    assert payload["resumo_por_classe"]["Ações"] == 382.5


def test_xlsx_import_endpoint_rejects_non_xlsx_extension() -> None:
    response = client.post(
        "/v1/import/xlsx",
        files={"file": ("carteira.csv", b"ticker,quantidade", "text/csv")},
    )
    assert response.status_code == 415
