from functools import lru_cache

from app.core.config import get_settings
from app.services.speech.base import SpeechProvider, SpeechProviderError

AVAILABLE = ("faster_whisper",)


@lru_cache
def get_provider() -> SpeechProvider:
    """Add a provider: implement SpeechProvider, add a branch here, set STT_PROVIDER."""
    settings = get_settings()
    if settings.stt_provider == "faster_whisper":
        from app.services.speech.faster_whisper import FasterWhisperProvider

        return FasterWhisperProvider(settings)
    raise SpeechProviderError(
        f"Unknown STT_PROVIDER '{settings.stt_provider}'. Available: {', '.join(AVAILABLE)}"
    )
