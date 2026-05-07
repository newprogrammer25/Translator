"""Request / response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    source: str = "auto"
    target: str = "en-US"
    formal: bool = False


class DialogueMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class DialogueRequest(BaseModel):
    messages: list[DialogueMessage] = Field(..., min_length=1)
    bot_language: str = "en-US"
    user_language: str = "auto"
    persona: str | None = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice: str = "alloy"
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    format: Literal["mp3", "opus", "aac", "flac", "wav"] = "mp3"


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    has_api_key: bool


class LanguageItem(BaseModel):
    code: str
    iso: str
    name: str
    native: str
    flag: str


class LanguagesResponse(BaseModel):
    languages: list[LanguageItem]
