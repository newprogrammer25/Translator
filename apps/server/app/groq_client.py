"""Lazy Groq client + helper builders.

Groq exposes an OpenAI-compatible chat completions API and serves Llama-3.3-70B
on their own LPU hardware, which gives us very fast streaming (300+ tokens/s).
We keep the surface area small and OpenAI-shaped so swapping providers later
is straightforward.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from groq import AsyncGroq

from .config import get_settings


@lru_cache
def get_client() -> AsyncGroq:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not configured. Set it in the environment or .env file."
        )
    return AsyncGroq(api_key=settings.groq_api_key)


def language_label(code: str) -> str:
    """Return a human-readable label for a language code, falling back to the code itself."""
    from .languages import find_language

    lang = find_language(code)
    return lang.name if lang else code


def build_translation_system(source: str, target: str, *, formal: bool = False) -> str:
    """System instruction asking the model to output ONLY the translated text."""
    src_label = "the source language" if source in ("auto", "") else language_label(source)
    tgt_label = language_label(target)
    if formal:
        tone_clause = (
            "Use a STRICTLY FORMAL register. In languages with a T-V distinction, ALWAYS "
            "use the formal pronouns and corresponding verb conjugations: Spanish 'usted' / "
            "'ustedes' with third-person verbs (e.g. 'puede', 'tiene', 'pod\u00edo'/'podr\u00eda'); "
            "French 'vous'; German 'Sie'; Russian '\u0412\u044b' / '\u0412\u0430\u0441'; "
            "Italian 'Lei'; Portuguese 'voc\u00ea' / formal address. Avoid contractions, "
            "slang, and casual interjections."
        )
    else:
        tone_clause = (
            "Use a natural, conversational register that matches the source tone."
        )
    return (
        f"You are a professional translator. Translate the user's message from "
        f"{src_label} into {tgt_label}. {tone_clause} "
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


def history_to_messages(
    history: list[dict[str, str]], *, system: str
) -> list[dict[str, str]]:
    """Build an OpenAI-style chat ``messages`` array.

    The ``system`` instruction is prepended; ``history`` items keep their
    ``role`` (``user`` / ``assistant``) and ``content``.
    """
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for msg in history:
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        messages.append({"role": role, "content": msg.get("content", "")})
    return messages


async def stream_text(
    *,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    model: str | None = None,
) -> AsyncIterator[str]:
    """Stream content deltas from Groq's chat completion endpoint."""
    client = get_client()
    settings = get_settings()
    chosen = model or settings.groq_model
    stream = await client.chat.completions.create(
        model=chosen,
        messages=messages,  # type: ignore[arg-type]
        temperature=temperature,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        piece = getattr(delta, "content", None)
        if piece:
            yield piece
