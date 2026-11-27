import json
import logging
import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Any
from zipfile import BadZipFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from google.genai.errors import APIError
from pydantic import BaseModel, ValidationError

from app.ai.fii_extractor import (
    FiiReportExtraction,
    GeminiApiKeyMissingError,
    GeminiExtractionError,
    extract_fii_report,
)
from app.ai.macro_explainer import (
    MacroExplainRequest,
    MacroExplanation,
    MacroExplanationError,
    MacroGeminiApiKeyMissingError,
    explain_macro,
)
from app.domain.fii_risk import (
    FiiSemaphoreAssessment,
    SemaphoreThresholds,
    avaliar_semaforo_fii,
)
from app.domain.rebalance import (
    SimulationRequest,
    SimulationResult,
    simulate_contribution,
)
from app.integrations.bcb_olinda import (
    BCBFocusUnavailableError,
    MacroFocusSnapshot,
    get_macro_focus_snapshot,
)
from app.parsers.b3_xlsx import B3XlsxParseError, parse_b3_xlsx

logger = logging.getLogger(__name__)
router = APIRouter()
MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024
MAX_XLSX_SIZE_BYTES = 5 * 1024 * 1024


class FiiReportResponse(FiiReportExtraction):
    avaliacao_deterministica_usuario: FiiSemaphoreAssessment


class FiiFactsInput(FiiReportExtraction):
    avaliacao_deterministica_usuario: FiiSemaphoreAssessment | None = None


class DecimalJSONResponse(Response):
    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        marker_prefix = f"__decimal_{uuid.uuid4().hex}_"
        decimal_values: dict[str, str] = {}

        def prepare(value: Any) -> Any:
            if isinstance(value, Decimal):
                marker = f"{marker_prefix}{len(decimal_values)}__"
                decimal_values[marker] = format(value, "f")
                return marker
            if isinstance(value, BaseModel):
                return prepare(value.model_dump(mode="python"))
            if isinstance(value, (date, datetime)):
                return value.isoformat()
            if isinstance(value, dict):
                return {key: prepare(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [prepare(item) for item in value]
            return value

        serialized = json.dumps(
            prepare(content),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        for marker, decimal_value in decimal_values.items():
            serialized = serialized.replace(json.dumps(marker), decimal_value)
        return serialized.encode("utf-8")


class AporteSimulationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    positions: list[PositionItem]
    policy: RebalancePolicy
    aporte_disponivel: StrictDecimal = Field(ge=Decimal("0"))
    fii_facts: dict[str, FiiFactsInput] | None = None

    @model_validator(mode="after")
    def validate_fii_facts(self) -> "AporteSimulationInput":
        tickers = [position.ticker for position in self.positions]
        if len(tickers) != len(set(tickers)):
            raise ValueError("cada ticker deve aparecer uma única vez na carteira")
        if self.fii_facts is not None:
            for ticker, facts in self.fii_facts.items():
                if ticker != facts.ticker:
                    raise ValueError(
                        f"ticker da chave {ticker} difere do ticker dos fatos"
                    )
        return self


@router.post(
    "/v1/fii/extrair-pdf",
    response_model=FiiReportResponse,
    response_class=DecimalJSONResponse,
)
async def extrair_relatorio_fii(
    file: UploadFile = File(...),
    thresholds: str | None = Form(default=None),
) -> Response:
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="O arquivo enviado deve ser PDF.")
    if file.content_type not in (None, "application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail="O tipo de conteúdo deve ser PDF.")

    pdf_bytes = await file.read(MAX_PDF_SIZE_BYTES + 1)
    if len(pdf_bytes) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="O PDF excede o limite de 20 MB.")
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="O arquivo PDF está vazio.")

    try:
        semaphore_thresholds = (
            SemaphoreThresholds.model_validate_json(thresholds)
            if thresholds
            else SemaphoreThresholds()
        )
    except ValidationError as error:
        raise HTTPException(
            status_code=422,
            detail="O JSON de thresholds não corresponde ao contrato.",
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail="O JSON de thresholds é inválido.") from error

    try:
        report = await run_in_threadpool(extract_fii_report, pdf_bytes)
    except GeminiApiKeyMissingError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except APIError as error:
        logger.exception("Falha na API Gemini ao processar relatório de FII.")
        raise HTTPException(
            status_code=502,
            detail="O serviço de extração não concluiu o processamento do PDF.",
        ) from error
    except (GeminiExtractionError, ValidationError) as error:
        logger.exception("Resposta Gemini inválida para relatório de FII.")
        raise HTTPException(
            status_code=502,
            detail="A resposta de extração não corresponde ao contrato do relatório.",
        ) from error

    assessment = avaliar_semaforo_fii(
        vacancia_fisica_pct=report.indicadores_imobiliarios.vacancia_fisica_pct,
        vacancia_financeira_pct=report.indicadores_imobiliarios.vacancia_financeira_pct,
        pagina_indicadores_imobiliarios=report.indicadores_imobiliarios.pagina_fonte,
        alavancagem_indicada=report.alavancagem.indicada,
        alavancagem_pct=report.alavancagem.percentual_sobre_patrimonio,
        pagina_alavancagem=report.alavancagem.pagina_fonte,
        thresholds=semaphore_thresholds,
    )
    payload = FiiReportResponse.model_validate(
        {
            **report.model_dump(),
            "avaliacao_deterministica_usuario": assessment.model_dump(),
        }
    )
    return DecimalJSONResponse(content=payload)


@router.get(
    "/v1/macro/focus",
    response_model=MacroFocusSnapshot,
    response_class=DecimalJSONResponse,
)
async def obter_focus_macro() -> Response:
    try:
        snapshot = await run_in_threadpool(get_macro_focus_snapshot)
    except BCBFocusUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail="As expectativas do Banco Central estão temporariamente indisponíveis.",
        ) from error
    return DecimalJSONResponse(content=snapshot)


@router.post(
    "/v1/macro/explicar",
    response_model=MacroExplanation,
)
async def explicar_impacto_macro(payload: MacroExplainRequest) -> MacroExplanation:
    snapshot = payload.snapshot
    if snapshot is None:
        try:
            snapshot = await run_in_threadpool(get_macro_focus_snapshot)
        except BCBFocusUnavailableError as error:
            raise HTTPException(
                status_code=503,
                detail="As expectativas do Banco Central estão temporariamente indisponíveis.",
            ) from error

    try:
        return await run_in_threadpool(
            explain_macro,
            snapshot,
            payload.distribuicao_por_classe,
        )
    except MacroGeminiApiKeyMissingError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except APIError as error:
        logger.exception("Falha na API Gemini ao gerar leitura macroeconômica.")
        raise HTTPException(
            status_code=502,
            detail="O serviço de explicação macroeconômica não concluiu o processamento.",
        ) from error
    except MacroExplanationError as error:
        logger.exception("Resposta Gemini inválida para leitura macroeconômica.")
        raise HTTPException(
            status_code=502,
            detail="A resposta do serviço não corresponde ao contrato educativo.",
        ) from error


@router.post(
    "/v1/import/xlsx",
    response_class=DecimalJSONResponse,
)
async def importar_planilha_b3(file: UploadFile = File(...)) -> Response:
    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=415,
            detail="O arquivo enviado deve usar a extensão .xlsx.",
        )
    if file.content_type not in (
        None,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
    ):
        raise HTTPException(status_code=415, detail="O tipo de conteúdo deve ser XLSX.")

    content = await file.read(MAX_XLSX_SIZE_BYTES + 1)
    if len(content) > MAX_XLSX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="A planilha excede o limite de 5 MB.")
    try:
        result = await run_in_threadpool(parse_b3_xlsx, content)
    except B3XlsxParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return DecimalJSONResponse(content=result)


@router.post(
    "/v1/aporte/simular",
    response_model=SimulationResult,
    response_class=DecimalJSONResponse,
)
async def simular_aporte(payload: SimulationRequest) -> Response:
    result = simulate_contribution(payload)
    return DecimalJSONResponse(content=result)
