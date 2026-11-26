from copy import deepcopy
from io import BytesIO

from openpyxl import Workbook


def test_aporte_simulation_returns_result_and_fii_semaphores(
    api_client,
    reference_simulation_payload,
) -> None:
    response = api_client.post(
        "/v1/aporte/simular",
        json=reference_simulation_payload,
    )

    assert response.status_code == 200
    result = response.json()
    blocked = {item["ticker"]: item for item in result["ativos_bloqueados"]}
    assert blocked["PVBI11"]["semaforo"] == "VERMELHO"
    assert "TGAR11" in blocked
    assert not any(order["classe"] == "Tesouro" for order in result["ordens"])
    assert result["total_alocado"] + result["troco_residual"] == 1000


def test_aporte_simulation_rejects_class_targets_that_do_not_sum_to_one(
    api_client,
    reference_simulation_payload,
) -> None:
    invalid_payload = deepcopy(reference_simulation_payload)
    invalid_payload["policy"]["metas_classe"]["FIIs"] = 0.4

    response = api_client.post("/v1/aporte/simular", json=invalid_payload)

    assert response.status_code == 422


def test_aporte_simulation_recalculates_assessment_from_objective_facts(
    api_client,
    reference_simulation_payload,
) -> None:
    payload = deepcopy(reference_simulation_payload)
    payload["fii_facts"]["PVBI11"]["avaliacao_deterministica_usuario"] = {
        "semaforo": "VERDE",
        "regras_acionadas": [],
    }

    response = api_client.post("/v1/aporte/simular", json=payload)

    assert response.status_code == 200
    blocked = {
        item["ticker"]: item
        for item in response.json()["ativos_bloqueados"]
    }
    assert blocked["PVBI11"]["semaforo"] == "VERMELHO"


def test_xlsx_import_reads_workbook_from_memory(api_client) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "FIIs"
    sheet.append(
        ["ATIVO", "CATEGORIA", "PREÇO MÉDIO", "PREÇO ATUAL", "QUANTIDADE"]
    )
    sheet.append(["ABCD11", "FIIs", "10,00", "12,50", "4"])
    file_buffer = BytesIO()
    workbook.save(file_buffer)
    workbook.close()

    response = api_client.post(
        "/v1/import/xlsx",
        files={
            "file": (
                "carteira.xlsx",
                file_buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["positions"][0]["ticker"] == "ABCD11"
    assert body["patrimonio_total"] == 50
    assert body["resumo_por_classe"] == {"FIIs": 50}


def test_xlsx_import_rejects_wrong_extension_and_file_over_five_megabytes(
    api_client,
) -> None:
    wrong_extension = api_client.post(
        "/v1/import/xlsx",
        files={"file": ("carteira.xls", b"not an xlsx", "application/octet-stream")},
    )
    oversized = api_client.post(
        "/v1/import/xlsx",
        files={
            "file": (
                "carteira.xlsx",
                b"x" * (5 * 1024 * 1024 + 1),
                "application/octet-stream",
            )
        },
    )

    assert wrong_extension.status_code == 415
    assert oversized.status_code == 413


def test_cors_allows_default_web_origin(api_client) -> None:
    response = api_client.options(
        "/v1/aporte/simular",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"] == "http://localhost:3000"
    )
