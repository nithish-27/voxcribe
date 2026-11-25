import logging
import threading

import numpy as np

from app.core.config import Settings
from app.services.speech.base import Segment, SpeechProvider, SpeechProviderError, TranscriptionResult

log = logging.getLogger(__name__)


class FasterWhisperProvider(SpeechProvider):
    name = "faster_whisper"

    def __init__(self, settings: Settings) -> None:
        try:
            from faster_whisper import WhisperModel

            log.info("Loading Faster-Whisper model '%s' (%s/%s)", settings.whisper_model,
                     settings.whisper_device, settings.whisper_compute_type)
            self._model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
                download_root=settings.whisper_model_dir,
            )
        except Exception as exc:  # model missing, bad device, import error...
            raise SpeechProviderError(f"Faster-Whisper failed to load: {exc}") from exc
        # CTranslate2 model is shared by every WebSocket session; serialize calls.
        self._lock = threading.Lock()

    def transcribe(self, audio: np.ndarray, language: str | None = None) -> TranscriptionResult:
        try:
            with self._lock:
                # language=None -> Whisper auto-detects; task stays "transcribe" so nothing is translated.
                segments, info = self._model.transcribe(
                    audio,
                    language=language,
                    task="transcribe",
                    vad_filter=True,
                    beam_size=1,
                    condition_on_previous_text=False,
                )
                out = [Segment(s.text.strip(), s.start, s.end, info.language) for s in segments]
        except ValueError:
            # VAD removed all audio (silence); faster-whisper 1.0.3 then crashes in language detection.
            return TranscriptionResult()
        except Exception as exc:
            log.exception("Transcription failed")
            raise SpeechProviderError(f"Transcription failed: {exc}") from exc
        return TranscriptionResult(out, info.language, info.language_probability)

    def detect_language(self, audio: np.ndarray) -> str | None:
        try:
            with self._lock:
                _, info = self._model.transcribe(audio[: 30 * 16000], language=None)
            return info.language
        except Exception as exc:
            raise SpeechProviderError(f"Language detection failed: {exc}") from exc
