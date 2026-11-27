import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.ai.fii_extractor import (
    FiiReportExtraction,
    GeminiApiKeyMissingError,
    SYSTEM_INSTRUCTION,
    clear_extractor_caches,
    extract_fii_report,
)
from app.ai import fii_extractor
from app.api import routes
from app.domain.fii_risk import SemaphoreThresholds, avaliar_semaforo_fii
from app.main import app

client = TestClient(app)
PDF_BYTES = b"%PDF-1.7\nmock public report"
PDF_HASH = hashlib.sha256(PDF_BYTES).hexdigest()


def report_payload() -> dict[str, object]:
    return {
        "ticker": "PVBI11",
        "competencia": "2026-09",
        "gestora": "VBI Real Estate",
        "hash_pdf_sha256": "0" * 64,
        "indicadores_financeiros": {
            "pagina_fonte": 4,
            "dados": {
                "p_vp": 0.63,
            },
        },
        "indicadores_imobiliarios": {
            "pagina_fonte": 7,
            "vacancia_fisica_pct": None,
            "vacancia_financeira_pct": 30.4,
            "maior_inquilino": {
                "nome": "Prevent Senior",
                "concentracao_pct": 34,
            },
        },
        "alavancagem": {
            "pagina_fonte": 8,
            "indicada": False,
            "percentual_sobre_patrimonio": None,
            "descricao": None,
        },
        "guidance_dividendos": {
            "pagina_fonte": 9,
            "descricao": None,
        },
        "fatos_relevantes": [],
    }


@pytest.fixture(autouse=True)
def clear_process_caches() -> None:
    clear_extractor_caches()


def make_gemini_client(parsed_response: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(
        files=SimpleNamespace(
            upload=Mock(return_value=SimpleNamespace(name="files/report.pdf"))
        ),
        caches=SimpleNamespace(
            create=Mock(return_value=SimpleNamespace(name="cachedContents/report"))
        ),
        models=SimpleNamespace(
            generate_content=Mock(return_value=SimpleNamespace(parsed=parsed_response))
        ),
    )


def test_extraction_deduplicates_by_sha256_and_overwrites_model_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "test-model")
    fake_client = make_gemini_client(report_payload())

    first_report = extract_fii_report(PDF_BYTES, client=fake_client)
    second_report = extract_fii_report(PDF_BYTES, client=fake_client)

    assert first_report.hash_pdf_sha256 == PDF_HASH
    assert second_report.hash_pdf_sha256 == PDF_HASH
    fake_client.files.upload.assert_called_once()
    fake_client.caches.create.assert_called_once()
    fake_client.models.generate_content.assert_called_once()
    call = fake_client.models.generate_content.call_args
    assert call.kwargs["model"] == "test-model"
    assert PDF_HASH in call.kwargs["contents"]
    assert call.kwargs["config"].temperature == 0.0
    assert call.kwargs["config"].response_mime_type == "application/json"
    assert call.kwargs["config"].response_schema is FiiReportExtraction
    assert fake_client.caches.create.call_args.kwargs["config"].system_instruction == SYSTEM_INSTRUCTION


def test_extraction_cache_expires_and_refreshes_context_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    monkeypatch.setattr(fii_extractor.time, "monotonic", lambda: now[0])
    fake_client = make_gemini_client(report_payload())

    extract_fii_report(PDF_BYTES, client=fake_client)
    now[0] += fii_extractor.PDF_CACHE_TTL_SECONDS + 1
    extract_fii_report(PDF_BYTES, client=fake_client)

    assert fake_client.files.upload.call_count == 2
    assert fake_client.caches.create.call_count == 2
    assert fake_client.models.generate_content.call_count == 2


def test_parallel_requests_for_same_pdf_share_extraction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "test-model")
    fake_client = make_gemini_client(report_payload())

    with ThreadPoolExecutor(max_workers=4) as executor:
        reports = list(
            executor.map(
                lambda _: extract_fii_report(PDF_BYTES, client=fake_client),
                range(4),
            )
        )

    assert all(report.hash_pdf_sha256 == PDF_HASH for report in reports)
    fake_client.files.upload.assert_called_once()
    fake_client.models.generate_content.assert_called_once()


def test_pydantic_schema_validates_required_pages_and_excludes_python_assessment() -> None:
    payload = report_payload()
    report = FiiReportExtraction.model_validate_json(json.dumps(payload))

    assert report.indicadores_imobiliarios.vacancia_financeira_pct == Decimal("30.4")
    assert report.indicadores_imobiliarios.maior_inquilino is not None
    assert report.indicadores_imobiliarios.maior_inquilino.nome == "Prevent Senior"
    assert "avaliacao_deterministica_usuario" not in FiiReportExtraction.model_fields

    payload["indicadores_financeiros"] = {"dados": {}}
    with pytest.raises(ValidationError):
        FiiReportExtraction.model_validate(payload)

    payload = report_payload()
    payload["avaliacao_deterministica_usuario"] = {
        "semaforo": "VERMELHO",
        "regras_acionadas": [],
    }
    with pytest.raises(ValidationError):
        FiiReportExtraction.model_validate(payload)


def test_pydantic_top_level_schema_matches_canonical_contract() -> None:
    contract_path = (
        Path(__file__).parents[3]
        / "packages"
        / "contracts"
        / "fii_report.schema.json"
    )
    canonical_schema = json.loads(contract_path.read_text(encoding="utf-8"))
    pydantic_schema = FiiReportExtraction.model_json_schema()

    canonical_properties = set(canonical_schema["properties"]) - {
        "avaliacao_deterministica_usuario"
    }
    assert set(pydantic_schema["properties"]) == canonical_properties
    assert set(pydantic_schema["required"]) == (
        set(canonical_schema["required"])
    )

    section_pairs = (
        ("indicadores_financeiros", "IndicadoresFinanceiros"),
        ("indicadores_imobiliarios", "IndicadoresImobiliarios"),
        ("alavancagem", "Alavancagem"),
        ("guidance_dividendos", "GuidanceDividendos"),
    )
    for contract_name, model_name in section_pairs:
        contract_section = canonical_schema["properties"][contract_name]
        contract_definition = canonical_schema["$defs"][
            contract_section["$ref"].rsplit("/", 1)[1]
        ]
        model_definition = pydantic_schema["$defs"][model_name]
        assert set(model_definition.get("required", [])) == set(
            contract_definition.get("required", [])
        )
        assert set(model_definition["properties"]) == set(
            contract_definition["properties"]
        )

def test_python_semaphore_uses_configured_threshold_and_source_page() -> None:
    payload = FiiReportExtraction.model_validate_json(json.dumps(report_payload()))

    result = avaliar_semaforo_fii(
        vacancia_fisica_pct=payload.indicadores_imobiliarios.vacancia_fisica_pct,
        vacancia_financeira_pct=payload.indicadores_imobiliarios.vacancia_financeira_pct,
        pagina_indicadores_imobiliarios=payload.indicadores_imobiliarios.pagina_fonte,
        alavancagem_indicada=payload.alavancagem.indicada,
        alavancagem_pct=payload.alavancagem.percentual_sobre_patrimonio,
        pagina_alavancagem=payload.alavancagem.pagina_fonte,
        thresholds=SemaphoreThresholds(),
    )

    assert result.semaforo == "VERMELHO"
    assert any("30.4%" in trigger and "(p. 7)" in trigger for trigger in result.regras_acionadas)


def test_python_semaphore_is_green_at_limit_and_yellow_when_data_is_missing() -> None:
    thresholds = SemaphoreThresholds()
    common = {
        "pagina_indicadores_imobiliarios": 7,
        "alavancagem_indicada": False,
        "alavancagem_pct": None,
        "pagina_alavancagem": 8,
        "thresholds": thresholds,
    }

    at_limit = avaliar_semaforo_fii(
        vacancia_fisica_pct=Decimal("25"),
        vacancia_financeira_pct=Decimal("25"),
        **common,
    )
    missing_value = avaliar_semaforo_fii(
        vacancia_fisica_pct=None,
        vacancia_financeira_pct=Decimal("10"),
        **common,
    )

    assert at_limit.semaforo == "VERDE"
    assert missing_value.semaforo == "AMARELO"
    assert "(p. 7)" in missing_value.regras_acionadas[0]


def test_python_semaphore_uses_yellow_financial_vacancy_threshold() -> None:
    thresholds = SemaphoreThresholds(
        vacancia_fisica_max_pct=None,
        vacancia_financeira_amarelo_pct=Decimal("15"),
        vacancia_financeira_max_pct=Decimal("25"),
    )

    assessment = avaliar_semaforo_fii(
        vacancia_fisica_pct=None,
        vacancia_financeira_pct=Decimal("20"),
        pagina_indicadores_imobiliarios=6,
        alavancagem_indicada=False,
        alavancagem_pct=None,
        pagina_alavancagem=6,
        thresholds=thresholds,
    )

    assert assessment.semaforo == "AMARELO"
    assert "limiar amarelo configurado de 15%" in assessment.regras_acionadas[0]
    assert "(p. 6)" in assessment.regras_acionadas[0]


def test_endpoint_returns_python_assessment_with_numeric_json_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        routes,
        "extract_fii_report",
        lambda _pdf_bytes: FiiReportExtraction.model_validate_json(
            json.dumps(report_payload())
        ),
    )

    response = client.post(
        "/v1/fii/extrair-pdf",
        files={"file": ("pvbi11.pdf", PDF_BYTES, "application/pdf")},
        data={"thresholds": '{"vacancia_financeira_max_pct": 25}'},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["avaliacao_deterministica_usuario"]["semaforo"] == "VERMELHO"
    assert body["indicadores_imobiliarios"]["vacancia_financeira_pct"] == 30.4
    assert any("(p. 7)" in trigger for trigger in body["avaliacao_deterministica_usuario"]["regras_acionadas"])


def test_extraction_fails_safely_without_gemini_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(GeminiApiKeyMissingError, match="GEMINI_API_KEY"):
        extract_fii_report(PDF_BYTES)


PVBI11_PDF = Path(__file__).parent / "fixtures" / "pvbi11_2026-09.pdf"
INTEGRATION_SKIP_REASON = (
    "requires GEMINI_API_KEY and tests/fixtures/pvbi11_2026-09.pdf"
)


@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY") or not PVBI11_PDF.is_file(),
    reason=INTEGRATION_SKIP_REASON,
)
def test_real_pvbi11_report_extraction_and_semaphore() -> None:
    report = extract_fii_report(PVBI11_PDF.read_bytes())
    assessment = avaliar_semaforo_fii(
        vacancia_fisica_pct=report.indicadores_imobiliarios.vacancia_fisica_pct,
        vacancia_financeira_pct=report.indicadores_imobiliarios.vacancia_financeira_pct,
        pagina_indicadores_imobiliarios=report.indicadores_imobiliarios.pagina_fonte,
        alavancagem_indicada=report.alavancagem.indicada,
        alavancagem_pct=report.alavancagem.percentual_sobre_patrimonio,
        pagina_alavancagem=report.alavancagem.pagina_fonte,
        thresholds=SemaphoreThresholds(),
    )

    assert report.ticker == "PVBI11"
    assert report.competencia == "2026-09"
    assert report.indicadores_imobiliarios.vacancia_financeira_pct == Decimal("30.4")
    assert report.alavancagem.indicada is False
    assert report.indicadores_imobiliarios.maior_inquilino is not None
    assert report.indicadores_imobiliarios.maior_inquilino.nome == "Prevent Senior"
    assert report.indicadores_imobiliarios.maior_inquilino.concentracao_pct == Decimal("34")
    assert report.indicadores_financeiros.dados.p_vp == Decimal("0.63")
    assert assessment.semaforo == "VERMELHO"
