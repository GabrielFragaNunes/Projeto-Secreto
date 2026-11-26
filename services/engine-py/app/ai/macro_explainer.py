import json
import os
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.integrations.bcb_olinda import MacroFocusSnapshot

DEFAULT_MODEL = "gemini-2.5-flash"

SYSTEM_INSTRUCTION = (
    "Atue como tradutor educativo de dados macroeconômicos. Use somente os "
    "indicadores do Boletim Focus e a distribuição por classe informados. "
    "Explique relações gerais e não determinísticas entre Selic, IPCA, PIB e "
    "classes patrimoniais, incluindo mecanismos possíveis para títulos "
    "indexados à inflação e fundos imobiliários de tijolo ou papel. Diferencie "
    "mecanismos econômicos de previsões. Não apresente orientação nem instrução "
    "para alterar metas, aportes, composição patrimonial ou realizar operações "
    "com ativos. Não calcule nem reinterprete os pesos. Responda em português "
    "do Brasil e somente no formato definido pelo schema."
)

AssetClass = Literal["FIIs", "Ações", "Tesouro", "ETF", "FIAGRO", "Renda Fixa"]
FinitePercentage = Annotated[Decimal, Field(ge=Decimal("0"), le=Decimal("100"))]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class MacroClassDistribution(StrictModel):
    classe: AssetClass
    percentual_atual: FinitePercentage
    percentual_alvo: FinitePercentage

    @field_validator("percentual_atual", "percentual_alvo", mode="before")
    @classmethod
    def parse_json_decimal(cls, value: Any) -> Decimal:
        if isinstance(value, bool):
            raise ValueError("o percentual deve ser um número")
        try:
            return value if isinstance(value, Decimal) else Decimal(str(value))
        except (InvalidOperation, ValueError) as error:
            raise ValueError("o percentual deve ser um número decimal") from error

    @field_validator("percentual_atual", "percentual_alvo")
    @classmethod
    def validate_finite_percentages(cls, value: Decimal) -> Decimal:
        if not value.is_finite():
            raise ValueError("o percentual deve ser um número finito")
        return value


class MacroExplainRequest(StrictModel):
    snapshot: MacroFocusSnapshot | None = None
    distribuicao_por_classe: list[MacroClassDistribution] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_classes(self) -> "MacroExplainRequest":
        classes = [item.classe for item in self.distribuicao_por_classe]
        if len(classes) != len(set(classes)):
            raise ValueError("cada classe deve aparecer uma única vez")
        return self


class MacroClassExplanation(StrictModel):
    classe: AssetClass
    sensibilidade_macro: str = Field(min_length=1, max_length=160)
    explicacao_educativa: str = Field(min_length=1, max_length=1200)


class MacroExplanation(StrictModel):
    explicacoes_por_classe: list[MacroClassExplanation] = Field(min_length=1)


class MacroGeminiApiKeyMissingError(RuntimeError):
    """Raised when the Gemini API key is not configured."""


class MacroExplanationError(RuntimeError):
    """Raised when Gemini returns an invalid macro explanation."""


def _create_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise MacroGeminiApiKeyMissingError("GEMINI_API_KEY não está configurada.")
    return genai.Client(api_key=api_key)


def _resolve_model(model: str | None = None) -> str:
    return model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL


def _build_prompt(
    snapshot: MacroFocusSnapshot,
    distribution: list[MacroClassDistribution],
) -> str:
    objective_snapshot = snapshot.model_dump(
        mode="json",
        include={"data_referencia", "indicadores"},
    )
    objective_distribution = [
        item.model_dump(mode="json") for item in distribution
    ]
    return (
        "Produza uma explicação educativa, separada por cada classe recebida. "
        "Use os pesos apenas como contexto descritivo e não recompute percentuais. "
        "Dados objetivos:\n"
        + json.dumps(
            {
                "snapshot_focus": objective_snapshot,
                "distribuicao_por_classe": objective_distribution,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


def _parse_response(response: Any) -> MacroExplanation:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, MacroExplanation):
        explanation = parsed
    elif parsed is not None:
        try:
            explanation = MacroExplanation.model_validate(parsed)
        except ValidationError as error:
            raise MacroExplanationError(
                "A resposta do Gemini não corresponde ao contrato educativo."
            ) from error
    else:
        response_text = getattr(response, "text", None)
        if not response_text:
            raise MacroExplanationError("O Gemini retornou uma resposta vazia.")
        try:
            explanation = MacroExplanation.model_validate_json(response_text)
        except (ValueError, ValidationError) as error:
            raise MacroExplanationError(
                "A resposta do Gemini não corresponde ao contrato educativo."
            ) from error
    return explanation


def explain_macro(
    snapshot: MacroFocusSnapshot,
    distribution: list[MacroClassDistribution],
    *,
    client: genai.Client | None = None,
    model: str | None = None,
) -> MacroExplanation:
    request = MacroExplainRequest(
        snapshot=snapshot,
        distribuicao_por_classe=distribution,
    )
    gemini_client = client or _create_client()
    response = gemini_client.models.generate_content(
        model=_resolve_model(model),
        contents=_build_prompt(snapshot, request.distribuicao_por_classe),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MacroExplanation,
            temperature=0.0,
            system_instruction=SYSTEM_INSTRUCTION,
        ),
    )
    explanation = _parse_response(response)
    expected_classes = {
        item.classe for item in request.distribuicao_por_classe
    }
    returned_classes = [
        item.classe for item in explanation.explicacoes_por_classe
    ]
    if len(returned_classes) != len(set(returned_classes)) or set(
        returned_classes
    ) != expected_classes:
        raise MacroExplanationError(
            "A resposta do Gemini não contém exatamente as classes informadas."
        )
    return explanation
