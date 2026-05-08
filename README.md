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
  server/   # FastAPI + Groq (llama-3.3-70b-versatile) — streaming SSE + WebSocket
  web/      # Vite + React + TypeScript + Tailwind, lazy-loaded mode bundles
```

### Latency & smoothness optimizations
- Browser-side `SpeechRecognition` for instant partial transcripts (no audio round-trip)
- Browser-side `speechSynthesis` for TTS (zero network latency, offline)
- Streaming SSE for translation/dialogue — first token in ~80–200 ms on Groq's LPU (300+ tokens/s)
- Single WebSocket per call session — concurrent translations of both speakers
- `requestAnimationFrame` batching of streaming chunks: re-renders cap at 60–120 Hz
- `React.memo` for chat bubbles & call utterances — only the streaming row re-renders
- CSS `contain: content` + `content-visibility: auto` on streaming panes
- Code-split routes & vendor chunks; total JS gzip ≈ 70 kB

## Local development

### Backend

```bash
cd apps/server
poetry install
cp .env.example .env  # add GROQ_API_KEY (https://console.groq.com/keys)
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
| `GROQ_API_KEY`     | _(required)_ | Groq API key (https://console.groq.com/keys) |
| `GROQ_MODEL`       | `llama-3.3-70b-versatile` | Groq model used for translation & dialogue |
| `ALLOWED_ORIGINS`  | `*`           | Comma-separated CORS origins |
| `VITE_API_BASE`    | `""`          | Frontend → backend base URL (defaults to same origin / Vite proxy) |

## License

MIT
