"""FastAPI entry point for the SayMi-style translator backend.

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
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import get_settings
from .languages import LANGUAGES
from .openai_client import (
    build_dialogue_messages,
    build_translation_messages,
    get_client,
    language_label,
)
from .schemas import (
    DialogueRequest,
    HealthResponse,
    LanguageItem,
    LanguagesResponse,
    TranslateRequest,
    TTSRequest,
)

logger = logging.getLogger("translator")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SayMi-style Translator API", version="0.1.0")

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(has_api_key=bool(settings.openai_api_key))


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


async def _stream_chat(
    messages: list[dict[str, str]], *, model: str | None = None, temperature: float = 0.2
) -> AsyncIterator[bytes]:
    """Stream a chat completion as Server-Sent Events.

    Emits ``event: delta`` for each token chunk, ``event: done`` when the model
    finishes, and ``event: error`` if anything goes wrong.
    """
    client = get_client()
    chosen_model = model or settings.openai_model
    try:
        stream = await client.chat.completions.create(
            model=chosen_model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield _sse("delta", {"content": delta.content})
        yield _sse("done", {})
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat stream failed")
        yield _sse("error", {"message": str(exc)})


@app.post("/api/translate")
async def translate(req: TranslateRequest) -> StreamingResponse:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    messages = build_translation_messages(req.text, req.source, req.target, formal=req.formal)
    return StreamingResponse(
        _stream_chat(messages, temperature=0.2),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/dialogue")
async def dialogue(req: DialogueRequest) -> StreamingResponse:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    messages = build_dialogue_messages(
        history,
        bot_language=req.bot_language,
        user_language=req.user_language,
        persona=req.persona,
    )
    return StreamingResponse(
        _stream_chat(messages, temperature=0.7),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),  # noqa: B008 — FastAPI uses these as dependency markers.
    language: str = Form("auto"),  # noqa: B008
) -> dict[str, str]:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="empty audio")
    client = get_client()
    iso = language.split("-")[0] if language not in ("", "auto") else None
    try:
        result = await client.audio.transcriptions.create(
            model=settings.openai_stt_model,
            file=(file.filename or "audio.webm", audio, file.content_type or "audio/webm"),
            language=iso,  # type: ignore[arg-type]
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("whisper failed")
        raise HTTPException(status_code=502, detail=f"transcription failed: {exc}") from exc
    return {"text": result.text}


@app.post("/api/tts")
async def tts(req: TTSRequest) -> StreamingResponse:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
    client = get_client()

    async def stream_audio() -> AsyncIterator[bytes]:
        try:
            async with client.audio.speech.with_streaming_response.create(
                model=settings.openai_tts_model,
                voice=req.voice or settings.openai_tts_voice,  # type: ignore[arg-type]
                input=req.text,
                response_format=req.format,
                speed=req.speed,
            ) as response:
                async for chunk in response.iter_bytes(chunk_size=4096):
                    yield chunk
        except Exception as exc:  # noqa: BLE001
            logger.exception("tts failed")
            raise HTTPException(status_code=502, detail=f"tts failed: {exc}") from exc

    media = {
        "mp3": "audio/mpeg",
        "opus": "audio/ogg",
        "aac": "audio/aac",
        "flac": "audio/flac",
        "wav": "audio/wav",
    }[req.format]
    return StreamingResponse(stream_audio(), media_type=media)


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
    if not settings.openai_api_key:
        await ws.send_json({"type": "error", "id": "init", "message": "OPENAI_API_KEY missing"})
        await ws.close()
        return

    client = get_client()

    async def handle_translate(msg: dict) -> None:
        msg_id = str(msg.get("id", ""))
        text = str(msg.get("text", "")).strip()
        if not text:
            return
        source = str(msg.get("source", "auto"))
        target = str(msg.get("target", "en-US"))
        formal = bool(msg.get("formal", False))
        messages = build_translation_messages(text, source, target, formal=formal)
        try:
            stream = await client.chat.completions.create(
                model=settings.openai_model,
                messages=messages,
                temperature=0.2,
                stream=True,
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    await ws.send_json(
                        {"type": "delta", "id": msg_id, "content": delta.content}
                    )
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
