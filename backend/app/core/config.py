from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:3000"

    stt_provider: str = "faster_whisper"
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_model_dir: str = "/models"

    # Streaming limits
    max_chunk_bytes: int = 320_000  # 10 s of 16 kHz PCM16 per WebSocket message
    max_session_seconds: int = 3600
    max_window_seconds: float = 25.0  # force-commit a segment once the live window grows past this
    interim_interval_seconds: float = 0.5

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
