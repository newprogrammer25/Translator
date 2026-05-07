"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    openai_tts_model: str = field(default_factory=lambda: os.getenv("OPENAI_TTS_MODEL", "tts-1"))
    openai_tts_voice: str = field(default_factory=lambda: os.getenv("OPENAI_TTS_VOICE", "alloy"))
    openai_stt_model: str = field(default_factory=lambda: os.getenv("OPENAI_STT_MODEL", "whisper-1"))
    allowed_origins: str = field(default_factory=lambda: os.getenv("ALLOWED_ORIGINS", "*"))

    @property
    def cors_origins(self) -> list[str]:
        if not self.allowed_origins or self.allowed_origins == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
