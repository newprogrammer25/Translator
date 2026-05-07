# Translator

A SayMi-style AI translator — no headphones, no Bluetooth, just a fast web app.

## Modes

| Mode | What it does |
| ---- | ------------ |
| **Real-time**     | Speak — see your transcript and a streamed translation as you talk, with optional voice playback. |
| **AI Translation**| Type or paste text; the translation streams as you write. Formal/casual tone toggle. |
| **AI Dialogue**   | Chat with an AI in any language; replies are streamed and optionally translated for you. Includes Tutor / Traveler / Business personas. |
| **Call**          | Two people, two languages, two columns. Each side has its own mic and hears the other side translated. |

## Architecture

```
apps/
  server/   # FastAPI + OpenAI (gpt-4o-mini, whisper-1, tts-1) — streaming SSE + WebSocket
  web/      # Vite + React + TypeScript + Tailwind, lazy-loaded mode bundles
```

### Latency optimizations
- Browser-side `SpeechRecognition` for instant partial transcripts (no audio round-trip)
- Streaming SSE for translation/dialogue — first token in ~200–400 ms
- Streaming `tts-1` MP3 over chunked HTTP for low playback latency
- Single WebSocket per call session — concurrent translations of both speakers
- Code-split routes & vendor chunks; total JS gzip ≈ 70 kB

## Local development

### Backend

```bash
cd apps/server
poetry install
cp .env.example .env  # add OPENAI_API_KEY
poetry run uvicorn app.main:app --reload
```

The server runs on http://localhost:8000.

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

The Vite dev server runs on http://localhost:5173 and proxies `/api/*` to the backend.

## Production build

```bash
# backend image
docker build -t translator-server apps/server

# frontend static bundle (host on any CDN)
(cd apps/web && npm run build)   # outputs apps/web/dist
```

## Environment

| Var | Default | Description |
| --- | ------- | ----------- |
| `OPENAI_API_KEY`   | _(required)_ | OpenAI key |
| `OPENAI_MODEL`     | `gpt-4o-mini` | Chat / translation model |
| `OPENAI_TTS_MODEL` | `tts-1`       | Text-to-speech model |
| `OPENAI_TTS_VOICE` | `alloy`       | Default voice |
| `OPENAI_STT_MODEL` | `whisper-1`   | Speech-to-text model |
| `ALLOWED_ORIGINS`  | `*`           | Comma-separated CORS origins |
| `VITE_API_BASE`    | `""`          | Frontend → backend base URL (defaults to same origin / Vite proxy) |

## License

MIT
