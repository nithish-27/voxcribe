import numpy as np
import pytest

from app.services.speech.base import Segment, SpeechProvider, TranscriptionResult
from app.services.transcription_service import SAMPLE_RATE, InvalidAudio, StreamingSession


class FakeProvider(SpeechProvider):
    name = "fake"

    def __init__(self, segments: list[Segment]) -> None:
        self.segments = segments

    def transcribe(self, audio, language=None):
        return TranscriptionResult(self.segments, "hi")

    def detect_language(self, audio):
        return "hi"


def pcm(seconds: float) -> bytes:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.int16).tobytes()


def test_commits_stable_segments_once_and_keeps_last_interim():
    segs = [Segment("आज weather", 0, 2, "hi"), Segment("बहुत अच्छा", 2.5, 4, "hi")]
    s = StreamingSession(FakeProvider(segs))
    s.append(pcm(5))
    events = s.step()
    assert [e["type"] for e in events] == ["final", "interim"]
    assert events[0]["text"] == "आज weather"
    assert events[0]["languages"] == ["hi", "en"]  # code-switching tag
    assert events[1]["text"] == "बहुत अच्छा"
    # audio up to the committed segment was dropped, so the same final can't repeat
    assert len(s._buf) == int(3 * SAMPLE_RATE) * 2


def test_flush_commits_everything():
    s = StreamingSession(FakeProvider([Segment("hello", 0, 1, "en")]))
    s.append(pcm(2))
    events = s.step(flush=True)
    assert events[0]["type"] == "final" and events[-1] == {"type": "interim", "text": ""}
    assert s.languages == ["en"]


def test_rejects_invalid_audio():
    s = StreamingSession(FakeProvider([]))
    with pytest.raises(InvalidAudio):
        s.append(b"")
    with pytest.raises(InvalidAudio):
        s.append(b"\x00\x00\x00")
