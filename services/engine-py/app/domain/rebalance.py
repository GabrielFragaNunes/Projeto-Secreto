from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.fii_risk import (
    FiiSemaphoreAssessment,
    SemaphoreThresholds,
    avaliar_semaforo_fii,
)

CENT = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")
WHOLE_UNIT = Decimal("1")
TREASURY_UNIT = Decimal("0.01")
TREASURY_MINIMUM_ORDER = Decimal("30.00")


def _decimal_value(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (Decimal, int, float, str)):
        raise ValueError("O valor deve ser numérico.")
    try:
        result = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValueError("O valor deve ser numérico.") from error
    if not result.is_finite():
        raise ValueError("O valor deve ser finito.")
    return result


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _percentage(value: Decimal) -> Decimal:
    return value.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PortfolioPosition(StrictModel):
    ticker: str = Field(min_length=1)
    classe: str = Field(min_length=1)
    segmento: str = "Outros"
    quantidade: Decimal = Field(ge=Decimal("0"))
    preco_medio: Decimal | None = Field(default=None, ge=Decimal("0"))
    preco_atual: Decimal = Field(gt=Decimal("0"))
    habilitado_aporte: bool = True
    preco_teto_manual: Decimal | None = Field(default=None, ge=Decimal("0"))
    meta_alocacao_pct: Decimal | None = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )

    @field_validator(
        "quantidade",
        "preco_medio",
        "preco_atual",
        "preco_teto_manual",
        "meta_alocacao_pct",
        mode="before",
    )
    @classmethod
    def parse_decimal_fields(cls, value: object) -> Decimal | None:
        return None if value is None else _decimal_value(value)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("O ticker não pode estar vazio.")
        return normalized


class FiiFacts(StrictModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    vacancia_fisica_pct: Decimal | None = None
    vacancia_financeira_pct: Decimal | None = None
    alavancagem_indicada: bool = False
    alavancagem_pct: Decimal | None = None
    pagina_indicadores_imobiliarios: int = Field(default=1, ge=1)
    pagina_alavancagem: int = Field(default=1, ge=1)

    @model_validator(mode="before")
    @classmethod
    def flatten_report_payload(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value

        payload = dict(value)
        indicators = payload.get("indicadores_imobiliarios")
        if isinstance(indicators, dict):
            payload.setdefault(
                "vacancia_fisica_pct", indicators.get("vacancia_fisica_pct")
            )
            payload.setdefault(
                "vacancia_financeira_pct",
                indicators.get("vacancia_financeira_pct"),
            )
            payload.setdefault(
                "pagina_indicadores_imobiliarios",
                indicators.get("pagina_fonte", 1),
            )
            payload.pop("indicadores_imobiliarios", None)

        leverage = payload.get("alavancagem")
        if isinstance(leverage, dict):
            payload.setdefault("alavancagem_indicada", leverage.get("indicada", False))
            payload.setdefault(
                "alavancagem_pct",
                leverage.get("percentual_sobre_patrimonio"),
            )
            payload.setdefault("pagina_alavancagem", leverage.get("pagina_fonte", 1))
            payload.pop("alavancagem", None)
        elif isinstance(leverage, bool):
            payload.setdefault("alavancagem_indicada", leverage)
        elif isinstance(leverage, (Decimal, int, float)):
            payload.setdefault("alavancagem_pct", leverage)
            payload.setdefault("alavancagem_indicada", leverage > 0)

        source_page = payload.get("pagina_fonte")
        if isinstance(source_page, int):
            payload.setdefault("pagina_indicadores_imobiliarios", source_page)
            payload.setdefault("pagina_alavancagem", source_page)
        return payload

    @field_validator(
        "vacancia_fisica_pct",
        "vacancia_financeira_pct",
        "alavancagem_pct",
        mode="before",
    )
    @classmethod
    def parse_decimal_fields(cls, value: object) -> Decimal | None:
        return None if value is None else _decimal_value(value)


class ConfiguredAsset(StrictModel):
    ticker: str = Field(min_length=1)
    classe: str = Field(min_length=1)
    segmento: str | None = None
    meta_alocacao_pct: Decimal | None = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )
    elegivel: bool = True

    @field_validator("meta_alocacao_pct", mode="before")
    @classmethod
    def parse_target(cls, value: object) -> Decimal | None:
        return None if value is None else _decimal_value(value)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("O ticker não pode estar vazio.")
        return normalized


class FiiThresholdPolicy(StrictModel):
    vacancia_fisica_max_pct: Decimal = Field(
        default=Decimal("25"), ge=Decimal("0"), le=Decimal("100")
    )
    vacancia_financeira_max_pct: Decimal = Field(
        default=Decimal("25"), ge=Decimal("0"), le=Decimal("100")
    )
    alavancagem_max_pct: Decimal | None = Field(default=None, ge=Decimal("0"))
    vacancia_financeira_amarelo_pct: Decimal | None = Field(
        default=None, ge=Decimal("0"), le=Decimal("100")
    )

    @field_validator(
        "vacancia_fisica_max_pct",
        "vacancia_financeira_max_pct",
        "alavancagem_max_pct",
        "vacancia_financeira_amarelo_pct",
        mode="before",
    )
    @classmethod
    def parse_decimal_fields(cls, value: object) -> Decimal | None:
        return None if value is None else _decimal_value(value)


class PortfolioPolicy(StrictModel):
    meta_patrimonial_brl: Decimal | None = Field(default=None, ge=Decimal("0"))
    aporte_mensal_padrao_brl: Decimal | None = Field(default=None, ge=Decimal("0"))
    metas_classe: dict[str, Decimal]
    metas_segmento: dict[str, Decimal] = Field(default_factory=dict)
    ativos_configurados: list[ConfiguredAsset] = Field(default_factory=list)
    gatilhos_semaforo_fii: FiiThresholdPolicy = Field(
        default_factory=FiiThresholdPolicy
    )
    filtros_quantitativos_acoes: dict[str, Decimal] = Field(default_factory=dict)
    controle_fiscal_ir: dict[str, Decimal | bool | str | None] = Field(
        default_factory=dict
    )
    acao_semaforo_vermelho: Literal["bloquear", "alertar"] = "bloquear"
    reducao_semaforo_amarelo_pct: Decimal = Field(
        default=Decimal("50"), ge=Decimal("0"), le=Decimal("100")
    )

    @field_validator(
        "meta_patrimonial_brl",
        "aporte_mensal_padrao_brl",
        "reducao_semaforo_amarelo_pct",
        mode="before",
    )
    @classmethod
    def parse_decimal_fields(cls, value: object) -> Decimal | None:
        return None if value is None else _decimal_value(value)

    @field_validator(
        "metas_classe",
        "metas_segmento",
        "filtros_quantitativos_acoes",
        mode="before",
    )
    @classmethod
    def parse_allocation_targets(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {key: _decimal_value(weight) for key, weight in value.items()}

    @field_validator("controle_fiscal_ir", mode="before")
    @classmethod
    def parse_tax_controls(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {
            key: (
                _decimal_value(item)
                if isinstance(item, (int, float, Decimal)) and not isinstance(item, bool)
                else item
            )
            for key, item in value.items()
        }

    @model_validator(mode="after")
    def validate_class_targets(self) -> PortfolioPolicy:
        if not self.metas_classe:
            raise ValueError("Configure metas de classe antes da simulação.")
        if any(weight < 0 or weight > 1 for weight in self.metas_classe.values()):
            raise ValueError("Cada meta de classe deve estar entre 0 e 1.")
        if sum(self.metas_classe.values(), Decimal("0")) != Decimal("1"):
            raise ValueError("A soma de metas_classe deve ser exatamente 1.00.")
        return self


class SimulationRequest(StrictModel):
    positions: list[PortfolioPosition]
    policy: PortfolioPolicy
    aporte_disponivel: Decimal = Field(ge=Decimal("0"))
    fii_facts: dict[str, FiiFacts] = Field(default_factory=dict)

    @field_validator("aporte_disponivel", mode="before")
    @classmethod
    def parse_contribution(cls, value: object) -> Decimal:
        return _decimal_value(value)

    @field_validator("fii_facts", mode="before")
    @classmethod
    def normalize_fact_tickers(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {ticker.strip().upper(): facts for ticker, facts in value.items()}


class CalculatedOrder(StrictModel):
    ticker: str
    classe: str
    segmento: str
    preco_atual: Decimal
    quantidade_calculada: Decimal
    total_estimado: Decimal
    preco_medio_atual: Decimal | None
    preco_medio_projetado: Decimal | None
    semaforo: Literal["VERDE", "AMARELO", "VERMELHO"] | None
    regras_acionadas: list[str]
    pagina_fonte: int | None


class ExcludedAsset(StrictModel):
    ticker: str
    classe: str
    motivo: str
    semaforo: Literal["VERDE", "AMARELO", "VERMELHO"] | None = None
    regras_acionadas: list[str] = Field(default_factory=list)
    pagina_fonte: int | None = None


class ClassComparison(StrictModel):
    classe: str
    patrimonio_atual_brl: Decimal
    meta_pct: Decimal
    percentual_atual: Decimal
    percentual_depois: Decimal


class SimulationResult(StrictModel):
    patrimonio_atual_brl: Decimal
    aporte_disponivel: Decimal
    total_alocado: Decimal
    troco_residual: Decimal
    eficiencia_aporte_pct: Decimal
    comparativo_classes: list[ClassComparison]
    ordens: list[CalculatedOrder]
    ativos_excluidos: list[ExcludedAsset]


def _split_cents(
    total: Decimal,
    weights: list[tuple[str, Decimal]],
) -> dict[str, Decimal]:
    if total <= 0 or not weights:
        return {key: Decimal("0.00") for key, _ in weights}
    positive = [(key, weight) for key, weight in weights if weight > 0]
    if not positive:
        return {key: Decimal("0.00") for key, _ in weights}

    total_cents = int((_money(total) / CENT).to_integral_value(rounding=ROUND_DOWN))
    weight_total = sum((weight for _, weight in positive), Decimal("0"))
    shares: dict[str, Decimal] = {}
    remainders: list[tuple[str, Decimal]] = []
    allocated_cents = 0
    for key, weight in positive:
        exact_cents = Decimal(total_cents) * weight / weight_total
        whole_cents = int(exact_cents.to_integral_value(rounding=ROUND_DOWN))
        shares[key] = Decimal(whole_cents) * CENT
        allocated_cents += whole_cents
        remainders.append((key, exact_cents - whole_cents))

    remainder_cents = total_cents - allocated_cents
    for key, _ in sorted(remainders, key=lambda item: (-item[1], item[0]))[
        :remainder_cents
    ]:
        shares[key] += CENT

    for key, _ in weights:
        shares.setdefault(key, Decimal("0.00"))
    return shares


def _order_quantity(budget: Decimal, price: Decimal, treasury: bool) -> Decimal:
    unit = TREASURY_UNIT if treasury else WHOLE_UNIT
    quantity = (budget / price / unit).to_integral_value(rounding=ROUND_DOWN) * unit
    if quantity <= 0:
        return Decimal("0")
    cost = _money(quantity * price)
    while cost > budget and quantity > 0:
        quantity -= unit
        cost = _money(quantity * price)
    if treasury and cost < TREASURY_MINIMUM_ORDER:
        return Decimal("0")
    return quantity


def _semaphore_for(
    position: PortfolioPosition,
    facts: FiiFacts | None,
    policy: PortfolioPolicy,
) -> FiiSemaphoreAssessment | None:
    if position.classe != "FIIs":
        return None

    report = facts or FiiFacts()
    thresholds = policy.gatilhos_semaforo_fii
    assessment = avaliar_semaforo_fii(
        vacancia_fisica_pct=report.vacancia_fisica_pct,
        vacancia_financeira_pct=report.vacancia_financeira_pct,
        pagina_indicadores_imobiliarios=report.pagina_indicadores_imobiliarios,
        alavancagem_indicada=report.alavancagem_indicada,
        alavancagem_pct=report.alavancagem_pct,
        pagina_alavancagem=report.pagina_alavancagem,
        thresholds=SemaphoreThresholds(
            vacancia_fisica_max_pct=thresholds.vacancia_fisica_max_pct,
            vacancia_financeira_max_pct=thresholds.vacancia_financeira_max_pct,
            alavancagem_max_pct=thresholds.alavancagem_max_pct,
        ),
    )

    yellow_limit = thresholds.vacancia_financeira_amarelo_pct
    if (
        assessment.semaforo == "VERDE"
        and yellow_limit is not None
        and report.vacancia_financeira_pct is not None
        and report.vacancia_financeira_pct > yellow_limit
    ):
        return FiiSemaphoreAssessment(
            semaforo="AMARELO",
            regras_acionadas=[
                f"vacancia_financeira_pct={report.vacancia_financeira_pct}% "
                f"acima do limite amarelo configurado de {yellow_limit}% "
                f"(p. {report.pagina_indicadores_imobiliarios})"
            ],
        )
    return assessment


def simulate_contribution(request: SimulationRequest) -> SimulationResult:
    positions = request.positions
    policy = request.policy
    contribution = _money(request.aporte_disponivel)
    current_values = {
        position.ticker: _money(position.quantidade * position.preco_atual)
        for position in positions
    }
    current_by_class: dict[str, Decimal] = {}
    for position in positions:
        current_by_class[position.classe] = (
            current_by_class.get(position.classe, Decimal("0"))
            + current_values[position.ticker]
        )

    current_total = sum(current_values.values(), Decimal("0.00"))
    post_contribution_total = current_total + contribution
    assessments: dict[str, FiiSemaphoreAssessment | None] = {}
    exclusions: list[ExcludedAsset] = []
    eligible_by_class: dict[str, list[PortfolioPosition]] = {}
    configured_assets = {asset.ticker: asset for asset in policy.ativos_configurados}

    for position in positions:
        assessment = _semaphore_for(
            position, request.fii_facts.get(position.ticker), policy
        )
        assessments[position.ticker] = assessment
        rules = assessment.regras_acionadas if assessment else []
        source_page = None
        facts = request.fii_facts.get(position.ticker)
        if facts and position.classe == "FIIs":
            source_page = facts.pagina_indicadores_imobiliarios

        configured = configured_assets.get(position.ticker)
        reason: str | None = None
        if not position.habilitado_aporte:
            reason = "Ativo desabilitado nas regras configuradas."
        elif configured is not None and not configured.elegivel:
            reason = "Ativo marcado como não elegível nas regras configuradas."
        elif (
            position.preco_teto_manual is not None
            and position.preco_atual > position.preco_teto_manual
        ):
            reason = "Preço atual acima do teto manual configurado."
        elif (
            assessment is not None
            and assessment.semaforo == "VERMELHO"
            and policy.acao_semaforo_vermelho == "bloquear"
        ):
            reason = "Gatilho vermelho configurado para bloquear o aporte."

        if reason is None:
            eligible_by_class.setdefault(position.classe, []).append(position)
        else:
            exclusions.append(
                ExcludedAsset(
                    ticker=position.ticker,
                    classe=position.classe,
                    motivo=reason,
                    semaforo=assessment.semaforo if assessment else None,
                    regras_acionadas=rules,
                    pagina_fonte=source_page,
                )
            )

    class_needs: dict[str, Decimal] = {}
    for asset_class, target_weight in policy.metas_classe.items():
        if not eligible_by_class.get(asset_class):
            class_needs[asset_class] = Decimal("0")
            continue
        target_value = _money(post_contribution_total * target_weight)
        need = max(
            Decimal("0"),
            target_value - current_by_class.get(asset_class, Decimal("0")),
        )
        class_needs[asset_class] = need

    total_need = sum(class_needs.values(), Decimal("0"))
    to_distribute = min(contribution, _money(total_need))
    class_budgets = _split_cents(
        to_distribute,
        [(asset_class, need) for asset_class, need in class_needs.items()],
    )

    orders: list[CalculatedOrder] = []
    order_values_by_class: dict[str, Decimal] = {}
    for asset_class in sorted(class_budgets):
        group = eligible_by_class.get(asset_class, [])
        class_budget = class_budgets[asset_class]
        if not group or class_budget <= 0:
            continue

        explicit_weights: dict[str, Decimal] = {}
        has_explicit_weights = False
        for position in group:
            configured = configured_assets.get(position.ticker)
            weight = (
                position.meta_alocacao_pct
                if position.meta_alocacao_pct is not None
                else configured.meta_alocacao_pct
                if configured is not None
                else None
            )
            if weight is not None:
                has_explicit_weights = True
                explicit_weights[position.ticker] = weight
        if has_explicit_weights:
            asset_weights = [
                (position.ticker, explicit_weights.get(position.ticker, Decimal("0")))
                for position in group
            ]
        else:
            asset_weights = [
                (position.ticker, current_values[position.ticker])
                for position in group
            ]

        if not any(weight > 0 for _, weight in asset_weights):
            for position in group:
                exclusions.append(
                    ExcludedAsset(
                        ticker=position.ticker,
                        classe=position.classe,
                        motivo="Não há peso explícito nem posição atual para distribuir o aporte.",
                    )
                )
            continue

        asset_budgets = _split_cents(class_budget, asset_weights)
        for position in sorted(group, key=lambda item: item.ticker):
            budget = asset_budgets.get(position.ticker, Decimal("0.00"))
            assessment = assessments[position.ticker]
            rules = assessment.regras_acionadas if assessment else []
            if assessment is not None and assessment.semaforo == "AMARELO":
                remaining_factor = (
                    Decimal("100") - policy.reducao_semaforo_amarelo_pct
                ) / Decimal("100")
                budget = _money(budget * remaining_factor)

            treasury = position.classe == "Tesouro"
            quantity = _order_quantity(budget, position.preco_atual, treasury)
            if quantity <= 0:
                if budget > 0:
                    exclusions.append(
                        ExcludedAsset(
                            ticker=position.ticker,
                            classe=position.classe,
                            motivo=(
                                "Aporte distribuído abaixo da unidade mínima ou "
                                "do mínimo de R$ 30,00 do Tesouro Direto."
                            ),
                            semaforo=assessment.semaforo if assessment else None,
                            regras_acionadas=rules,
                        )
                    )
                continue

            estimated_total = _money(quantity * position.preco_atual)
            new_quantity = position.quantidade + quantity
            projected_average = (
                None
                if position.preco_medio is None
                else (
                    position.quantidade * position.preco_medio
                    + quantity * position.preco_atual
                )
                / new_quantity
            )
            source_page = None
            facts = request.fii_facts.get(position.ticker)
            if facts and position.classe == "FIIs":
                source_page = facts.pagina_indicadores_imobiliarios
            orders.append(
                CalculatedOrder(
                    ticker=position.ticker,
                    classe=position.classe,
                    segmento=position.segmento,
                    preco_atual=position.preco_atual,
                    quantidade_calculada=quantity,
                    total_estimado=estimated_total,
                    preco_medio_atual=position.preco_medio,
                    preco_medio_projetado=(
                        projected_average.quantize(
                            FOUR_PLACES, rounding=ROUND_HALF_UP
                        )
                        if projected_average is not None
                        else None
                    ),
                    semaforo=assessment.semaforo if assessment else None,
                    regras_acionadas=rules,
                    pagina_fonte=source_page,
                )
            )
            order_values_by_class[asset_class] = (
                order_values_by_class.get(asset_class, Decimal("0.00"))
                + estimated_total
            )

    allocated = _money(
        sum((order.total_estimado for order in orders), Decimal("0.00"))
    )
    residual = _money(contribution - allocated)
    if residual < 0:
        raise ArithmeticError("O total alocado excedeu o aporte disponível.")

    total_after = current_total + allocated
    class_comparison: list[ClassComparison] = []
    for asset_class, target_weight in sorted(policy.metas_classe.items()):
        class_current = current_by_class.get(asset_class, Decimal("0.00"))
        class_after = class_current + order_values_by_class.get(
            asset_class, Decimal("0.00")
        )
        before_pct = (
            _percentage(class_current / current_total * Decimal("100"))
            if current_total > 0
            else Decimal("0.0000")
        )
        after_pct = (
            _percentage(class_after / post_contribution_total * Decimal("100"))
            if post_contribution_total > 0
            else Decimal("0.0000")
        )
        class_comparison.append(
            ClassComparison(
                classe=asset_class,
                patrimonio_atual_brl=_money(class_current),
                meta_pct=_percentage(target_weight * Decimal("100")),
                percentual_atual=before_pct,
                percentual_depois=after_pct,
            )
        )

    efficiency = (
        _percentage(allocated / contribution * Decimal("100"))
        if contribution > 0
        else Decimal("0.0000")
    )
    return SimulationResult(
        patrimonio_atual_brl=_money(current_total),
        aporte_disponivel=contribution,
        total_alocado=allocated,
        troco_residual=residual,
        eficiencia_aporte_pct=efficiency,
        comparativo_classes=class_comparison,
        ordens=orders,
        ativos_excluidos=exclusions,
    )
