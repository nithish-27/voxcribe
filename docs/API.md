# API Reference

Base URL: `http://localhost:8000`. Interactive Swagger UI: `/docs`, OpenAPI JSON: `/openapi.json`.

There is no authentication. All bodies are JSON. Validation errors return `422` with FastAPI's standard `detail` array; missing records return `404 {"detail": "Transcription not found"}`.

## Objects

**Transcription**

```json
{
  "id": "09e68225-3e69-460e-b24d-1f984dfd5b07",
  "title": "आज weather बहुत अच्छा है",
  "content": "आज weather बहुत अच्छा है and I want to go outside.",
  "detected_languages": ["hi", "en"],
  "duration_seconds": 12.0,
  "word_count": 10,
  "status": "completed",
  "created_at": "2026-11-25T07:22:14.363429Z",
  "updated_at": "2026-11-25T07:22:14.363429Z"
}
```

`TranscriptionDetail` adds `segments`: `[{id, sequence_number, text, language, start_time, end_time, is_final}]`.

## REST endpoints

### `GET /api/health`
Liveness check. Response: `{"status": "ok", "stt_provider": "faster_whisper", "stt_model": "small"}`.

### `POST /api/transcriptions`
Create a transcription. Returns `201` with a `TranscriptionDetail`.

| Field | Type | Notes |
|---|---|---|
| `title` | string, 1-200 | Optional. Defaults to the first 6 words of `content` |
| `content` | string, max 1,000,000 | Required. `word_count` is computed from it |
| `detected_languages` | string[], max 20 | Optional |
| `duration_seconds` | number >= 0 | Optional |
| `segments` | array, max 5000 | Optional: `{text, language?, start_time, end_time, is_final}` |

### `GET /api/transcriptions`
Paginated list, returns `{items, total, page, page_size}`.

| Query | Default | Notes |
|---|---|---|
| `page` | 1 | >= 1 |
| `page_size` | 20 | 1-100 |
| `q` | none | Case-insensitive match on title or content |
| `language` | none | Exact language code in `detected_languages` |
| `date_from`, `date_to` | none | `YYYY-MM-DD`, inclusive, UTC |
| `sort` | `newest` | `newest` or `oldest` (by `created_at`) |

### `GET /api/transcriptions/{id}`
Returns a `TranscriptionDetail`. `404` if unknown.

### `PUT /api/transcriptions/{id}`
Update `title` and/or `content` (both optional). Changing `content` recomputes `word_count`. Returns the updated `Transcription`.

### `DELETE /api/transcriptions/{id}`
Returns `204`. Segments are deleted with the transcription (`ON DELETE CASCADE`).

### `GET /api/languages`
Distinct language codes across all transcriptions, sorted. Used by the history filter.

### `GET /api/dashboard/stats`

```json
{
  "total_transcriptions": 2,
  "total_words": 29,
  "total_duration_seconds": 42.0,
  "latest": { "...": "Transcription or null" }
}
```

## WebSocket: `/ws/transcribe/{session_id}`

`session_id` is any client-generated id (the UI uses a UUID); it is only used for logging.

**Connection checks:** if the `Origin` header is present it must be listed in `CORS_ORIGINS`, otherwise the socket closes with code `1008`.

### Client to server

| Message | Meaning |
|---|---|
| Binary frame | Audio: PCM16 little-endian, mono, 16 kHz. Max `MAX_CHUNK_BYTES` (320 kB, 10 s) per frame |
| `{"type": "pause"}` | Finalize the pending text; the connection stays open |
| `{"type": "stop"}` | Finalize, send `done`, then the server closes |

### Server to client

| Message | Meaning |
|---|---|
| `{"type": "ready"}` | Session is open |
| `{"type": "interim", "text": "..."}` | Live, not yet stable text. Replaces the previous interim. Empty text clears it |
| `{"type": "final", "seq": 3, "text": "...", "language": "hi", "languages": ["hi","en"], "start": 4.2, "end": 7.9}` | Stable segment. Append it; it is never repeated |
| `{"type": "paused"}` | Reply to `pause` |
| `{"type": "done", "duration": 31.5, "languages": ["hi","en"]}` | Reply to `stop` |
| `{"type": "error", "message": "...", "fatal": false}` | `fatal: true` means the server closes the socket |

Non-fatal errors: empty or odd-length audio frame, frame too large, session audio limit reached, malformed control message. Fatal: the STT provider failed to load or crashed.

### Example flow

```
client  -> (binary audio) x N
server  <- {"type":"interim","text":"आज weather"}
server  <- {"type":"final","seq":1,"text":"आज weather बहुत अच्छा है", ...}
server  <- {"type":"interim","text":"and I want"}
client  -> {"type":"stop"}
server  <- {"type":"final","seq":2,"text":"and I want to go outside.", ...}
server  <- {"type":"interim","text":""}
server  <- {"type":"done","duration":9.5,"languages":["hi","en"]}
```

Saving is a separate REST call (`POST /api/transcriptions`) made by the client after stopping.
