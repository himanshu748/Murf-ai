from __future__ import annotations

from pydantic import BaseModel


class SessionCreateResponse(BaseModel):
    session: str


class SessionHistoryResponse(BaseModel):
    session: str
    history: list[dict[str, str]]


class HealthResponse(BaseModel):
    server: str
    murf_api_key: bool
    assemblyai_api_key: bool
    perplexity_api_key: bool
