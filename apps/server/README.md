# Translator server

FastAPI backend for the SayMi-style AI translator. Powered by **Google Gemini**
(`gemini-2.0-flash`) via the official `google-genai` SDK.

## Setup

```bash
poetry install
cp .env.example .env  # add GEMINI_API_KEY
poetry run uvicorn app.main:app --reload
```

Server runs at http://localhost:8000.

Get a free Gemini API key at https://aistudio.google.com/app/apikey.
The free tier provides 15 RPM / 1M tokens per day for `gemini-2.0-flash`.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/health`     | Health check (reports whether `GEMINI_API_KEY` is set) |
| GET    | `/api/languages`  | Supported languages |
| POST   | `/api/translate`  | Translate text (streaming SSE) |
| POST   | `/api/dialogue`   | AI chat with optional translation (streaming SSE) |
| WS     | `/api/ws/call`    | Real-time call translation (multi-speaker, concurrent streams) |

Speech-to-text and text-to-speech are handled in the browser
(`SpeechRecognition` + `speechSynthesis`) for zero-latency, offline-capable
audio I/O. The backend doesn't proxy audio.
