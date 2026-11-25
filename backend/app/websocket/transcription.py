import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.services.speech.base import SpeechProviderError
from app.services.speech.speech_factory import get_provider
from app.services.transcription_service import InvalidAudio, StreamingSession

log = logging.getLogger(__name__)
router = APIRouter()

# Client -> server: binary frames of PCM16 mono 16 kHz, or JSON {"type": "pause" | "stop"}.
# Server -> client: {"type": "ready" | "interim" | "final" | "paused" | "done" | "error", ...}


@router.websocket("/ws/transcribe/{session_id}")
async def transcribe(ws: WebSocket, session_id: str) -> None:
    settings = get_settings()
    origin = ws.headers.get("origin")
    if origin and origin not in settings.origins:
        log.warning("Rejected WS origin %s", origin)
        await ws.close(code=1008)
        return
    await ws.accept()

    send_lock = asyncio.Lock()

    async def send(payload: dict) -> None:
        async with send_lock:
            await ws.send_json(payload)

    try:
        provider = await run_in_threadpool(get_provider)
    except SpeechProviderError as exc:
        await send({"type": "error", "message": str(exc), "fatal": True})
        await ws.close(code=1011)
        return

    session = StreamingSession(provider, settings.max_window_seconds, settings.max_session_seconds)
    wake, stopping = asyncio.Event(), asyncio.Event()

    async def run_step(flush: bool = False) -> None:
        for event in await run_in_threadpool(session.step, flush):
            await send(event)

    async def pump() -> None:
        while not stopping.is_set():
            try:
                await asyncio.wait_for(wake.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            wake.clear()
            if session.has_new_audio:
                await run_step()
            await asyncio.sleep(settings.interim_interval_seconds)

    pump_task = asyncio.create_task(pump())
    log.info("WS session %s started", session_id)
    try:
        await send({"type": "ready"})
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                if len(data) > settings.max_chunk_bytes:
                    await send({"type": "error", "message": "Audio chunk too large", "fatal": False})
                    continue
                try:
                    session.append(data)
                except InvalidAudio as exc:
                    await send({"type": "error", "message": str(exc), "fatal": False})
                    continue
                wake.set()
            elif (raw := msg.get("text")) is not None:
                try:
                    kind = json.loads(raw).get("type")
                except (json.JSONDecodeError, AttributeError):
                    await send({"type": "error", "message": "Invalid control message", "fatal": False})
                    continue
                if kind == "pause":
                    await run_step(flush=True)
                    await send({"type": "paused"})
                elif kind == "stop":
                    stopping.set()
                    await pump_task
                    await run_step(flush=True)
                    await send({"type": "done", "duration": session.duration, "languages": session.languages})
                    break
    except WebSocketDisconnect:
        pass
    except SpeechProviderError as exc:
        try:
            await send({"type": "error", "message": str(exc), "fatal": True})
        except Exception:
            pass
    except RuntimeError:  # socket already closed while sending
        pass
    finally:
        stopping.set()
        pump_task.cancel()
        log.info("WS session %s closed", session_id)
        try:
            await ws.close()
        except Exception:
            pass
