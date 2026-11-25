# Voxcribe Frontend

Next.js (App Router) UI for recording, live transcription, and managing transcript history.

## Stack

Next.js 14, React 18, TypeScript, Tailwind CSS, lucide-react. Dark mode follows the OS setting.

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/dashboard` | Totals (transcriptions, words, recording time), latest session, recent list |
| `/transcribe` | Recording workspace: start/pause/resume/stop, level meter, timer, live editor, save/copy/TXT/PDF |
| `/history` | Search, language and date filters, sort, pagination, delete with confirmation |
| `/history/[id]` | View and edit a transcript, export, delete |

## Layout

```
app/                 routes
components/          layout/nav, history/transcription-row, ui/confirm-dialog
hooks/useTranscriber.ts   microphone capture + WebSocket client
lib/                 api.ts (REST + URLs), export.ts (TXT/PDF), format.ts
types/               shared TypeScript types
```

## How recording works (`useTranscriber`)

1. `getUserMedia` asks for microphone permission.
2. An `AudioWorklet` captures mono audio. Frames are downsampled to 16 kHz PCM16 and sent every ~0.5 s over `WS /ws/transcribe/{id}`.
3. `interim` messages replace the grey "live" line. `final` messages are appended to the editor text, which stays editable.
4. Pause sends a `pause` message (the server finalizes pending text). Stop sends `stop` and waits for `done`.
5. The microphone, audio graph and socket are released on stop, error or unmount. If the socket drops, the text so far is kept.

## Configuration

`NEXT_PUBLIC_API_URL` is the backend URL **as the browser sees it** (default `http://localhost:8000`). It is inlined at build time, so rebuild after changing it. The WebSocket URL is derived from it.

## Develop

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

The browser only allows the microphone on `localhost` or HTTPS.

## Build

```bash
npm run build      # standalone output, used by the Dockerfile
```

## Notes

- PDF export opens the browser print dialog ("Save as PDF") so Hindi/Tamil text renders correctly.
- There is no authentication.
