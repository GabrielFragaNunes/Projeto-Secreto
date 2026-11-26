from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from app.domain.models import (
    AssetClass,
    BlockedAssetInfo,
    ClassAllocationSummary,
    OrderCalculation,
    PositionItem,
    RebalanceRequest,
    SimulationResult,
)

CENT = Decimal("0.01")
ZERO = Decimal("0")
SHARE_CLASSES = {"FIIs", "Ações", "ETF", "FIAGRO"}
SEGMENT_KEY_SEPARATOR = "::"


def segment_meta_key(classe: str, segmento: str) -> str:
    """Return the flat-contract key for a class-specific segment target."""
    return f"{classe}{SEGMENT_KEY_SEPARATOR}{segmento}"


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _portfolio_value(position: PositionItem) -> Decimal:
    return _money(position.quantidade * position.preco_atual)


def _allocate_cents(total: Decimal, weights: dict[str, Decimal]) -> dict[str, Decimal]:
    positive_weights = {
        key: weight for key, weight in weights.items() if weight > ZERO
    }
    if not positive_weights or total <= ZERO:
        return {key: ZERO for key in weights}

    total_cents = int((_money(total) / CENT).to_integral_value(rounding=ROUND_DOWN))
    weight_total = sum(positive_weights.values(), ZERO)
    exact_cents = {
        key: Decimal(total_cents) * weight / weight_total
        for key, weight in positive_weights.items()
    }
    allocated_cents = {
        key: int(value.to_integral_value(rounding=ROUND_DOWN))
        for key, value in exact_cents.items()
    }
    remaining_cents = total_cents - sum(allocated_cents.values())
    remainder_order = sorted(
        positive_weights,
        key=lambda key: (-(exact_cents[key] - allocated_cents[key]), key),
    )
    for key in remainder_order[:remaining_cents]:
        allocated_cents[key] += 1

    return {
        key: Decimal(allocated_cents.get(key, 0)) * CENT for key in weights
    }


def _segment_weights_for_class(
    request: RebalanceRequest, classe: str, segments: set[str]
) -> dict[str, Decimal] | None:
    prefix = f"{classe}{SEGMENT_KEY_SEPARATOR}"
    specific = {
        key[len(prefix) :]: value
        for key, value in request.metas_segmento.items()
        if key.startswith(prefix)
    }
    if specific:
        return {segment: specific[segment] for segment in segments if segment in specific}

    generic = {
        segment: request.metas_segmento[segment]
        for segment in segments
        if segment in request.metas_segmento
    }
    return generic or None


def _blocked_reasons(
    position: PositionItem, request: RebalanceRequest
) -> list[str]:
    reasons: list[str] = []
    if not position.habilitado_aporte:
        reasons.append("aporte desabilitado para o ativo")
    if position.ticker in request.ativos_bloqueados_manualmente:
        reasons.append("ativo bloqueado manualmente")
    if position.preco_atual <= ZERO:
        reasons.append("preço atual menor ou igual a zero")
    if (
        position.preco_teto_manual is not None
        and position.preco_atual > position.preco_teto_manual
    ):
        reasons.append("preço atual acima do teto manual configurado")

    assessment = request.semaforos.get(position.ticker)
    if (
        assessment is not None
        and assessment.semaforo == "VERMELHO"
        and request.acao_semaforo_vermelho == "BLOQUEAR_APORTE"
    ):
        reasons.append("semáforo VERMELHO com bloqueio de aporte configurado")
    return reasons


def _quantity_for_budget(
    position: PositionItem,
    budget: Decimal,
    request: RebalanceRequest,
) -> tuple[Decimal, Decimal]:
    if budget <= ZERO or position.preco_atual <= ZERO:
        return ZERO, ZERO

    increment = Decimal("1") if position.classe in SHARE_CLASSES else Decimal("0.01")
    raw_quantity = budget / position.preco_atual / increment
    quantity = raw_quantity.to_integral_value(rounding=ROUND_DOWN) * increment
    total = _money(quantity * position.preco_atual)

    if (
        position.classe == "Tesouro"
        and total < request.minimo_tesouro_direto
    ):
        return ZERO, ZERO
    if total > budget:
        return ZERO, ZERO
    return quantity, total


def _class_and_segment_totals(
    positions: list[PositionItem],
) -> tuple[dict[str, Decimal], dict[tuple[str, str], Decimal], Decimal]:
    class_totals: dict[str, Decimal] = {}
    segment_totals: dict[tuple[str, str], Decimal] = {}
    total = ZERO
    for position in positions:
        value = _portfolio_value(position)
        total += value
        class_totals[position.classe] = class_totals.get(position.classe, ZERO) + value
        key = (position.classe, position.segmento)
        segment_totals[key] = segment_totals.get(key, ZERO) + value
    return class_totals, segment_totals, _money(total)


def _percentage(numerator: Decimal, denominator: Decimal) -> Decimal:
    if denominator <= ZERO:
        return ZERO.quantize(CENT)
    return (numerator * Decimal("100") / denominator).quantize(
        CENT, rounding=ROUND_HALF_UP
    )


def calcular_rebalanceamento(request: RebalanceRequest) -> SimulationResult:
    """Calculate a deterministic contribution simulation without generating sales."""
    positions = request.positions
    aporte = _money(request.aporte_disponivel)
    class_current, segment_current, patrimonio_atual = _class_and_segment_totals(
        positions
    )
    blocked_reasons = {
        position.ticker: _blocked_reasons(position, request)
        for position in positions
    }
    class_positions: dict[str, list[PositionItem]] = {}
    blocked_by_ticker: dict[str, list[str]] = {
        ticker: list(reasons)
        for ticker, reasons in blocked_reasons.items()
        if reasons
    }

    for position in positions:
        class_positions.setdefault(position.classe, []).append(position)

    eligible_by_class: dict[str, list[PositionItem]] = {}
    effective_segment_weights: dict[str, dict[str, Decimal] | None] = {}
    for classe, items in class_positions.items():
        class_meta = request.metas_classe.get(classe)
        if class_meta is None or class_meta == ZERO:
            for position in items:
                if not blocked_reasons[position.ticker]:
                    reason = (
                        "meta de classe igual a zero"
                        if class_meta == ZERO
                        else "meta de classe não configurada"
                    )
                    blocked_by_ticker.setdefault(position.ticker, []).append(reason)
            continue

        base_eligible = [
            position for position in items if not blocked_reasons[position.ticker]
        ]
        segments = {position.segmento for position in base_eligible}
        segment_weights = _segment_weights_for_class(request, classe, segments)
        effective_segment_weights[classe] = segment_weights
        eligible: list[PositionItem] = []
        for position in base_eligible:
            if segment_weights is None:
                eligible.append(position)
                continue
            if position.segmento not in segment_weights:
                blocked_by_ticker.setdefault(position.ticker, []).append(
                    "meta do segmento não configurada"
                )
            elif segment_weights[position.segmento] == ZERO:
                blocked_by_ticker.setdefault(position.ticker, []).append(
                    "meta do segmento igual a zero"
                )
            else:
                eligible.append(position)
        if eligible:
            eligible_by_class[classe] = eligible

    eligible_classes = {
        classe: items
        for classe, items in eligible_by_class.items()
        if request.metas_classe.get(classe, ZERO) > ZERO
    }
    total_target_patrimony = patrimonio_atual + aporte
    class_deficits = {
        classe: max(
            ZERO,
            total_target_patrimony * request.metas_classe[classe]
            - class_current.get(classe, ZERO),
        )
        for classe in eligible_classes
    }
    if sum(class_deficits.values(), ZERO) > ZERO:
        class_weights = class_deficits
    else:
        class_weights = {
            classe: request.metas_classe[classe] for classe in eligible_classes
        }
    class_budgets = _allocate_cents(aporte, class_weights)

    segment_budgets: dict[tuple[str, str], Decimal] = {}
    for classe, items in eligible_classes.items():
        class_budget = class_budgets.get(classe, ZERO)
        if class_budget <= ZERO:
            continue
        segment_weights = effective_segment_weights.get(classe)
        if segment_weights is None:
            segment_budgets[(classe, "*")] = class_budget
            continue

        current_by_segment: dict[str, Decimal] = {}
        items_by_segment: dict[str, list[PositionItem]] = {}
        for position in items:
            items_by_segment.setdefault(position.segmento, []).append(position)
            current_by_segment[position.segmento] = segment_current.get(
                (classe, position.segmento), ZERO
            )

        class_after_budget = class_current.get(classe, ZERO) + class_budget
        deficits = {
            segment: max(
                ZERO,
                class_after_budget * segment_weights[segment]
                - current_by_segment[segment],
            )
            for segment in items_by_segment
        }
        weights = (
            deficits
            if sum(deficits.values(), ZERO) > ZERO
            else {
                segment: segment_weights[segment]
                for segment in items_by_segment
            }
        )
        allocations = _allocate_cents(class_budget, weights)
        for segment, amount in allocations.items():
            segment_budgets[(classe, segment)] = amount

    asset_budgets: dict[str, Decimal] = {}
    for classe, items in eligible_classes.items():
        segment_weights = effective_segment_weights.get(classe)
        groups: dict[str, list[PositionItem]] = {}
        for position in items:
            group = position.segmento if segment_weights is not None else "*"
            groups.setdefault(group, []).append(position)

        for segment, group in groups.items():
            segment_budget = segment_budgets.get((classe, segment), ZERO)
            if segment_budget <= ZERO:
                continue
            average_target = (
                sum((_portfolio_value(item) for item in group), ZERO)
                + segment_budget
            ) / Decimal(len(group))
            deficits: dict[str, Decimal] = {}
            for position in group:
                assessment = request.semaforos.get(position.ticker)
                target = average_target
                if assessment is not None and assessment.semaforo == "AMARELO":
                    target *= request.fator_reducao_amarelo
                deficits[position.ticker] = max(
                    ZERO, target - _portfolio_value(position)
                )
            weights = (
                deficits
                if sum(deficits.values(), ZERO) > ZERO
                else {position.ticker: Decimal("1") for position in group}
            )
            allocations = _allocate_cents(segment_budget, weights)
            asset_budgets.update(allocations)

    orders_by_ticker: dict[str, Decimal] = {}
    costs_by_ticker: dict[str, Decimal] = {}
    position_by_ticker = {position.ticker: position for position in positions}
    for ticker, budget in asset_budgets.items():
        position = position_by_ticker[ticker]
        quantity, total = _quantity_for_budget(position, budget, request)
        if quantity > ZERO and total > ZERO:
            orders_by_ticker[ticker] = quantity
            costs_by_ticker[ticker] = total

    total_alocado = _money(sum(costs_by_ticker.values(), ZERO))
    troco = _money(aporte - total_alocado)

    while True:
        class_after_orders, segment_after_orders, _ = _class_and_segment_totals(positions)
        for ticker, cost in costs_by_ticker.items():
            position = position_by_ticker[ticker]
            class_after_orders[position.classe] = (
                class_after_orders.get(position.classe, ZERO) + cost
            )
            key = (position.classe, position.segmento)
            segment_after_orders[key] = segment_after_orders.get(key, ZERO) + cost

        candidates: list[tuple[Decimal, Decimal, Decimal, str]] = []
        incremental_costs: dict[str, Decimal] = {}
        for classe, items in eligible_classes.items():
            if classe not in SHARE_CLASSES:
                continue
            class_target = total_target_patrimony * request.metas_classe[classe]
            if class_target <= ZERO:
                continue
            seg_weights = effective_segment_weights.get(classe)
            distinct_segments = {item.segmento for item in items}
            for position in items:
                if position.preco_atual > troco:
                    continue
                current_quantity = orders_by_ticker.get(position.ticker, ZERO)
                current_order_cost = costs_by_ticker.get(position.ticker, ZERO)
                next_order_cost = _money(
                    (current_quantity + Decimal("1")) * position.preco_atual
                )
                incremental_cost = next_order_cost - current_order_cost
                if incremental_cost <= ZERO or incremental_cost > troco:
                    continue
                current_class = class_after_orders.get(classe, ZERO)
                class_gap_pct = (class_target - current_class) / class_target
                if seg_weights is None:
                    segment_target = class_target / Decimal(
                        max(len(distinct_segments), 1)
                    )
                else:
                    segment_target = (
                        class_target * seg_weights.get(position.segmento, ZERO)
                    )
                current_segment = segment_after_orders.get(
                    (classe, position.segmento), ZERO
                )
                segment_gap_pct = (
                    (segment_target - current_segment) / segment_target
                    if segment_target > ZERO
                    else ZERO
                )
                current_asset = _portfolio_value(position) + costs_by_ticker.get(
                    position.ticker, ZERO
                )
                candidates.append(
                    (-class_gap_pct, -segment_gap_pct, current_asset, position.ticker)
                )
                incremental_costs[position.ticker] = incremental_cost

        if not candidates:
            break
        _, _, _, selected_ticker = min(candidates)
        selected = position_by_ticker[selected_ticker]
        orders_by_ticker[selected_ticker] = (
            orders_by_ticker.get(selected_ticker, ZERO) + Decimal("1")
        )
        costs_by_ticker[selected_ticker] = (
            costs_by_ticker.get(selected_ticker, ZERO)
            + incremental_costs[selected_ticker]
        )
        total_alocado = _money(sum(costs_by_ticker.values(), ZERO))
        troco = _money(aporte - total_alocado)

    order_results: list[OrderCalculation] = []
    for ticker in sorted(orders_by_ticker):
        position = position_by_ticker[ticker]
        quantity = orders_by_ticker[ticker]
        total = _money(costs_by_ticker[ticker])
        assessment = request.semaforos.get(ticker)
        prior_quantity = position.quantidade
        prior_cost = prior_quantity * position.preco_medio
        projected_quantity = prior_quantity + quantity
        projected_average = (
            _money((prior_cost + total) / projected_quantity)
            if projected_quantity > ZERO
            else _money(position.preco_medio)
        )
        order_results.append(
            OrderCalculation(
                ticker=ticker,
                classe=position.classe,
                segmento=position.segmento,
                preco_atual=position.preco_atual,
                qtd_calculada=quantity,
                total_estimado=total,
                pm_anterior=_money(position.preco_medio),
                pm_projetado=projected_average,
                semaforo=assessment.semaforo if assessment is not None else None,
                gatilhos_disparados=(
                    assessment.regras_acionadas if assessment is not None else []
                ),
            )
        )

    allocated_by_class: dict[str, Decimal] = {}
    for ticker, cost in costs_by_ticker.items():
        classe = position_by_ticker[ticker].classe
        allocated_by_class[classe] = allocated_by_class.get(classe, ZERO) + cost

    class_summaries: list[ClassAllocationSummary] = []
    classes_to_summarize = sorted(set(request.metas_classe) | set(class_current))
    for classe in classes_to_summarize:
        meta = request.metas_classe.get(classe, ZERO)
        target = total_target_patrimony * meta
        current = class_current.get(classe, ZERO)
        after = current + allocated_by_class.get(classe, ZERO)
        class_summaries.append(
            ClassAllocationSummary(
                classe=classe,
                meta_pct=(meta * Decimal("100")).quantize(
                    CENT, rounding=ROUND_HALF_UP
                ),
                atual_pct=_percentage(current, patrimonio_atual),
                gap_brl=_money(target - current),
                aportado_brl=_money(allocated_by_class.get(classe, ZERO)),
                depois_pct=_percentage(after, patrimonio_atual + total_alocado),
            )
        )

    blocked_results = [
        BlockedAssetInfo(
            ticker=position.ticker,
            classe=position.classe,
            segmento=position.segmento,
            semaforo=(
                request.semaforos[position.ticker].semaforo
                if position.ticker in request.semaforos
                else None
            ),
            motivos=blocked_by_ticker[position.ticker],
        )
        for position in positions
        if blocked_by_ticker.get(position.ticker)
    ]

    if total_alocado + troco != aporte:
        raise ArithmeticError("a simulação não preservou o aporte disponível")
    return SimulationResult(
        patrimonio_atual=patrimonio_atual,
        aporte_disponivel=aporte,
        total_alocado=total_alocado,
        troco_residual=troco,
        eficiencia_pct=_percentage(total_alocado, aporte),
        ordens=order_results,
        resumo_classes=class_summaries,
        ativos_bloqueados=blocked_results,
    )
