"""Chunk-based incremental transcription (NOT token-level streaming).

Whisper has no native streaming. Audio is appended to a buffer; every step re-transcribes the
whole uncommitted buffer (overlapping windows). Segments that are followed by a later segment are
"stable" and committed as final; the audio they cover is dropped, so they are never emitted twice.
The last segment stays "interim" and is re-decoded on the next step, when more context exists.
"""
import re
import threading

import numpy as np

from app.services.speech.base import SpeechProvider

SAMPLE_RATE = 16000
MIN_STEP_SECONDS = 0.5


class InvalidAudio(ValueError):
    pass


def tag_languages(text: str, primary: str | None) -> list[str]:
    """Whisper reports one language per window; add 'en' when Latin words appear in non-English text."""
    langs = [primary] if primary else []
    if primary != "en" and re.search(r"[A-Za-z]{2,}", text):
        langs.append("en")
    return langs


class StreamingSession:
    def __init__(self, provider: SpeechProvider, max_window: float = 25.0, max_total: float = 3600.0) -> None:
        self._provider = provider
        self._max_window = max_window
        self._max_total_bytes = int(max_total * SAMPLE_RATE) * 2
        self._buf = bytearray()
        self._total_bytes = 0
        self._offset = 0.0  # session time at the start of _buf
        self._seq = 0
        self._dirty = False
        self._lock = threading.Lock()  # guards _buf/_dirty (appended from the event loop)
        self._step_lock = threading.Lock()  # one transcription step at a time
        self.languages: list[str] = []

    @property
    def has_new_audio(self) -> bool:
        return self._dirty

    @property
    def duration(self) -> float:
        return self._total_bytes / 2 / SAMPLE_RATE

    def append(self, chunk: bytes) -> None:
        """PCM16 little-endian, mono, 16 kHz."""
        if not chunk or len(chunk) % 2:
            raise InvalidAudio("Empty or misaligned PCM16 chunk")
        with self._lock:
            if self._total_bytes + len(chunk) > self._max_total_bytes:
                raise InvalidAudio("Session audio limit reached")
            self._buf += chunk
            self._total_bytes += len(chunk)
            self._dirty = True

    def step(self, flush: bool = False) -> list[dict]:
        """Blocking. Returns events: zero or more 'final' then one 'interim' (empty text clears it)."""
        with self._step_lock:
            with self._lock:
                data = bytes(self._buf)
                self._dirty = False
            duration = len(data) // 2 / SAMPLE_RATE
            if duration < MIN_STEP_SECONDS:
                return [{"type": "interim", "text": ""}] if flush else []

            audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            result = self._provider.transcribe(audio)
            segs = [s for s in result.segments if s.text.strip()]

            if flush:
                commit, rest, consumed = segs, [], duration
            elif len(segs) >= 2:
                commit, rest, consumed = segs[:-1], segs[-1:], segs[-2].end
            elif segs and duration >= self._max_window:
                commit, rest, consumed = segs, [], duration
            else:
                commit, rest, consumed = [], segs, 0.0

            events: list[dict] = []
            for s in commit:
                self._seq += 1
                langs = tag_languages(s.text, s.language)
                self.languages += [lang for lang in langs if lang not in self.languages]
                events.append({
                    "type": "final", "seq": self._seq, "text": s.text.strip(), "language": s.language,
                    "languages": langs, "start": self._offset + s.start, "end": self._offset + s.end,
                })

            if consumed > 0:
                nbytes = min(int(consumed * SAMPLE_RATE) * 2, len(data))
                with self._lock:  # audio appended meanwhile stays after the trimmed prefix
                    del self._buf[:nbytes]
                self._offset += nbytes / 2 / SAMPLE_RATE

            events.append({"type": "interim", "text": " ".join(s.text.strip() for s in rest)})
            return events
