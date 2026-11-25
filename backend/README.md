# Voxcribe Backend

FastAPI service that stores transcriptions in PostgreSQL and streams microphone audio through a pluggable speech-to-text provider (Faster-Whisper by default).

## Stack

FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, PostgreSQL, Faster-Whisper, WebSockets.

## Layout

```
app/
  main.py                      app, CORS, lifespan (preloads the STT model), /api/health
  api/routes/                  REST: transcriptions.py, dashboard.py
  websocket/transcription.py   WS /ws/transcribe/{session_id}
  services/
    transcription_service.py   StreamingSession: incremental transcription logic
    speech/                    base.py, faster_whisper.py, speech_factory.py
  models/  schemas/  core/     ORM models, Pydantic schemas, settings + DB engine
migrations/                    Alembic (0001_initial)
tests/                         StreamingSession unit tests
```

## Configuration

Read from environment variables (`app/core/config.py`).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | e.g. `postgresql+psycopg2://user:pass@db:5432/voxcribe` |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated. Also used to validate the WebSocket `Origin` |
| `STT_PROVIDER` | `faster_whisper` | Provider selected by `speech_factory.py` |
| `WHISPER_MODEL` | `small` | Multilingual model: tiny, base, small, medium, large-v3 |
| `WHISPER_DEVICE` / `WHISPER_COMPUTE_TYPE` | `cpu` / `int8` | CTranslate2 settings |
| `WHISPER_MODEL_DIR` | `/models` | Where the baked-in model lives |
| `MAX_SESSION_SECONDS` | `3600` | Audio limit per WebSocket session |
| `MAX_CHUNK_BYTES` | `320000` | Largest accepted audio frame |

## Run

Normally through the root `docker-compose.yml`. The image runs `alembic upgrade head` and then uvicorn. The model is downloaded at image build time (`--build-arg WHISPER_MODEL=...`).

Locally without Docker:

```bash
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/voxcribe
alembic upgrade head
uvicorn app.main:app --reload
```

Interactive docs: `http://localhost:8000/docs`. See [../docs/API.md](../docs/API.md) for the full API.

## Tests

```bash
pytest
```

Covers `StreamingSession` with a fake provider: stable-segment commit, flush, invalid audio.

## Add a speech provider

1. Subclass `SpeechProvider` in `app/services/speech/` (`transcribe`, `detect_language`; optionally `transcribe_stream`, `close`).
2. Add a branch to `get_provider()` in `speech_factory.py`.
3. Set `STT_PROVIDER`.

If a provider fails to load, WebSocket clients get an `error` message. Fake text is never returned.
