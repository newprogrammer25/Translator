"""Lazy Google Gemini client + helper builders."""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from google import genai
from google.genai import types

from .config import get_settings


@lru_cache
def get_client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in the environment or .env file."
        )
    return genai.Client(api_key=settings.gemini_api_key)


def language_label(code: str) -> str:
    """Return a human-readable label for a language code, falling back to the code itself."""
    from .languages import find_language

    lang = find_language(code)
    return lang.name if lang else code


def build_translation_system(source: str, target: str, *, formal: bool = False) -> str:
    """System instruction asking the model to output ONLY the translated text."""
    src_label = "the source language" if source in ("auto", "") else language_label(source)
    tgt_label = language_label(target)
    tone = "formal" if formal else "natural, conversational"
    return (
        f"You are a professional translator. Translate the user's message from "
        f"{src_label} into {tgt_label}. Use a {tone} register. "
        "Preserve meaning, idioms, and emotion. "
        "Output ONLY the translation \u2014 no quotes, no explanations, no language labels, "
        "no transliteration."
    )


def build_dialogue_system(
    *, bot_language: str, user_language: str, persona: str | None = None
) -> str:
    bot_lang = language_label(bot_language)
    user_lang = language_label(user_language) if user_language != "auto" else "the user's language"
    persona_clause = f" {persona.strip()}" if persona else ""
    return (
        f"You are a friendly conversational AI partner.{persona_clause} "
        f"The user writes in {user_lang}. Respond in {bot_lang}. "
        "Keep replies concise (1-3 sentences) and natural for spoken conversation. "
        "Do not include translations or stage directions \u2014 just the reply."
    )


def history_to_contents(history: list[dict[str, str]]) -> list[types.Content]:
    """Convert OpenAI-style history into Gemini ``Content`` objects.

    Gemini uses ``user`` and ``model`` roles; we map ``assistant`` -> ``model``.
    """
    contents: list[types.Content] = []
    for msg in history:
        role = msg.get("role", "user")
        gemini_role = "model" if role == "assistant" else "user"
        text = msg.get("content", "")
        contents.append(
            types.Content(role=gemini_role, parts=[types.Part.from_text(text=text)])
        )
    return contents


async def stream_text(
    *,
    contents: list[types.Content] | str,
    system_instruction: str,
    temperature: float = 0.2,
    model: str | None = None,
) -> AsyncIterator[str]:
    """Stream text deltas from Gemini ``generate_content_stream``."""
    client = get_client()
    settings = get_settings()
    chosen = model or settings.gemini_model
    response = await client.aio.models.generate_content_stream(
        model=chosen,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
        ),
    )
    async for chunk in response:
        if chunk.text:
            yield chunk.text
