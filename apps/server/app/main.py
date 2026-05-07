"""FastAPI entry point for the SayMi-style translator backend (Gemini-powered).

The CORS middleware below is required for the deployed frontend to reach this
service from any origin. Do not remove it.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from fastapi import (
    FastAPI,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.genai import types

from .config import get_settings
from .gemini_client import (
    build_dialogue_system,
    build_translation_system,
    history_to_contents,
    language_label,
    stream_text,
)
from .languages import LANGUAGES
from .schemas import (
    DialogueRequest,
    HealthResponse,
    LanguageItem,
    LanguagesResponse,
    TranslateRequest,
)

logger = logging.getLogger("translator")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SayMi-style Translator API", version="0.2.0")

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(has_api_key=bool(settings.gemini_api_key))


@app.get("/api/languages", response_model=LanguagesResponse)
async def languages() -> LanguagesResponse:
    return LanguagesResponse(
        languages=[
            LanguageItem(code=lang.code, iso=lang.iso, name=lang.name, native=lang.native, flag=lang.flag)
            for lang in LANGUAGES
        ]
    )


def _sse(event: str, data: dict | str) -> bytes:
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode()


async def _sse_stream(
    *,
    contents: list[types.Content] | str,
    system_instruction: str,
    temperature: float,
) -> AsyncIterator[bytes]:
    """Wrap :func:`stream_text` as Server-Sent Events.

    Emits ``event: delta`` for each token chunk, ``event: done`` when the model
    finishes, and ``event: error`` if anything goes wrong.
    """
    try:
        async for piece in stream_text(
            contents=contents,
            system_instruction=system_instruction,
            temperature=temperature,
        ):
            yield _sse("delta", {"content": piece})
        yield _sse("done", {})
    except Exception as exc:  # noqa: BLE001
        logger.exception("gemini stream failed")
        yield _sse("error", {"message": str(exc)})


@app.post("/api/translate")
async def translate(req: TranslateRequest) -> StreamingResponse:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
    system = build_translation_system(req.source, req.target, formal=req.formal)
    return StreamingResponse(
        _sse_stream(contents=req.text, system_instruction=system, temperature=0.2),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/dialogue")
async def dialogue(req: DialogueRequest) -> StreamingResponse:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    contents = history_to_contents(history)
    system = build_dialogue_system(
        bot_language=req.bot_language,
        user_language=req.user_language,
        persona=req.persona,
    )
    return StreamingResponse(
        _sse_stream(contents=contents, system_instruction=system, temperature=0.7),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.websocket("/api/ws/call")
async def call_socket(ws: WebSocket) -> None:
    """Bidirectional channel for the call-translation mode.

    Clients send JSON frames:
      - ``{"type": "translate", "id": str, "text": str, "source": str, "target": str}``
      - ``{"type": "ping"}``

    Server emits JSON frames:
      - ``{"type": "delta", "id": str, "content": str}``
      - ``{"type": "done", "id": str}``
      - ``{"type": "error", "id": str, "message": str}``
      - ``{"type": "pong"}``
    """
    await ws.accept()
    if not settings.gemini_api_key:
        await ws.send_json({"type": "error", "id": "init", "message": "GEMINI_API_KEY missing"})
        await ws.close()
        return

    async def handle_translate(msg: dict) -> None:
        msg_id = str(msg.get("id", ""))
        text = str(msg.get("text", "")).strip()
        if not text:
            return
        source = str(msg.get("source", "auto"))
        target = str(msg.get("target", "en-US"))
        formal = bool(msg.get("formal", False))
        system = build_translation_system(source, target, formal=formal)
        try:
            async for piece in stream_text(
                contents=text, system_instruction=system, temperature=0.2
            ):
                await ws.send_json({"type": "delta", "id": msg_id, "content": piece})
            await ws.send_json({"type": "done", "id": msg_id})
        except Exception as exc:  # noqa: BLE001
            logger.exception("ws translate failed")
            await ws.send_json({"type": "error", "id": msg_id, "message": str(exc)})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "id": "", "message": "invalid json"})
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                await ws.send_json({"type": "pong"})
            elif mtype == "translate":
                # Run in background so multiple translations can stream concurrently.
                asyncio.create_task(handle_translate(msg))
            else:
                await ws.send_json(
                    {"type": "error", "id": str(msg.get("id", "")), "message": f"unknown type {mtype}"}
                )
    except WebSocketDisconnect:
        return


# Quick label helper exposed for tests.
__all__ = ["app", "language_label"]
