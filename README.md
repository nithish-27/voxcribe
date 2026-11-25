# Voxcribe

**Your voice, instantly transformed into text.**

Voxcribe is a real-time, multilingual speech-to-text web app. Speak into your microphone and watch the text appear as you talk, including sentences that mix languages (for example Hindi + English or Tamil + English). Transcripts are saved to a searchable history that you can edit, export and delete.

[Watch the demo video](docs/demo/voxcribe-demo.mp4)

## Features

- **Real-time transcription**: audio is streamed over WebSockets and transcribed incrementally; stable text is locked in while the newest words keep refining.
- **Multilingual and code-switching**: language is detected automatically, speech is transcribed in the language spoken and never translated.
- **Recording workspace**: start, pause, resume and stop, live audio meter, timer, editable transcript, copy, TXT and PDF export.
- **History and dashboard**: totals, search, language and date filters, sorting, pagination, edit, delete with confirmation.
- **Self-contained**: the Whisper model is baked into the Docker image, so it runs offline after the first build. No API keys.
- **Pluggable speech engine**: Faster-Whisper by default; other providers can be added behind one interface.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, WebSockets, SQLAlchemy, Alembic, Pydantic |
| Speech | Faster-Whisper (multilingual Whisper model) |
| Database | PostgreSQL |
| Infrastructure | Docker, Docker Compose |

## Quick start

Requires Docker Desktop.

```bash
cp .env.example .env        # set POSTGRES_PASSWORD
docker compose up --build
```

The first build downloads the Whisper `small` model (about 500 MB). Then open:

| URL | What |
|---|---|
| http://localhost:3000 | The app (change with `FRONTEND_PORT` in `.env`) |
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:8000/api/health | Health check |

Open the app through `localhost`: browsers only allow the microphone on `localhost` or HTTPS. If you change `FRONTEND_PORT`, set `CORS_ORIGINS` to match.

Stop with `docker compose down` (your data stays in the `pgdata` volume).

## Configuration

Everything is set in `.env` (template: `.env.example`). Two values are baked in at build time, so rebuild after changing them:

- `WHISPER_MODEL` (`tiny`, `base`, `small`, `medium`, `large-v3`): `docker compose build backend`
- `NEXT_PUBLIC_API_URL` (backend URL as the browser sees it): `docker compose build frontend`

## Documentation

| Document | Contents |
|---|---|
| [Technical documentation (Word)](docs/Voxcribe-Technical-Documentation.docx) | Pipeline design, data model, security, limits |
| [API documentation (Word)](docs/Voxcribe-API-Documentation.docx) | REST endpoints and the WebSocket protocol |
| [Architecture diagrams](docs/ARCHITECTURE.md) | System, sequence, component and data diagrams |
| [Backend README](backend/README.md) | Layout, configuration, tests, adding a speech provider |
| [Frontend README](frontend/README.md) | Pages, recording hook, build |

## How live transcription works

Whisper does not stream token by token. Voxcribe uses chunk-based incremental transcription: the browser sends about 0.5 s audio chunks, the backend repeatedly re-transcribes the uncommitted window, segments followed by a later segment are committed as final (and their audio dropped, so nothing repeats), and the last segment is shown as interim until it stabilises. Expect roughly 1 to 3 seconds of latency on CPU.

## Limitations

- No authentication or user accounts: do not expose the API to the public internet as is.
- One detected language per audio window; mixed-language accuracy depends on the Whisper model size.
- PDF export uses the browser's print dialog ("Save as PDF") so Hindi and Tamil render correctly.
- Not implemented: settings and profile pages, a Gemini Live provider, a manual dark-mode toggle, keyboard shortcuts.
