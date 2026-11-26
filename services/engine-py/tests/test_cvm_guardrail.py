import re
from typing import Any


PROHIBITED_TERMS = re.compile(
    r"\b(?:compre|venda|recomendamos|sugerimos|oportunidade|barato|carteira\s+recomendada)\b",
    re.IGNORECASE,
)


def _response_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [
            item
            for nested in value.values()
            for item in _response_strings(nested)
        ]
    if isinstance(value, list):
        return [item for nested in value for item in _response_strings(nested)]
    return []


def test_aporte_simulation_response_has_no_prescriptive_language(
    api_client,
    reference_simulation_payload,
) -> None:
    response = api_client.post(
        "/v1/aporte/simular",
        json=reference_simulation_payload,
    )

    assert response.status_code == 200
    matches = [
        match.group(0)
        for text in _response_strings(response.json())
        for match in PROHIBITED_TERMS.finditer(text)
    ]
    assert matches == []
