import hashlib
import json
import logging
import os
import threading
import time
from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Annotated, Any

from google import genai
from google.genai.errors import APIError
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, GetJsonSchemaHandler, ValidationError
from pydantic_core import CoreSchema

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = (
    "Considere exclusivamente relatórios gerenciais públicos de FIIs publicados "
    "em Fundos.NET/CVM. Extraia somente fatos objetivos presentes nesse documento. "
    "Retorne null quando um dado não constar; não infira, não estime e não invente "
    "valores. Informe sempre pagina_fonte em cada seção e fato extraído, usando a "
    "página do PDF iniciada em 1. Nunca emita opinião, nota, avaliação subjetiva "
    "ou orientação prescritiva de investimento. O hash_pdf_sha256 é fornecido "
    "externamente: reproduza exatamente o valor recebido."
)
EXTRACTION_PROMPT = (
    "Extraia os campos estruturados do relatório gerencial de FII anexado. "
    "Use null para campos numéricos ou descritivos ausentes e inclua pagina_fonte "
    "em todas as seções. hash_pdf_sha256 deste documento: {pdf_hash}."
)
DEFAULT_MODEL = "gemini-2.5-flash"
PDF_CACHE_TTL_SECONDS = 3600
PDF_CACHE_REUSE_MARGIN_SECONDS = 60


class _DecimalJsonNumber:
    def __get_pydantic_json_schema__(
        self,
        core_schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> dict[str, Any]:
        schema = handler(core_schema)
        numeric_schema = {
            key: value
            for key, value in schema.items()
            if key not in {"anyOf", "type"}
        }
        numeric_schema["type"] = "number"
        return numeric_schema


DecimalNumber = Annotated[Decimal, _DecimalJsonNumber()]
Percentual = Annotated[
    DecimalNumber | None,
    Field(
        ge=Decimal("0"),
        le=Decimal("100"),
        json_schema_extra={"minimum": 0, "maximum": 100},
    ),
]
ValorMonetario = Annotated[
    DecimalNumber | None,
    Field(ge=Decimal("0"), json_schema_extra={"minimum": 0}),
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class IndicadoresFinanceirosDados(StrictModel):
    patrimonio_liquido_brl: ValorMonetario = None
    valor_patrimonial_cota_brl: ValorMonetario = None
    caixa_brl: ValorMonetario = None
    p_vp: Annotated[
        DecimalNumber | None,
        Field(
            default=None,
            ge=Decimal("0"),
            json_schema_extra={"minimum": 0},
        ),
    ] = None
    rendimentos_distribuidos_cota_brl: ValorMonetario = None
    dividend_yield_pct: Percentual = None


class IndicadoresFinanceiros(StrictModel):
    pagina_fonte: int = Field(ge=1)
    dados: IndicadoresFinanceirosDados


class MaiorInquilino(StrictModel):
    nome: str | None
    concentracao_pct: Percentual


class IndicadoresImobiliarios(StrictModel):
    pagina_fonte: int = Field(ge=1)
    vacancia_fisica_pct: Percentual
    vacancia_financeira_pct: Percentual
    area_locavel_m2: ValorMonetario = None
    maior_inquilino: MaiorInquilino | None = None
    numero_imoveis: int | None = Field(default=None, ge=0)


class Alavancagem(StrictModel):
    pagina_fonte: int = Field(ge=1)
    indicada: bool
    percentual_sobre_patrimonio: Annotated[
        DecimalNumber | None,
        Field(ge=Decimal("0"), json_schema_extra={"minimum": 0}),
    ]
    descricao: str | None = None


class GuidanceDividendos(StrictModel):
    pagina_fonte: int = Field(ge=1)
    descricao: str | None
    valor_estimado_cota_brl: ValorMonetario = None
    periodo: str | None = None


class FatoRelevante(StrictModel):
    pagina_fonte: int = Field(ge=1)
    descricao: str = Field(min_length=1)
    data: date | None = None
    categoria: str | None = None


class FiiReportExtraction(StrictModel):
    ticker: str = Field(pattern=r"^[A-Z]{4}11$")
    competencia: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    gestora: str = Field(min_length=1)
    hash_pdf_sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    indicadores_financeiros: IndicadoresFinanceiros
    indicadores_imobiliarios: IndicadoresImobiliarios
    alavancagem: Alavancagem
    guidance_dividendos: GuidanceDividendos
    fatos_relevantes: list[FatoRelevante]


class _PdfCacheEntry:
    def __init__(self, name: str, expires_at: float) -> None:
        self.name = name
        self.expires_at = expires_at


_CACHE_LOCK = threading.RLock()
_PDF_CACHE: dict[tuple[str, str], _PdfCacheEntry] = {}
_EXTRACTION_CACHE: dict[tuple[str, str], FiiReportExtraction] = {}


class GeminiApiKeyMissingError(RuntimeError):
    """Raised when the Gemini API key is not configured."""


class GeminiExtractionError(RuntimeError):
    """Raised when the Gemini response cannot be validated."""


def _resolve_model(model: str | None = None) -> str:
    return model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL


def _create_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiApiKeyMissingError("GEMINI_API_KEY não está configurada.")
    return genai.Client(api_key=api_key)


def _get_pdf_hash(pdf_bytes: bytes) -> str:
    return hashlib.sha256(pdf_bytes).hexdigest()


def create_or_reuse_pdf_cache(
    pdf_bytes: bytes,
    *,
    client: genai.Client | None = None,
    model: str | None = None,
) -> str | None:
    pdf_hash = _get_pdf_hash(pdf_bytes)
    model_name = _resolve_model(model)
    gemini_client = client or _create_client()
    cache_key = (model_name, pdf_hash)

    with _CACHE_LOCK:
        existing = _PDF_CACHE.get(cache_key)
        if existing and existing.expires_at > (
            time.monotonic() + PDF_CACHE_REUSE_MARGIN_SECONDS
        ):
            return existing.name

        file_buffer = BytesIO(pdf_bytes)
        file_buffer.name = f"fii-report-{pdf_hash}.pdf"
        try:
            uploaded_file = gemini_client.files.upload(
                file=file_buffer,
                config=types.UploadFileConfig(
                    display_name=f"fii-report-{pdf_hash}.pdf",
                    mime_type="application/pdf",
                ),
            )
            cached_content = gemini_client.caches.create(
                model=model_name,
                config=types.CreateCachedContentConfig(
                    contents=[uploaded_file],
                    system_instruction=SYSTEM_INSTRUCTION,
                    ttl=f"{PDF_CACHE_TTL_SECONDS}s",
                ),
            )
        except APIError:
            logger.warning(
                "Context caching indisponível para o PDF %s; usando bytes inline.",
                pdf_hash,
                exc_info=True,
            )
            return None
        if not cached_content.name:
            raise GeminiExtractionError("A API Gemini não retornou o identificador do cache.")

        cache_entry = _PdfCacheEntry(
            cached_content.name,
            time.monotonic() + PDF_CACHE_TTL_SECONDS,
        )
        _PDF_CACHE[cache_key] = cache_entry
        return cache_entry.name


def _parse_response(response: Any) -> FiiReportExtraction:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, FiiReportExtraction):
        return parsed
    if parsed is not None:
        try:
            response_json = json.dumps(parsed, default=str, ensure_ascii=False)
            return FiiReportExtraction.model_validate_json(response_json)
        except (TypeError, ValueError, ValidationError) as error:
            raise GeminiExtractionError(
                "A resposta estruturada do Gemini não corresponde ao contrato."
            ) from error

    response_text = getattr(response, "text", None)
    if not response_text:
        raise GeminiExtractionError("O Gemini retornou uma resposta vazia.")
    try:
        return FiiReportExtraction.model_validate_json(response_text)
    except (ValueError, ValidationError) as error:
        raise GeminiExtractionError(
            "A resposta estruturada do Gemini não corresponde ao contrato."
        ) from error


def extract_fii_report(
    pdf_bytes: bytes,
    *,
    client: genai.Client | None = None,
    model: str | None = None,
) -> FiiReportExtraction:
    pdf_hash = _get_pdf_hash(pdf_bytes)
    model_name = _resolve_model(model)
    gemini_client = client or _create_client()
    extraction_key = (model_name, pdf_hash)

    with _CACHE_LOCK:
        cached_report = _EXTRACTION_CACHE.get(extraction_key)
        if cached_report is not None:
            return cached_report.model_copy(deep=True)

        cached_content_name = create_or_reuse_pdf_cache(
            pdf_bytes,
            client=gemini_client,
            model=model_name,
        )
        prompt = EXTRACTION_PROMPT.format(pdf_hash=pdf_hash)
        generation_config: dict[str, Any] = {
            "response_mime_type": "application/json",
            "response_schema": FiiReportExtraction,
            "temperature": 0.0,
        }
        if cached_content_name:
            generation_config["cached_content"] = cached_content_name
            contents: str | list[types.Part] = prompt
        else:
            generation_config["system_instruction"] = SYSTEM_INSTRUCTION
            contents = [
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                prompt,
            ]
        response = gemini_client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(**generation_config),
        )
        report = _parse_response(response).model_copy(
            update={"hash_pdf_sha256": pdf_hash}
        )
        _EXTRACTION_CACHE[extraction_key] = report
        return report.model_copy(deep=True)


def clear_extractor_caches() -> None:
    """Clear process-local caches; intended for tests and controlled maintenance."""
    with _CACHE_LOCK:
        _PDF_CACHE.clear()
        _EXTRACTION_CACHE.clear()
