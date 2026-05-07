# Translator server

FastAPI backend for the SayMi-style AI translator.

## Setup

```bash
poetry install
cp .env.example .env  # add OPENAI_API_KEY
poetry run fastapi dev app/main.py
```

Server runs at http://localhost:8000.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/health`     | Health check |
| GET    | `/api/languages`  | Supported languages |
| POST   | `/api/translate`  | Translate text (streaming SSE) |
| POST   | `/api/transcribe` | Speech-to-text (Whisper) |
| POST   | `/api/tts`        | Text-to-speech (streaming mp3) |
| POST   | `/api/dialogue`   | AI chat with optional translation (streaming SSE) |
| WS     | `/api/ws/call`    | Real-time call translation |
