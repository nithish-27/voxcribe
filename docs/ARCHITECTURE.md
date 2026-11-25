# Architecture

## System overview

```mermaid
flowchart LR
  user([User + microphone]) --> fe

  subgraph docker[Docker Compose]
    fe["frontend<br/>Next.js :3000"]
    be["backend<br/>FastAPI :8000"]
    model[("Faster-Whisper model<br/>baked into image")]
    db[("db<br/>PostgreSQL<br/>volume pgdata")]
  end

  fe -- "REST /api/*" --> be
  fe -- "WebSocket /ws/transcribe<br/>PCM16 16 kHz chunks" --> be
  be -- "interim / final text" --> fe
  be --> model
  be -- "SQLAlchemy" --> db
```

The browser talks to both the frontend (page assets) and the backend (REST and WebSocket) directly. The frontend container only serves the UI.

## Live transcription sequence

```mermaid
sequenceDiagram
  participant B as Browser (useTranscriber)
  participant W as WebSocket handler
  participant S as StreamingSession
  participant M as Faster-Whisper

  B->>W: connect /ws/transcribe/{id} (Origin checked)
  W-->>B: ready
  loop every ~0.5 s of audio
    B->>W: binary PCM16 chunk
    W->>S: append(chunk)
  end
  loop background pump
    W->>S: step() in worker thread
    S->>M: transcribe(uncommitted buffer)
    M-->>S: segments
    Note over S: all but last segment = stable<br/>trim committed audio from buffer
    S-->>W: final events + interim event
    W-->>B: final (append) / interim (replace)
  end
  B->>W: {"type":"stop"}
  W->>S: step(flush=true)
  W-->>B: final..., interim "", done
  B->>W: POST /api/transcriptions (REST, on Save)
```

## Backend components

```mermaid
flowchart TB
  main["main.py<br/>CORS, lifespan, /api/health"]
  rest["api/routes<br/>transcriptions, dashboard"]
  ws["websocket/transcription.py"]
  svc["services/transcription_service.py<br/>StreamingSession"]
  factory["speech/speech_factory.py"]
  base["speech/base.py<br/>SpeechProvider"]
  fw["speech/faster_whisper.py"]
  orm["models + schemas + core/database"]
  db[("PostgreSQL")]

  main --> rest
  main --> ws
  rest --> orm --> db
  ws --> svc
  ws --> factory
  factory --> base
  fw -. implements .-> base
  factory --> fw
  svc --> base
```

Adding another speech provider means implementing `SpeechProvider` and adding one branch in the factory.

## Frontend components

```mermaid
flowchart TB
  layout["app/layout.tsx + Nav"]
  home["/ landing"]
  dash["/dashboard"]
  tr["/transcribe"]
  hist["/history"]
  det["/history/[id]"]
  hook["hooks/useTranscriber<br/>mic, AudioWorklet, WebSocket"]
  api["lib/api.ts<br/>REST client"]
  row["TranscriptionRow"]
  dlg["ConfirmDialog"]

  layout --> home & dash & tr & hist & det
  tr --> hook
  tr --> api
  dash --> api
  dash --> row
  hist --> api
  hist --> row
  hist --> dlg
  det --> api
  det --> dlg
```

## Data model

```mermaid
erDiagram
  TRANSCRIPTIONS ||--o{ TRANSCRIPTION_SEGMENTS : has
  TRANSCRIPTIONS {
    uuid id PK
    string title
    text content
    jsonb detected_languages
    float duration_seconds
    int word_count
    string status
    timestamptz created_at
    timestamptz updated_at
  }
  TRANSCRIPTION_SEGMENTS {
    uuid id PK
    uuid transcription_id FK
    int sequence_number
    text text
    string language
    float start_time
    float end_time
    bool is_final
    timestamptz created_at
  }
```

## Container startup order

`db` (healthy) then `backend` (runs migrations, loads the model, healthy) then `frontend`.
