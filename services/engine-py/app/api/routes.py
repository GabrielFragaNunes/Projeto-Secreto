import json
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from google.genai.errors import APIError
from pydantic import BaseModel, ConfigDict, ValidationError

from app.ai.fii_extractor import (
    FiiReportExtraction,
    GeminiApiKeyMissingError,
    GeminiExtractionError,
    extract_fii_report,
)
from app.domain.fii_risk import (
    FiiSemaphoreAssessment,
    SemaphoreThresholds,
    avaliar_semaforo_fii,
)

logger = logging.getLogger(__name__)
router = APIRouter()
MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024


class FiiReportResponse(FiiReportExtraction):
    avaliacao_deterministica_usuario: FiiSemaphoreAssessment


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
