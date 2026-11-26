from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SemaphoreThresholds(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    vacancia_fisica_max_pct: Decimal = Field(
        default=Decimal("25"), ge=Decimal("0"), le=Decimal("100")
    )
    vacancia_financeira_max_pct: Decimal = Field(
        default=Decimal("25"), ge=Decimal("0"), le=Decimal("100")
    )
    alavancagem_max_pct: Decimal | None = Field(default=None, ge=Decimal("0"))


class FiiSemaphoreAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    semaforo: Literal["VERDE", "AMARELO", "VERMELHO"]
    regras_acionadas: list[str]


def avaliar_semaforo_fii(
    *,
    vacancia_fisica_pct: Decimal | None,
    vacancia_financeira_pct: Decimal | None,
    pagina_indicadores_imobiliarios: int,
    alavancagem_indicada: bool,
    alavancagem_pct: Decimal | None,
    pagina_alavancagem: int,
    thresholds: SemaphoreThresholds,
) -> FiiSemaphoreAssessment:
    gatilhos_vermelhos: list[str] = []
    dados_indisponiveis: list[str] = []

    vacancy_metrics = (
        (
            "vacancia_fisica_pct",
            vacancia_fisica_pct,
            thresholds.vacancia_fisica_max_pct,
        ),
        (
            "vacancia_financeira_pct",
            vacancia_financeira_pct,
            thresholds.vacancia_financeira_max_pct,
        ),
    )
    for nome, valor, limite in vacancy_metrics:
        if valor is None:
            dados_indisponiveis.append(
                f"{nome} ausente no relatório (p. {pagina_indicadores_imobiliarios})"
            )
        elif valor > limite:
            gatilhos_vermelhos.append(
                f"{nome}={valor}% acima do limite configurado de {limite}% "
                f"(p. {pagina_indicadores_imobiliarios})"
            )

    if alavancagem_indicada:
        if alavancagem_pct is None:
            dados_indisponiveis.append(
                f"percentual de alavancagem ausente no relatório (p. {pagina_alavancagem})"
            )
        elif thresholds.alavancagem_max_pct is None:
            dados_indisponiveis.append(
                f"limite de alavancagem não configurado (p. {pagina_alavancagem})"
            )
        elif alavancagem_pct > thresholds.alavancagem_max_pct:
            gatilhos_vermelhos.append(
                f"alavancagem={alavancagem_pct}% acima do limite configurado de "
                f"{thresholds.alavancagem_max_pct}% (p. {pagina_alavancagem})"
            )

    if gatilhos_vermelhos:
        return FiiSemaphoreAssessment(
            semaforo="VERMELHO",
            regras_acionadas=gatilhos_vermelhos + dados_indisponiveis,
        )
    if dados_indisponiveis:
        return FiiSemaphoreAssessment(
            semaforo="AMARELO",
            regras_acionadas=dados_indisponiveis,
        )
    return FiiSemaphoreAssessment(semaforo="VERDE", regras_acionadas=[])
