import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from app.ai.fii_extractor import FiiReportExtraction
from app.domain.models import PositionItem
from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def api_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def sample_portfolio_payload() -> dict[str, Any]:
    return json.loads(
        (FIXTURES_DIR / "sample_portfolio.json").read_text(encoding="utf-8")
    )


@pytest.fixture
def sample_positions(sample_portfolio_payload: dict[str, Any]) -> list[PositionItem]:
    return TypeAdapter(list[PositionItem]).validate_json(
        json.dumps(sample_portfolio_payload["positions"])
    )


@pytest.fixture
def pvbi_facts_payload() -> dict[str, Any]:
    return json.loads(
        (FIXTURES_DIR / "pvbi11_facts.json").read_text(encoding="utf-8")
    )


@pytest.fixture
def pvbi_facts(pvbi_facts_payload: dict[str, Any]) -> dict[str, FiiReportExtraction]:
    return TypeAdapter(dict[str, FiiReportExtraction]).validate_json(
        json.dumps(pvbi_facts_payload)
    )


@pytest.fixture
def reference_policy() -> dict[str, Any]:
    return {
        "metas_classe": {
            "FIIs": 0.50,
            "Ações": 0.32,
            "Tesouro": 0.15,
            "ETF": 0.02,
            "FIAGRO": 0.01,
        },
        "metas_segmento": {},
        "gatilhos_semaforo_fii": {
            "vacancia_fisica_max_pct": 25,
            "vacancia_financeira_max_pct": 25,
            "alavancagem_max_pct": 5,
        },
        "ativos_configurados": [
            {"ticker": "TGAR11", "classe": "FIIs", "elegivel": False}
        ],
    }


@pytest.fixture
def reference_simulation_payload(
    sample_portfolio_payload: dict[str, Any],
    pvbi_facts_payload: dict[str, Any],
    reference_policy: dict[str, Any],
) -> dict[str, Any]:
    return {
        "positions": sample_portfolio_payload["positions"],
        "policy": reference_policy,
        "aporte_disponivel": 1000.00,
        "fii_facts": pvbi_facts_payload,
    }
