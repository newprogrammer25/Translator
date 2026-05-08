# Translator server

FastAPI backend for the SayMi-style AI translator. Powered by **Groq**
(`llama-3.3-70b-versatile`) via the official `groq` Python SDK — their LPU
hardware streams 300+ tokens/s, which keeps real-time translation snappy.

## Setup

```bash
poetry install
cp .env.example .env  # add GROQ_API_KEY
poetry run uvicorn app.main:app --reload
```

Server runs at http://localhost:8000.

Get a free Groq API key at https://console.groq.com/keys.
The free tier covers 30 RPM / 14 400 requests per day on
`llama-3.3-70b-versatile`, which is comfortable for personal use.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/health`     | Health check (reports whether `GROQ_API_KEY` is set) |
| GET    | `/api/languages`  | Supported languages |
| POST   | `/api/translate`  | Translate text (Groq streaming SSE) |
| POST   | `/api/dialogue`   | AI chat with optional translation (Groq streaming SSE) |
| WS     | `/api/ws/call`    | Real-time call translation (multi-speaker, concurrent streams) |

Speech-to-text and text-to-speech are handled in the browser
(`SpeechRecognition` + `speechSynthesis`) for zero-latency, offline-capable
audio I/O. The backend doesn't proxy audio.
