from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.fii_risk import FiiSemaphoreAssessment

AssetClass = Literal["FIIs", "Ações", "Tesouro", "ETF", "FIAGRO", "Renda Fixa"]
Semaphore = Literal["VERDE", "AMARELO", "VERMELHO"]


class PositionItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ticker: str = Field(min_length=1)
    classe: AssetClass
    segmento: str = Field(default="Outros", min_length=1)
    quantidade: Decimal = Field(ge=Decimal("0"))
    preco_medio: Decimal = Field(ge=Decimal("0"))
    preco_atual: Decimal = Field(ge=Decimal("0"))
    habilitado_aporte: bool = True
    preco_teto_manual: Decimal | None = Field(default=None, ge=Decimal("0"))


class ImportXlsxResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    positions: list[PositionItem]
    total_ativos: int = Field(ge=0)
    patrimonio_total: Decimal
    resumo_por_classe: dict[str, Decimal]


class OrderCalculation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ticker: str
    classe: AssetClass
    segmento: str
    preco_atual: Decimal
    qtd_calculada: Decimal
    total_estimado: Decimal
    pm_anterior: Decimal
    pm_projetado: Decimal
    semaforo: Semaphore | None
    gatilhos_disparados: list[str]


class ClassAllocationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    classe: str
    meta_pct: Decimal
    atual_pct: Decimal
    gap_brl: Decimal
    aportado_brl: Decimal
    depois_pct: Decimal


class BlockedAssetInfo(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ticker: str
    classe: AssetClass
    segmento: str
    semaforo: Semaphore | None
    motivos: list[str]


class RebalanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    positions: list[PositionItem]
    aporte_disponivel: Decimal = Field(ge=Decimal("0"))
    metas_classe: dict[str, Decimal]
    metas_segmento: dict[str, Decimal] = Field(default_factory=dict)
    ativos_bloqueados_manualmente: set[str] = Field(default_factory=set)
    semaforos: dict[str, FiiSemaphoreAssessment] = Field(default_factory=dict)
    acao_semaforo_vermelho: Literal["BLOQUEAR_APORTE", "PERMITIR_APORTE"] = (
        "BLOQUEAR_APORTE"
    )
    fator_reducao_amarelo: Decimal = Field(
        default=Decimal("0.5"), ge=Decimal("0"), le=Decimal("1")
    )
    minimo_tesouro_direto: Decimal = Field(
        default=Decimal("30.00"), gt=Decimal("0")
    )

    @model_validator(mode="after")
    def validate_allocation_targets(self) -> "RebalanceRequest":
        if not self.metas_classe:
            raise ValueError("metas_classe deve conter metas configuradas")
        if any(value < 0 or value > 1 for value in self.metas_classe.values()):
            raise ValueError("metas_classe deve usar proporções entre 0 e 1")
        if abs(sum(self.metas_classe.values(), Decimal("0")) - Decimal("1")) > Decimal(
            "0.0001"
        ):
            raise ValueError("a soma de metas_classe deve ser 1.00")
        if any(value < 0 or value > 1 for value in self.metas_segmento.values()):
            raise ValueError("metas_segmento deve usar proporções entre 0 e 1")

        tickers = [position.ticker for position in self.positions]
        if len(tickers) != len(set(tickers)):
            raise ValueError("cada ticker deve aparecer uma única vez na carteira")
        return self


class SimulationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    patrimonio_atual: Decimal
    aporte_disponivel: Decimal
    total_alocado: Decimal
    troco_residual: Decimal
    eficiencia_pct: Decimal
    ordens: list[OrderCalculation]
    resumo_classes: list[ClassAllocationSummary]
    ativos_bloqueados: list[BlockedAssetInfo]
