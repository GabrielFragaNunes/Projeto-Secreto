from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain.fii_risk import FiiSemaphoreAssessment
from app.domain.models import PositionItem, RebalanceRequest
from app.domain.rebalance import calcular_rebalanceamento, segment_meta_key


def position(
    ticker: str,
    *,
    classe: str = "FIIs",
    segmento: str = "Logística",
    quantity: str = "10",
    average: str = "9",
    price: str = "10",
    enabled: bool = True,
    ceiling: str | None = None,
) -> PositionItem:
    return PositionItem(
        ticker=ticker,
        classe=classe,  # type: ignore[arg-type]
        segmento=segmento,
        quantidade=Decimal(quantity),
        preco_medio=Decimal(average),
        preco_atual=Decimal(price),
        habilitado_aporte=enabled,
        preco_teto_manual=Decimal(ceiling) if ceiling is not None else None,
    )


def request(
    positions: list[PositionItem],
    aporte: str,
    *,
    metas_classe: dict[str, Decimal] | None = None,
    metas_segmento: dict[str, Decimal] | None = None,
    **kwargs: object,
) -> RebalanceRequest:
    return RebalanceRequest(
        positions=positions,
        aporte_disponivel=Decimal(aporte),
        metas_classe=metas_classe or {"FIIs": Decimal("1")},
        metas_segmento=metas_segmento or {},
        **kwargs,  # type: ignore[arg-type]
    )


def test_class_and_asset_deficits_allocate_proportionally_with_decimal_cents() -> None:
    result = calcular_rebalanceamento(
        request(
            [
                position("AAA11", price="10", quantity="10"),
                position("BBB11", price="10", quantity="10"),
            ],
            "100.00",
        )
    )

    assert [(order.ticker, order.qtd_calculada) for order in result.ordens] == [
        ("AAA11", Decimal("5")),
        ("BBB11", Decimal("5")),
    ]
    assert result.total_alocado == Decimal("100.00")
    assert result.troco_residual == Decimal("0.00")
    assert result.total_alocado + result.troco_residual == result.aporte_disponivel
    assert result.eficiencia_pct == Decimal("100.00")


def test_class_and_segment_targets_are_applied_top_down() -> None:
    class_result = calcular_rebalanceamento(
        request(
            [
                position("FII11", classe="FIIs", quantity="10", price="10"),
                position("ACAO3", classe="Ações", quantity="10", price="10"),
            ],
            "100",
            metas_classe={"FIIs": Decimal("0.6"), "Ações": Decimal("0.4")},
        )
    )
    class_orders = {order.ticker: order.qtd_calculada for order in class_result.ordens}
    assert class_orders == {"ACAO3": Decimal("2"), "FII11": Decimal("8")}

    segment_result = calcular_rebalanceamento(
        request(
            [
                position("LOG11", segmento="Logística", quantity="5", price="10"),
                position("PAPR11", segmento="Papel", quantity="5", price="10"),
            ],
            "100",
            metas_segmento={
                segment_meta_key("FIIs", "Logística"): Decimal("0.5"),
                segment_meta_key("FIIs", "Papel"): Decimal("0.5"),
            },
        )
    )
    segment_orders = {
        order.ticker: order.qtd_calculada for order in segment_result.ordens
    }
    assert segment_orders == {"LOG11": Decimal("5"), "PAPR11": Decimal("5")}


def test_segment_zero_and_manual_ineligibility_are_reported() -> None:
    positions = [
        position("AAA11", segmento="Logística"),
        position("BBB11", segmento="Papel"),
        position("CCC11", segmento="Shopping"),
    ]
    result = calcular_rebalanceamento(
        request(
            positions,
            "100",
            metas_segmento={
                segment_meta_key("FIIs", "Logística"): Decimal("0.5"),
                segment_meta_key("FIIs", "Papel"): Decimal("0"),
                segment_meta_key("FIIs", "Shopping"): Decimal("0.5"),
            },
            ativos_bloqueados_manualmente={"CCC11"},
        )
    )

    blocked = {item.ticker: item.motivos for item in result.ativos_bloqueados}
    assert "meta do segmento igual a zero" in blocked["BBB11"]
    assert "ativo bloqueado manualmente" in blocked["CCC11"]
    assert {order.ticker for order in result.ordens} == {"AAA11"}


def test_ineligible_positions_remain_in_current_portfolio_and_fallback_uses_meta() -> None:
    result = calcular_rebalanceamento(
        request(
            [
                position("AAA11", quantity="15", price="10"),
                position(
                    "BBB3",
                    classe="Ações",
                    quantity="5",
                    price="10",
                    enabled=False,
                ),
                position(
                    "CCC11",
                    quantity="1",
                    price="11",
                    ceiling="10",
                ),
                position(
                    "DDD11",
                    quantity="1",
                    price="0",
                ),
            ],
            "10",
            metas_classe={"FIIs": Decimal("0.5"), "Ações": Decimal("0.5")},
        )
    )

    assert result.patrimonio_atual == Decimal("211.00")
    assert [(order.ticker, order.qtd_calculada) for order in result.ordens] == [
        ("AAA11", Decimal("1"))
    ]
    blocked = {item.ticker: item.motivos for item in result.ativos_bloqueados}
    assert "aporte desabilitado para o ativo" in blocked["BBB3"]
    assert "preço atual acima do teto manual configurado" in blocked["CCC11"]
    assert "preço atual menor ou igual a zero" in blocked["DDD11"]


def test_yellow_semaphore_reduces_target_and_red_semaphore_blocks() -> None:
    positions = [
        position("AMARELO", price="10", quantity="10"),
        position("VERMELHO", price="10", quantity="10"),
    ]
    result = calcular_rebalanceamento(
        request(
            positions,
            "100",
            semaforos={
                "AMARELO": FiiSemaphoreAssessment(
                    semaforo="AMARELO", regras_acionadas=["dado ausente (p. 2)"]
                ),
                "VERMELHO": FiiSemaphoreAssessment(
                    semaforo="VERMELHO", regras_acionadas=["limite excedido (p. 3)"]
                ),
            },
            fator_reducao_amarelo=Decimal("0.5"),
        )
    )

    assert len(result.ordens) == 1
    assert result.ordens[0].ticker == "AMARELO"
    assert result.ordens[0].semaforo == "AMARELO"
    assert result.ordens[0].gatilhos_disparados == ["dado ausente (p. 2)"]
    assert result.ativos_bloqueados[0].ticker == "VERMELHO"


def test_greedy_residual_optimizer_spends_only_affordable_whole_units() -> None:
    result = calcular_rebalanceamento(
        request(
            [
                position("AAA11", price="6", quantity="10"),
                position("BBB11", price="10", quantity="6"),
            ],
            "15",
        )
    )

    orders = {order.ticker: order for order in result.ordens}
    assert orders["AAA11"].qtd_calculada == Decimal("2")
    assert "BBB11" not in orders
    assert result.total_alocado == Decimal("12.00")
    assert result.troco_residual == Decimal("3.00")
    assert result.total_alocado + result.troco_residual == result.aporte_disponivel


def test_tesouro_order_below_minimum_stays_as_residual() -> None:
    result = calcular_rebalanceamento(
        request(
            [
                position(
                    "TESOURO",
                    classe="Tesouro",
                    segmento="Prefixado",
                    quantity="0",
                    average="0",
                    price="100",
                )
            ],
            "20",
            minimo_tesouro_direto=Decimal("30"),
        )
    )

    assert result.ordens == []
    assert result.total_alocado == Decimal("0.00")
    assert result.troco_residual == Decimal("20.00")


def test_class_targets_must_sum_to_one_with_tolerance() -> None:
    with pytest.raises(ValidationError, match="soma de metas_classe"):
        request(
            [position("AAA11")],
            "10",
            metas_classe={"FIIs": Decimal("0.8"), "Ações": Decimal("0.199")},
        )

    valid = request(
        [position("AAA11")],
        "10",
        metas_classe={"FIIs": Decimal("0.8"), "Ações": Decimal("0.19995")},
    )
    assert valid.metas_classe["FIIs"] == Decimal("0.8")
