import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import macro_explainer
from app.ai.macro_explainer import (
    MacroClassDistribution,
    MacroExplanation,
    MacroGeminiApiKeyMissingError,
    SYSTEM_INSTRUCTION,
    explain_macro,
)
from app.api import routes
from app.integrations import bcb_olinda
from app.integrations.bcb_olinda import (
    BCBFocusUnavailableError,
    BCB_FOCUS_SOURCE,
    MacroFocusSnapshot,
    clear_macro_focus_cache,
    get_macro_focus_snapshot,
)
from app.main import app

client = TestClient(app)
CURRENT_DATE = date(2026, 11, 26)


@pytest.fixture(autouse=True)
def clear_focus_cache() -> None:
    clear_macro_focus_cache()


def focus_rows(
    latest_date: str = "2026-11-25",
    older_date: str = "2026-11-24",
    *,
    latest_pib: float = 1.8,
) -> list[dict[str, object]]:
    medians = {
        "Selic": (13.75, 12.5),
        "IPCA": (4.8, 4.2),
        "PIB Total": (latest_pib, 1.9),
    }
    rows: list[dict[str, object]] = []
    for indicator, (current_median, next_median) in medians.items():
        for research_date, year, median in (
            (latest_date, 2026, current_median),
            (latest_date, 2027, next_median),
            (older_date, 2026, 99.0),
            (older_date, 2027, 99.0),
        ):
            rows.append(
                {
                    "Indicador": indicator,
                    "Data": research_date,
                    "DataReferencia": str(year),
                    "Mediana": median,
                    "baseCalculo": 0,
                }
            )
        rows.append(
            {
                "Indicador": indicator,
                "Data": latest_date,
                "DataReferencia": "2026",
                "Mediana": 999.0,
                "baseCalculo": 1,
            }
        )
    return rows


def fake_http_client(rows: list[dict[str, object]]) -> SimpleNamespace:
    response = SimpleNamespace(
        text=json.dumps({"value": rows}),
        raise_for_status=Mock(),
    )
    return SimpleNamespace(get=Mock(return_value=response), close=Mock())


def sample_snapshot() -> MacroFocusSnapshot:
    return MacroFocusSnapshot(
        data_referencia=CURRENT_DATE,
        indicadores=[
            {
                "indicador": "Selic",
                "ano_referencia": 2026,
                "mediana": Decimal("13.75"),
                "data_pesquisa": CURRENT_DATE,
            },
            {
                "indicador": "IPCA",
                "ano_referencia": 2026,
                "mediana": Decimal("4.8"),
                "data_pesquisa": CURRENT_DATE,
            },
            {
                "indicador": "PIB Total",
                "ano_referencia": 2026,
                "mediana": Decimal("1.8"),
                "data_pesquisa": CURRENT_DATE,
            },
            {
                "indicador": "Selic",
                "ano_referencia": 2027,
                "mediana": Decimal("12.5"),
                "data_pesquisa": CURRENT_DATE,
            },
            {
                "indicador": "IPCA",
                "ano_referencia": 2027,
                "mediana": Decimal("4.2"),
                "data_pesquisa": CURRENT_DATE,
            },
            {
                "indicador": "PIB Total",
                "ano_referencia": 2027,
                "mediana": Decimal("1.9"),
                "data_pesquisa": CURRENT_DATE,
            },
        ],
        fonte_oficial=BCB_FOCUS_SOURCE,
    )


def class_distribution() -> list[MacroClassDistribution]:
    return [
        MacroClassDistribution(
            classe="FIIs",
            percentual_atual=Decimal("48"),
            percentual_alvo=Decimal("50"),
        ),
        MacroClassDistribution(
            classe="Ações",
            percentual_atual=Decimal("32"),
            percentual_alvo=Decimal("32"),
        ),
        MacroClassDistribution(
            classe="Tesouro",
            percentual_atual=Decimal("17"),
            percentual_alvo=Decimal("18"),
        ),
    ]


def explanation_payload() -> dict[str, object]:
    return {
        "explicacoes_por_classe": [
            {
                "classe": "FIIs",
                "sensibilidade_macro": "Sensibilidade a juros e inflação.",
                "explicacao_educativa": (
                    "A trajetória dos juros pode influenciar custos de "
                    "financiamento e taxas de desconto em fundos de tijolo; "
                    "fundos de papel podem refletir indexadores e condições "
                    "de crédito."
                ),
            },
            {
                "classe": "Ações",
                "sensibilidade_macro": "Sensibilidade a juros e atividade econômica.",
                "explicacao_educativa": (
                    "Juros e atividade econômica podem afetar custos de "
                    "capital e expectativas de resultados empresariais."
                ),
            },
            {
                "classe": "Tesouro",
                "sensibilidade_macro": "Sensibilidade a juros reais e inflação.",
                "explicacao_educativa": (
                    "Títulos indexados à inflação combinam a variação do índice "
                    "com uma taxa real contratada; mudanças nas taxas de mercado "
                    "podem alterar seus preços antes do vencimento."
                ),
            },
        ]
    }


def test_olinda_parses_latest_medians_for_current_and_next_year() -> None:
    http_client = fake_http_client(focus_rows())

    snapshot = get_macro_focus_snapshot(
        client=http_client,
        today=CURRENT_DATE,
        ttl_seconds=3600,
    )

    medians = {
        (item.indicador, item.ano_referencia): item.mediana
        for item in snapshot.indicadores
    }
    assert snapshot.data_referencia == date(2026, 11, 25)
    assert snapshot.fonte_oficial == BCB_FOCUS_SOURCE
    assert medians[("Selic", 2026)] == Decimal("13.75")
    assert medians[("IPCA", 2027)] == Decimal("4.2")
    assert medians[("PIB Total", 2026)] == Decimal("1.8")
    http_client.get.assert_called_once()
    assert http_client.get.call_args.kwargs["timeout"] == 10.0
    assert "baseCalculo eq 0" in http_client.get.call_args.kwargs["params"]["$filter"]


def test_olinda_cache_reuses_snapshot_until_ttl_expires(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    monkeypatch.setattr(bcb_olinda.time, "monotonic", lambda: now[0])
    first_client = fake_http_client(focus_rows(latest_pib=1.8))
    second_client = fake_http_client(focus_rows(latest_pib=2.1))

    first = get_macro_focus_snapshot(
        client=first_client,
        today=CURRENT_DATE,
        ttl_seconds=10,
    )
    cached = get_macro_focus_snapshot(
        client=second_client,
        today=CURRENT_DATE,
        ttl_seconds=10,
    )
    now[0] += 11
    refreshed = get_macro_focus_snapshot(
        client=second_client,
        today=CURRENT_DATE,
        ttl_seconds=10,
    )

    assert first.indicadores == cached.indicadores
    assert first_client.get.call_count == 1
    assert second_client.get.call_count == 1
    assert next(
        item.mediana
        for item in refreshed.indicadores
        if item.indicador == "PIB Total" and item.ano_referencia == 2026
    ) == Decimal("2.1")


def test_olinda_retries_and_fails_safely_when_service_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bcb_olinda.time, "sleep", lambda _: None)
    http_client = SimpleNamespace(
        get=Mock(side_effect=httpx.ConnectError("offline")),
        close=Mock(),
    )

    with pytest.raises(BCBFocusUnavailableError):
        get_macro_focus_snapshot(
            client=http_client,
            today=CURRENT_DATE,
            ttl_seconds=3600,
        )

    assert http_client.get.call_count == bcb_olinda.MAX_ATTEMPTS


def test_focus_endpoint_returns_snapshot_and_maps_bcb_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(routes, "get_macro_focus_snapshot", sample_snapshot)
    response = client.get("/v1/macro/focus")

    assert response.status_code == 200, response.text
    assert response.json()["fonte_oficial"] == BCB_FOCUS_SOURCE
    assert response.json()["indicadores"][0]["mediana"] == 13.75

    def fail_fetch() -> MacroFocusSnapshot:
        raise BCBFocusUnavailableError("offline")

    monkeypatch.setattr(routes, "get_macro_focus_snapshot", fail_fetch)
    unavailable = client.get("/v1/macro/focus")
    assert unavailable.status_code == 503


def test_macro_explanation_fails_safely_without_gemini_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(MacroGeminiApiKeyMissingError, match="GEMINI_API_KEY"):
        explain_macro(sample_snapshot(), class_distribution())


def _strings_in(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [
            text
            for item in value.values()
            for text in _strings_in(item)
        ]
    if isinstance(value, list):
        return [text for item in value for text in _strings_in(item)]
    return []


def test_macro_explanation_endpoint_uses_gemini_schema_and_cvm_guardrail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    fake_client = SimpleNamespace(
        models=SimpleNamespace(
            generate_content=Mock(
                return_value=SimpleNamespace(parsed=explanation_payload())
            )
        )
    )
    monkeypatch.setattr(
        macro_explainer.genai,
        "Client",
        lambda **_: fake_client,
    )
    payload = {
        "snapshot": sample_snapshot().model_dump(mode="json"),
        "distribuicao_por_classe": [
            item.model_dump(mode="json") for item in class_distribution()
        ],
    }

    response = client.post("/v1/macro/explicar", json=payload)

    assert response.status_code == 200, response.text
    call = fake_client.models.generate_content.call_args
    assert call.kwargs["model"] == "gemini-2.5-flash"
    assert call.kwargs["config"].response_schema is MacroExplanation
    assert call.kwargs["config"].temperature == 0.0
    assert call.kwargs["config"].system_instruction == SYSTEM_INSTRUCTION
    assert [item["classe"] for item in response.json()["explicacoes_por_classe"]] == [
        "FIIs",
        "Ações",
        "Tesouro",
    ]

    forbidden_terms = (
        "compre",
        "venda",
        "recomendamos",
        "sugerimos",
        "oportunidade",
        "barato",
        "carteira recomendada",
    )
    returned_strings = _strings_in(response.json())
    assert all(
        term.casefold() not in text.casefold()
        for term in forbidden_terms
        for text in returned_strings
    )


def test_macro_explanation_rejects_missing_or_duplicate_classes(
) -> None:
    payload = {
        "snapshot": sample_snapshot().model_dump(mode="json"),
        "distribuicao_por_classe": [
            item.model_dump(mode="json") for item in class_distribution()
        ],
        "extra": "not accepted",
    }

    response = client.post("/v1/macro/explicar", json=payload)
    assert response.status_code == 422

    duplicate_payload = {
        "snapshot": sample_snapshot().model_dump(mode="json"),
        "distribuicao_por_classe": [
            class_distribution()[0].model_dump(mode="json"),
            class_distribution()[0].model_dump(mode="json"),
        ],
    }
    response = client.post("/v1/macro/explicar", json=duplicate_payload)
    assert response.status_code == 422
