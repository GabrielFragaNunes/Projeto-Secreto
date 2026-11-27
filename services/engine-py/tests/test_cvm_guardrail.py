from collections.abc import Iterator

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PROHIBITED_TERMS = (
    "compre",
    "venda",
    "recomendamos",
    "sugerimos",
    "oportunidade",
    "barato",
    "carteira recomendada",
)


def _strings(value: object) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def test_simulation_response_contains_only_descriptive_language() -> None:
    response = client.post(
        "/v1/aporte/simular",
        json={
            "positions": [
                {
                    "ticker": "PETR4",
                    "classe": "Ações",
                    "quantidade": 1,
                    "preco_medio": 10,
                    "preco_atual": 10,
                }
            ],
            "policy": {"metas_classe": {"Ações": 1}},
            "aporte_disponivel": 50,
        },
    )
    assert response.status_code == 200
    response_strings = " ".join(_strings(response.json())).casefold()
    assert not any(term in response_strings for term in PROHIBITED_TERMS)
