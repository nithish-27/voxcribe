from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field

import numpy as np


class SpeechProviderError(RuntimeError):
    """Provider unavailable or failed. Surfaced to the client; never replaced by fake text."""


@dataclass
class Segment:
    text: str
    start: float  # seconds, relative to the start of the audio passed to transcribe()
    end: float
    language: str | None = None


@dataclass
class TranscriptionResult:
    segments: list[Segment] = field(default_factory=list)
    language: str | None = None
    language_probability: float = 0.0


class SpeechProvider(ABC):
    """Audio everywhere is mono float32 in [-1, 1] at 16 kHz."""

    name: str

    @abstractmethod
    def transcribe(self, audio: np.ndarray, language: str | None = None) -> TranscriptionResult: ...

    @abstractmethod
    def detect_language(self, audio: np.ndarray) -> str | None: ...

    def transcribe_stream(self, audio_chunks: Iterable[np.ndarray]) -> Iterator[TranscriptionResult]:
        """Chunk-based fallback for providers without native streaming: re-transcribe the growing buffer.

        Real-time sessions use StreamingSession (services/transcription_service.py), which also
        commits stable segments and trims the buffer; this default is for simple callers.
        """
        buffer = np.zeros(0, dtype=np.float32)
        for chunk in audio_chunks:
            buffer = np.concatenate([buffer, chunk])
            yield self.transcribe(buffer)

    def close(self) -> None:
        pass
