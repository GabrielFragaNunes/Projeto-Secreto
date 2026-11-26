import json
import os
import threading
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

BCB_FOCUS_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
    "ExpectativasMercadoAnuais"
)
BCB_FOCUS_SOURCE = BCB_FOCUS_URL
DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 10.0
MAX_ATTEMPTS = 2
MAX_CACHE_ENTRIES = 4
INDICATORS = ("Selic", "IPCA", "PIB Total")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class MacroFocusIndicator(StrictModel):
    indicador: Literal["Selic", "IPCA", "PIB Total"]
    ano_referencia: int = Field(ge=2000)
    mediana: Decimal
    data_pesquisa: date

    @field_validator("mediana", mode="before")
    @classmethod
    def parse_json_decimal(cls, value: Any) -> Decimal:
        if isinstance(value, bool):
            raise ValueError("a mediana deve ser um número")
        try:
            return value if isinstance(value, Decimal) else Decimal(str(value))
        except (InvalidOperation, ValueError) as error:
            raise ValueError("a mediana deve ser um número decimal") from error

    @field_validator("data_pesquisa", mode="before")
    @classmethod
    def parse_research_date(cls, value: Any) -> date:
        if type(value) is date:
            return value
        if isinstance(value, str):
            try:
                return date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("a data_pesquisa deve estar no formato ISO") from error
        raise ValueError("a data_pesquisa deve ser uma data")

    @field_validator("mediana")
    @classmethod
    def validate_finite_median(cls, value: Decimal) -> Decimal:
        if not value.is_finite():
            raise ValueError("a mediana deve ser um número finito")
        return value


class MacroFocusSnapshot(StrictModel):
    data_referencia: date
    indicadores: list[MacroFocusIndicator] = Field(min_length=6)
    fonte_oficial: str = BCB_FOCUS_SOURCE

    @field_validator("data_referencia", mode="before")
    @classmethod
    def parse_reference_date(cls, value: Any) -> date:
        if type(value) is date:
            return value
        if isinstance(value, str):
            try:
                return date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("a data_referencia deve estar no formato ISO") from error
        raise ValueError("a data_referencia deve ser uma data")

    @field_validator("indicadores")
    @classmethod
    def validate_unique_indicator_years(
        cls,
        values: list[MacroFocusIndicator],
    ) -> list[MacroFocusIndicator]:
        keys = [(item.indicador, item.ano_referencia) for item in values]
        if len(keys) != len(set(keys)):
            raise ValueError("há indicadores repetidos para o mesmo ano")
        return values


class BCBFocusUnavailableError(RuntimeError):
    """Raised when the public BCB Focus data cannot be retrieved or validated."""


_CACHE_LOCK = threading.Lock()
_CACHE: dict[int, tuple[float, MacroFocusSnapshot]] = {}


def _resolve_cache_ttl(ttl_seconds: int | None) -> int:
    if ttl_seconds is not None:
        if isinstance(ttl_seconds, bool) or ttl_seconds <= 0:
            raise ValueError("o TTL do cache deve ser um inteiro positivo")
        return ttl_seconds

    configured_ttl = os.getenv("BCB_FOCUS_CACHE_TTL_SECONDS")
    if configured_ttl is None:
        return DEFAULT_CACHE_TTL_SECONDS
    try:
        resolved_ttl = int(configured_ttl)
    except ValueError as error:
        raise ValueError(
            "BCB_FOCUS_CACHE_TTL_SECONDS deve ser um inteiro positivo"
        ) from error
    if resolved_ttl <= 0:
        raise ValueError("BCB_FOCUS_CACHE_TTL_SECONDS deve ser um inteiro positivo")
    return resolved_ttl


def _request_params(current_year: int) -> dict[str, str]:
    next_year = current_year + 1
    years_filter = (
        f"(DataReferencia eq '{current_year}' or "
        f"DataReferencia eq '{next_year}')"
    )
    indicator_filter = " or ".join(
        f"Indicador eq '{indicator}'" for indicator in INDICATORS
    )
    return {
        "$filter": f"({indicator_filter}) and {years_filter} and baseCalculo eq 0",
        "$select": "Indicador,Data,DataReferencia,Mediana,baseCalculo",
        "$orderby": "Data desc",
        "$top": "1000",
        "$format": "json",
    }


def _fetch_rows(client: httpx.Client, current_year: int) -> list[dict[str, Any]]:
    params = _request_params(current_year)
    last_error: Exception | None = None

    for attempt in range(MAX_ATTEMPTS):
        try:
            response = client.get(
                BCB_FOCUS_URL,
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = json.loads(response.text, parse_float=Decimal)
            rows = payload.get("value") if isinstance(payload, dict) else None
            if not isinstance(rows, list):
                raise ValueError("a resposta Olinda não contém a lista value")
            return [row for row in rows if isinstance(row, dict)]
        except httpx.HTTPStatusError as error:
            last_error = error
            status_code = error.response.status_code
            if status_code < 500 and status_code != 429:
                break
        except (httpx.RequestError, json.JSONDecodeError, ValueError) as error:
            last_error = error

        if attempt + 1 < MAX_ATTEMPTS:
            time.sleep(0.1)

    raise BCBFocusUnavailableError(
        "Não foi possível obter as expectativas mais recentes do Banco Central."
    ) from last_error


def _parse_snapshot(
    rows: list[dict[str, Any]],
    current_year: int,
) -> MacroFocusSnapshot:
    target_years = {current_year, current_year + 1}
    latest: dict[tuple[str, int], MacroFocusIndicator] = {}

    for row in rows:
        indicator_name = row.get("Indicador")
        if indicator_name not in INDICATORS or row.get("baseCalculo") != 0:
            continue

        try:
            reference_year = int(row["DataReferencia"])
            research_date = date.fromisoformat(str(row["Data"])[:10])
            median_value = row["Mediana"]
            median = (
                median_value
                if isinstance(median_value, Decimal)
                else Decimal(str(median_value))
            )
            item = MacroFocusIndicator(
                indicador=indicator_name,
                ano_referencia=reference_year,
                mediana=median,
                data_pesquisa=research_date,
            )
        except (KeyError, TypeError, ValueError, InvalidOperation, ValidationError):
            continue

        if reference_year not in target_years:
            continue
        key = (item.indicador, item.ano_referencia)
        existing = latest.get(key)
        if existing is None or item.data_pesquisa > existing.data_pesquisa:
            latest[key] = item

    expected_keys = {
        (indicator, year)
        for indicator in INDICATORS
        for year in target_years
    }
    missing_keys = expected_keys - latest.keys()
    if missing_keys:
        missing_summary = ", ".join(
            f"{indicator}/{year}" for indicator, year in sorted(missing_keys)
        )
        raise BCBFocusUnavailableError(
            f"A API do Banco Central não retornou todas as medianas esperadas: "
            f"{missing_summary}."
        )

    indicators = sorted(
        latest.values(),
        key=lambda item: (item.ano_referencia, INDICATORS.index(item.indicador)),
    )
    snapshot_date = max(item.data_pesquisa for item in indicators)
    return MacroFocusSnapshot(
        data_referencia=snapshot_date,
        indicadores=indicators,
        fonte_oficial=BCB_FOCUS_SOURCE,
    )


def get_macro_focus_snapshot(
    *,
    client: httpx.Client | None = None,
    today: date | None = None,
    ttl_seconds: int | None = None,
) -> MacroFocusSnapshot:
    current_date = today or date.today()
    current_year = current_date.year
    cache_ttl = _resolve_cache_ttl(ttl_seconds)
    now = time.monotonic()

    with _CACHE_LOCK:
        cached = _CACHE.get(current_year)
        if cached is not None and cached[0] > now:
            return cached[1].model_copy(deep=True)
        if cached is not None:
            del _CACHE[current_year]

        owns_client = client is None
        http_client = client or httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)
        try:
            snapshot = _parse_snapshot(
                _fetch_rows(http_client, current_year),
                current_year,
            )
        finally:
            if owns_client:
                http_client.close()

        _CACHE[current_year] = (
            time.monotonic() + cache_ttl,
            snapshot.model_copy(deep=True),
        )
        while len(_CACHE) > MAX_CACHE_ENTRIES:
            oldest_year = min(_CACHE)
            del _CACHE[oldest_year]
        return snapshot


def clear_macro_focus_cache() -> None:
    """Clear the process-local cache for tests and controlled maintenance."""
    with _CACHE_LOCK:
        _CACHE.clear()
