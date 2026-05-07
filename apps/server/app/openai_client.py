"""Lazy OpenAI client + helper builders."""

from __future__ import annotations

from functools import lru_cache

from openai import AsyncOpenAI

from .config import get_settings


@lru_cache
def get_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Set it in the environment or .env file."
        )
    return AsyncOpenAI(api_key=settings.openai_api_key)


def language_label(code: str) -> str:
    """Return a human-readable label for a language code, falling back to the code itself."""
    from .languages import find_language

    lang = find_language(code)
    return lang.name if lang else code


def build_translation_messages(
    text: str, source: str, target: str, *, formal: bool = False
) -> list[dict[str, str]]:
    """Build a chat-completion message pair for translation.

    The system prompt asks the model to respond with **only** the translated text — no
    quotes, no explanations, no language tags. This keeps streamed output usable as-is.
    """
    src_label = "the source language" if source in ("auto", "") else language_label(source)
    tgt_label = language_label(target)
    tone = "formal" if formal else "natural, conversational"
    system = (
        f"You are a professional translator. Translate the user's message from "
        f"{src_label} into {tgt_label}. Use a {tone} register. "
        "Preserve meaning, idioms, and emotion. "
        "Output ONLY the translation — no quotes, no explanations, no language labels, "
        "no transliteration."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]


def build_dialogue_messages(
    history: list[dict[str, str]],
    *,
    bot_language: str,
    user_language: str,
    persona: str | None = None,
) -> list[dict[str, str]]:
    bot_lang = language_label(bot_language)
    user_lang = language_label(user_language) if user_language != "auto" else "the user's language"
    persona_clause = f" {persona.strip()}" if persona else ""
    system = (
        f"You are a friendly conversational AI partner.{persona_clause} "
        f"The user writes in {user_lang}. Respond in {bot_lang}. "
        "Keep replies concise (1-3 sentences) and natural for spoken conversation. "
        "Do not include translations or stage directions — just the reply."
    )
    return [{"role": "system", "content": system}, *history]
