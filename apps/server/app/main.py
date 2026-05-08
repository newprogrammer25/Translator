"""FastAPI entry point for the SayMi-style translator backend (Groq-powered).

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

from .config import get_settings
from .groq_client import (
    build_dialogue_system,
    build_translation_system,
    history_to_messages,
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

app = FastAPI(title="SayMi-style Translator API", version="0.3.0")

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
    return HealthResponse(has_api_key=bool(settings.groq_api_key))


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


# 2 KB of whitespace shipped as an SSE comment at the very start of every
# stream.  Some HTTP/2 reverse proxies (Render's free tier among them) hold
# small response chunks in an internal buffer until either the buffer fills or
# the response ends; in that mode the browser only sees the deltas after the
# Groq stream has fully completed, which kills the "feels instant" UX.  Dumping
# 2 KB up front forces the proxy to commit and switch to streaming mode, while
# being a valid SSE comment that browsers happily ignore.
_SSE_PRELUDE: bytes = b": " + (b" " * 2048) + b"\n\n"

# Headers asking every layer between FastAPI and the browser to stop buffering
# or transforming the response.  ``X-Accel-Buffering`` is the nginx directive
# (Render's edge respects it); ``Content-Encoding: identity`` blocks any
# opportunistic gzip middlebox; ``Cache-Control: no-transform`` blocks CDNs
# from coalescing chunks.
_STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Content-Encoding": "identity",
    "Connection": "keep-alive",
}


async def _sse_stream(
    *,
    messages: list[dict[str, str]],
    temperature: float,
) -> AsyncIterator[bytes]:
    """Wrap :func:`stream_text` as Server-Sent Events.

    Emits ``event: delta`` for each token chunk, ``event: done`` when the model
    finishes, and ``event: error`` if anything goes wrong.
    """
    yield _SSE_PRELUDE
    try:
        async for piece in stream_text(messages=messages, temperature=temperature):
            yield _sse("delta", {"content": piece})
        yield _sse("done", {})
    except Exception as exc:  # noqa: BLE001
        logger.exception("groq stream failed")
        yield _sse("error", {"message": str(exc)})


@app.post("/api/translate")
async def translate(req: TranslateRequest) -> StreamingResponse:
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")
    system = build_translation_system(req.source, req.target, formal=req.formal)
    messages = history_to_messages(
        [{"role": "user", "content": req.text}], system=system
    )
    return StreamingResponse(
        _sse_stream(messages=messages, temperature=0.2),
        media_type="text/event-stream",
        headers=_STREAM_HEADERS,
    )


@app.post("/api/dialogue")
async def dialogue(req: DialogueRequest) -> StreamingResponse:
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    system = build_dialogue_system(
        bot_language=req.bot_language,
        user_language=req.user_language,
        persona=req.persona,
    )
    messages = history_to_messages(history, system=system)
    return StreamingResponse(
        _sse_stream(messages=messages, temperature=0.7),
        media_type="text/event-stream",
        headers=_STREAM_HEADERS,
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
    if not settings.groq_api_key:
        await ws.send_json({"type": "error", "id": "init", "message": "GROQ_API_KEY missing"})
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
        messages = history_to_messages([{"role": "user", "content": text}], system=system)
        try:
            async for piece in stream_text(messages=messages, temperature=0.2):
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
