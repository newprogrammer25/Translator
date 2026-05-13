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


@app.post("/api/rooms/create")
async def create_room() -> dict:
    """Create a new call room and return the room ID."""
    from .rooms import rooms
    room = rooms.create_room()
    return {"room_id": room.room_id}


@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str) -> dict:
    """Check if a room exists and its current state."""
    from .rooms import rooms
    room = rooms.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room.room_id, "peer_count": room.peer_count, "is_full": room.is_full}


@app.websocket("/api/ws/room/{room_id}")
async def room_socket(ws: WebSocket, room_id: str) -> None:
    """WebSocket endpoint for a call room.

    Handles:
    - WebRTC signaling (offer, answer, ice-candidate) relayed to the other peer
    - Translation requests (translate) streamed back to both peers as subtitles
    - Language setting (set-language) to configure this peer's language
    - Ping/pong keepalive

    Client -> Server:
      {"type": "join", "language": "en-US"}
      {"type": "offer", "sdp": "..."}
      {"type": "answer", "sdp": "..."}
      {"type": "ice-candidate", "candidate": {...}}
      {"type": "set-language", "language": "es-ES"}
      {"type": "translate", "id": "...", "text": "...", "source": "...", "target": "..."}
      {"type": "ping"}

    Server -> Client:
      {"type": "joined", "peer_id": "...", "peer_count": N}
      {"type": "peer-joined", "peer_id": "...", "language": "..."}
      {"type": "peer-left", "peer_id": "..."}
      {"type": "offer", "sdp": "...", "from": "..."}
      {"type": "answer", "sdp": "...", "from": "..."}
      {"type": "ice-candidate", "candidate": {...}, "from": "..."}
      {"type": "delta", "id": "...", "content": "...", "from": "..."}
      {"type": "done", "id": "...", "from": "..."}
      {"type": "error", "message": "..."}
      {"type": "pong"}
    """
    from .rooms import Peer, rooms

    await ws.accept()

    room = rooms.get_room(room_id)
    if not room:
        await ws.send_json({"type": "error", "message": "Room not found"})
        await ws.close()
        return

    if room.is_full:
        await ws.send_json({"type": "error", "message": "Room is full"})
        await ws.close()
        return

    # Generate peer ID
    import secrets
    peer_id = secrets.token_urlsafe(6)
    peer = Peer(ws=ws)

    if not rooms.add_peer(room_id, peer_id, peer):
        await ws.send_json({"type": "error", "message": "Could not join room"})
        await ws.close()
        return

    # Notify this peer
    await ws.send_json({"type": "joined", "peer_id": peer_id, "peer_count": room.peer_count})

    # Notify the other peer if present
    other = room.other_peer(peer_id)
    if other:
        try:
            await other.ws.send_json({"type": "peer-joined", "peer_id": peer_id, "language": peer.language})
        except Exception:
            pass
        # Also tell this peer about the existing peer
        other_id = room.other_peer_id(peer_id)
        await ws.send_json({"type": "peer-joined", "peer_id": other_id, "language": other.language})

    async def handle_translate(msg: dict) -> None:
        """Translate text and stream to BOTH peers as subtitles."""
        if not settings.groq_api_key:
            await ws.send_json({"type": "error", "message": "API key not configured"})
            return
        msg_id = str(msg.get("id", ""))
        text = str(msg.get("text", "")).strip()
        if not text:
            return
        source = str(msg.get("source", "auto"))
        target = str(msg.get("target", "en-US"))
        system = build_translation_system(source, target)
        messages = history_to_messages([{"role": "user", "content": text}], system=system)

        try:
            async for piece in stream_text(messages=messages, temperature=0.2):
                delta_msg = {"type": "delta", "id": msg_id, "content": piece, "from": peer_id}
                # Send to both peers
                await ws.send_json(delta_msg)
                other_now = room.other_peer(peer_id)
                if other_now:
                    try:
                        await other_now.ws.send_json(delta_msg)
                    except Exception:
                        pass
            done_msg = {"type": "done", "id": msg_id, "from": peer_id}
            await ws.send_json(done_msg)
            other_now = room.other_peer(peer_id)
            if other_now:
                try:
                    await other_now.ws.send_json(done_msg)
                except Exception:
                    pass
        except Exception as exc:
            logger.exception("room translate failed")
            await ws.send_json({"type": "error", "id": msg_id, "message": str(exc)})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            mtype = msg.get("type")

            if mtype == "ping":
                await ws.send_json({"type": "pong"})

            elif mtype == "set-language":
                peer.language = str(msg.get("language", "en-US"))
                # Notify other peer of language change
                other_now = room.other_peer(peer_id)
                if other_now:
                    try:
                        await other_now.ws.send_json({
                            "type": "peer-language", "peer_id": peer_id, "language": peer.language
                        })
                    except Exception:
                        pass

            elif mtype in ("offer", "answer", "ice-candidate"):
                # Relay WebRTC signaling to the other peer
                other_now = room.other_peer(peer_id)
                if other_now:
                    relay = {**msg, "from": peer_id}
                    try:
                        await other_now.ws.send_json(relay)
                    except Exception:
                        pass

            elif mtype == "translate":
                asyncio.create_task(handle_translate(msg))

            elif mtype == "subtitle":
                # Forward subtitle (original text) to the other peer
                other_now = room.other_peer(peer_id)
                if other_now:
                    try:
                        await other_now.ws.send_json({**msg, "from": peer_id})
                    except Exception:
                        pass

            else:
                await ws.send_json({"type": "error", "message": f"unknown type: {mtype}"})

    except WebSocketDisconnect:
        pass
    finally:
        rooms.remove_peer(room_id, peer_id)
        # Notify remaining peer
        other_now = room.other_peer(peer_id) if rooms.get_room(room_id) else None
        if other_now:
            try:
                await other_now.ws.send_json({"type": "peer-left", "peer_id": peer_id})
            except Exception:
                pass


# Quick label helper exposed for tests.
__all__ = ["app", "language_label"]
