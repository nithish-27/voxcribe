# Technical Documentation

## 1. Overview

Voxcribe converts microphone speech to text in near real time, keeps mixed-language sentences as spoken, and stores transcripts in PostgreSQL. Three containers: `frontend` (Next.js), `backend` (FastAPI + Faster-Whisper), `db` (PostgreSQL). See [ARCHITECTURE.md](ARCHITECTURE.md) for diagrams and [API.md](API.md) for endpoints.

## 2. Real-time transcription pipeline

Whisper is an encoder-decoder model with no token-level streaming. Voxcribe uses **chunk-based incremental transcription with overlapping windows**, not true streaming.

### Client (`frontend/hooks/useTranscriber.ts`)

1. `getUserMedia({audio})` with mono, echo cancellation and noise suppression.
2. An `AudioWorklet` posts raw float frames. Frames are collected for about 0.5 s, box-averaged down to 16 kHz and converted to PCM16.
3. Each chunk is sent as a binary WebSocket frame.
4. The worklet output goes through a zero-gain node so the microphone is never played back.
5. Pause stops sending audio and tells the server to finalize. Stop flushes the last chunk, sends `stop`, waits up to 20 s for `done`, then releases the microphone, audio context and socket.

### Server (`backend/app/websocket/transcription.py`, `services/transcription_service.py`)

- The receive loop appends audio to a per-session buffer and wakes a background task.
- The background task (`pump`) calls `StreamingSession.step()` in a worker thread, then sleeps `interim_interval_seconds` (0.5 s). If transcription is slower than real time, the loop simply transcribes the newest buffer next time, so latency does not pile up.
- `step()` transcribes the whole uncommitted buffer:
  - **2 or more segments:** all but the last are **stable**. They are emitted as `final`, and the buffer is trimmed to the end of the last stable segment, so they cannot be emitted twice.
  - **Last segment:** emitted as `interim` and re-decoded next step when more audio gives it more context.
  - **Window over 25 s with one segment:** it is force-committed so the buffer cannot grow without bound.
  - **Flush** (pause, stop): everything is committed.
- A step lock serializes steps per session; a provider-level lock serializes access to the shared model across sessions.

### Duplicate and consistency rules

- Committed audio is removed from the buffer, so reconciliation is by construction: text is only ever appended once.
- The client replaces `interim` text and appends `final` text, never the reverse.
- Audio that arrives while a step runs is kept: only the committed prefix is deleted.

### Language handling

`task="transcribe"` is always used, so speech is never translated. `language=None` lets Whisper auto-detect per window. Whisper reports one language per window; for code-switching the backend adds `en` when Latin words appear in a non-English result (`tag_languages`). Mixed-language accuracy depends on the model: `small` is a trade-off, `medium` and `large-v3` are better but slower.

### Silence handling

`vad_filter=True` drops non-speech. faster-whisper 1.0.3 raises `ValueError` ("max() arg is an empty sequence") in language detection when VAD removes all audio; the provider treats this as "no speech" and returns an empty result.

## 3. Speech provider abstraction

`backend/app/services/speech/base.py` defines `SpeechProvider` with `transcribe(audio, language)`, `detect_language(audio)`, `transcribe_stream(chunks)` (default: re-transcribe the growing buffer) and `close()`. Audio is mono float32, 16 kHz. `speech_factory.get_provider()` selects the provider from `STT_PROVIDER` and caches it. A provider that cannot load raises `SpeechProviderError`; the WebSocket reports it to the client as a fatal `error`. Fake transcripts are never produced.

## 4. Data model

```
transcriptions
  id UUID PK, title varchar(200), content text, detected_languages jsonb,
  duration_seconds float, word_count int, status varchar(20),
  created_at timestamptz, updated_at timestamptz
  indexes: created_at; GIN(detected_languages)

transcription_segments
  id UUID PK, transcription_id UUID FK -> transcriptions.id ON DELETE CASCADE,
  sequence_number int, text, language, start_time, end_time, is_final, created_at
  index: (transcription_id, sequence_number)
```

Schema changes go through Alembic (`backend/migrations`); the container runs `alembic upgrade head` on start. The UI saves only the transcript text, so `transcription_segments` is only filled when API clients send `segments`. `users` is not implemented (no authentication).

## 5. Frontend

Next.js App Router, all data pages are client components that call the REST API through `lib/api.ts`. State is local React state; there is no global store. The history page debounces search by 300 ms, cancels stale requests, and resets to page 1 when filters change. Deletes always go through `ConfirmDialog`.

## 6. Deployment

`docker-compose.yml` starts `db`, `backend` (waits for a healthy `db`), `frontend` (waits for a healthy `backend`). The Whisper model is downloaded at image build time (`WHISPER_MODEL` build arg), then `HF_HUB_OFFLINE=1` makes the container start without network. `NEXT_PUBLIC_API_URL` is inlined into the frontend at build time. The backend runs as a non-root user.

Variables are documented in `.env.example`.

## 7. Security and limits

- Secrets come from environment variables; `.env` is git-ignored.
- CORS allows only `CORS_ORIGINS`; WebSocket `Origin` is checked against the same list.
- Limits: 320 kB per audio frame, 3600 s of audio per session, 1 MB of text per transcript, `page_size` 100.
- Search input is escaped before `ILIKE`; all queries use SQLAlchemy bound parameters.
- **No authentication.** Anyone who can reach the API can read and delete all transcripts. Do not expose it publicly without adding auth and HTTPS.

## 8. Known limitations

- Latency is about 1 to 3 s on CPU with `small`; GPU needs a CUDA image (not included).
- One detected language per window; code-switching quality is model dependent.
- Text typed into the editor during recording is kept, but new `final` text is always appended at the end.
- Saved duration is the client-side recording timer.
- Unit tests cover `StreamingSession` only. There are no automated end-to-end or API tests.
