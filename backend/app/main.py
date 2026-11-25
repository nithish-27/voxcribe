import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.api.routes import dashboard, transcriptions
from app.core.config import get_settings
from app.services.speech.base import SpeechProviderError
from app.services.speech.speech_factory import get_provider
from app.websocket import transcription as ws_transcription

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("voxcribe")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:  # preload so the first recording doesn't wait for the model
        await run_in_threadpool(get_provider)
    except SpeechProviderError as exc:
        log.error("STT provider unavailable: %s", exc)
    yield


app = FastAPI(title="Voxcribe API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
app.include_router(transcriptions.router)
app.include_router(dashboard.router)
app.include_router(ws_transcription.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "stt_provider": settings.stt_provider, "stt_model": settings.whisper_model}
