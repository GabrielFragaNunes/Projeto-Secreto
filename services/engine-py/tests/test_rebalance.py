import json
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.rebalance import (
    PortfolioPosition,
    PortfolioPolicy,
    SimulationRequest,
    simulate_contribution,
)

FIXTURES = Path(__file__).parent / "fixtures"
CLASS_TARGETS = {
    "FIIs": Decimal("0.50"),
    "Ações": Decimal("0.32"),
    "Tesouro": Decimal("0.15"),
    "ETF": Decimal("0.02"),
    "FIAGRO": Decimal("0.01"),
}


def load_sample_positions() -> list[PortfolioPosition]:
    raw_positions = json.loads(
        (FIXTURES / "sample_portfolio.json").read_text(encoding="utf-8")
    )
    return [PortfolioPosition.model_validate(position) for position in raw_positions]


def make_policy(**changes: object) -> PortfolioPolicy:
    payload: dict[str, object] = {"metas_classe": CLASS_TARGETS}
    payload.update(changes)
    return PortfolioPolicy.model_validate(payload)


def make_request(
    positions: list[PortfolioPosition],
    amount: Decimal,
    policy: PortfolioPolicy | None = None,
    facts: dict[str, object] | None = None,
) -> SimulationRequest:
    return SimulationRequest.model_validate(
        {
            "positions": [position.model_dump() for position in positions],
            "policy": (policy or make_policy()).model_dump(),
            "aporte_disponivel": amount,
            "fii_facts": facts or {},
        }
    )


def test_reference_simulation_blocks_red_and_disabled_assets() -> None:
    positions = load_sample_positions()
    pvbi_facts = json.loads(
        (FIXTURES / "pvbi11_facts.json").read_text(encoding="utf-8")
    )
    result = simulate_contribution(
        make_request(positions, Decimal("1000.00"), facts={"PVBI11": pvbi_facts})
    )

    excluded = {asset.ticker: asset for asset in result.ativos_excluidos}
    assert excluded["PVBI11"].semaforo == "VERMELHO"
    assert "p. 6" in " ".join(excluded["PVBI11"].regras_acionadas)
    assert excluded["TGAR11"].motivo == "Ativo desabilitado nas regras configuradas."
    assert result.total_alocado + result.troco_residual == Decimal("1000.00")
    assert all(order.classe != "Tesouro" for order in result.ordens)

    sanb_order = next(order for order in result.ordens if order.ticker == "SANB11")
    current = next(position for position in positions if position.ticker == "SANB11")
    expected_average = (
        current.quantidade * current.preco_medio
        + sanb_order.quantidade_calculada * current.preco_atual
    ) / (current.quantidade + sanb_order.quantidade_calculada)
    assert sanb_order.preco_medio_projetado == expected_average.quantize(
        Decimal("0.0001")
    )


def test_zero_contribution_allocates_nothing() -> None:
    result = simulate_contribution(
        make_request(load_sample_positions(), Decimal("0"))
    )
    assert result.ordens == []
    assert result.total_alocado == Decimal("0.00")
    assert result.troco_residual == Decimal("0.00")


def test_contribution_below_cheapest_unit_remains_as_residual() -> None:
    position = PortfolioPosition(
        ticker="PETR4",
        classe="Ações",
        quantidade=Decimal("1"),
        preco_medio=Decimal("1000"),
        preco_atual=Decimal("1000"),
    )
    policy = make_policy(metas_classe={"Ações": Decimal("1")})
    result = simulate_contribution(
        make_request([position], Decimal("100"), policy)
    )
    assert result.ordens == []
    assert result.total_alocado == Decimal("0.00")
    assert result.troco_residual == Decimal("100.00")


def test_all_assets_blocked_leaves_entire_contribution_unallocated() -> None:
    positions = [
        PortfolioPosition(
            ticker="PETR4",
            classe="Ações",
            quantidade=Decimal("1"),
            preco_medio=Decimal("10"),
            preco_atual=Decimal("10"),
            habilitado_aporte=False,
        )
    ]
    policy = make_policy(metas_classe={"Ações": Decimal("1")})
    result = simulate_contribution(make_request(positions, Decimal("100"), policy))
    assert result.ordens == []
    assert result.troco_residual == Decimal("100.00")
    assert result.ativos_excluidos[0].ticker == "PETR4"


def test_yellow_semaphore_reduces_asset_budget_by_configured_percentage() -> None:
    position = PortfolioPosition(
        ticker="FIIA11",
        classe="FIIs",
        quantidade=Decimal("10"),
        preco_medio=Decimal("10"),
        preco_atual=Decimal("10"),
    )
    policy = PortfolioPolicy(
        metas_classe={"FIIs": Decimal("1")},
        gatilhos_semaforo_fii={
            "vacancia_fisica_max_pct": 25,
            "vacancia_financeira_max_pct": 25,
            "vacancia_financeira_amarelo_pct": 15,
        },
        reducao_semaforo_amarelo_pct=50,
    )
    facts = {
        "FIIA11": {
            "vacancia_fisica_pct": 10,
            "vacancia_financeira_pct": 20,
            "alavancagem_indicada": False,
            "pagina_fonte": 4,
        }
    }
    result = simulate_contribution(
        make_request([position], Decimal("100"), policy, facts)
    )
    assert result.ordens[0].semaforo == "AMARELO"
    assert result.ordens[0].quantidade_calculada == Decimal("5")
    assert result.total_alocado == Decimal("50.00")
    assert result.troco_residual == Decimal("50.00")


def test_manual_price_ceiling_excludes_asset() -> None:
    position = PortfolioPosition(
        ticker="PETR4",
        classe="Ações",
        quantidade=Decimal("1"),
        preco_medio=Decimal("9"),
        preco_atual=Decimal("10"),
        preco_teto_manual=Decimal("9.50"),
    )
    policy = make_policy(metas_classe={"Ações": Decimal("1")})
    result = simulate_contribution(make_request([position], Decimal("100"), policy))
    assert result.ordens == []
    assert result.ativos_excluidos[0].motivo == (
        "Preço atual acima do teto manual configurado."
    )


def test_treasury_uses_hundredth_units_and_thirty_brl_minimum() -> None:
    position = PortfolioPosition(
        ticker="TESOURO-IPCA",
        classe="Tesouro",
        segmento="Tesouro Direto",
        quantidade=Decimal("1"),
        preco_medio=Decimal("100"),
        preco_atual=Decimal("100"),
    )
    policy = make_policy(metas_classe={"Tesouro": Decimal("1")})
    eligible = simulate_contribution(
        make_request([position], Decimal("30"), policy)
    )
    assert eligible.ordens[0].quantidade_calculada == Decimal("0.30")
    assert eligible.ordens[0].total_estimado == Decimal("30.00")

    below_minimum = simulate_contribution(
        make_request([position], Decimal("20"), policy)
    )
    assert below_minimum.ordens == []
    assert below_minimum.troco_residual == Decimal("20.00")


def test_class_targets_must_sum_to_exactly_one() -> None:
    with pytest.raises(ValidationError):
        make_policy(metas_classe={"FIIs": Decimal("0.50"), "Ações": Decimal("0.49")})


def test_sample_fixture_contains_thirty_positions_and_exact_total() -> None:
    positions = load_sample_positions()
    total = sum(
        (
            (position.quantidade * position.preco_atual).quantize(
                Decimal("0.01")
            )
            for position in positions
        ),
        Decimal("0"),
    )
    assert len(positions) == 30
    assert total == Decimal("26672.29")
