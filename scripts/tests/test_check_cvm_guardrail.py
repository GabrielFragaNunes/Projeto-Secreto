import pytest

from scripts.check_cvm_guardrail import find_violations, is_test_file


@pytest.mark.parametrize(
    "phrase",
    [
        "recomendamos",
        "sugerimos comprar",
        "compre agora",
        "venda agora",
        "carteira recomendada",
        "oportunidade imperdível",
    ],
)
def test_finds_prohibited_phrases(phrase: str) -> None:
    assert find_violations(f"Texto: {phrase}.") == [(1, phrase)]


def test_matching_is_case_insensitive_and_requires_whole_words() -> None:
    assert find_violations("RECOMENDAMOS.") == [(1, "RECOMENDAMOS")]
    assert find_violations("recomendamosXYZ") == []


def test_reports_line_number() -> None:
    assert find_violations("Linha segura\nCompre agora.") == [(2, "Compre agora")]


def test_identifies_common_test_file_names() -> None:
    assert is_test_file("test_domain.py")
    assert is_test_file("rebalance.spec.ts")
    assert is_test_file("component.test.tsx")
    assert not is_test_file("component.tsx")
