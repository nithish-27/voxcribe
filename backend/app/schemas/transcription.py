import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Content = Annotated[str, StringConstraints(max_length=1_000_000)]


class SegmentIn(BaseModel):
    text: str = Field(max_length=10_000)
    language: str | None = Field(default=None, max_length=16)
    start_time: float = Field(default=0, ge=0)
    end_time: float = Field(default=0, ge=0)
    is_final: bool = True


class SegmentOut(SegmentIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sequence_number: int


class TranscriptionCreate(BaseModel):
    title: Title | None = None  # auto-generated from content when omitted
    content: Content
    detected_languages: list[str] = Field(default_factory=list, max_length=20)
    duration_seconds: float = Field(default=0, ge=0)
    segments: list[SegmentIn] = Field(default_factory=list, max_length=5000)


class TranscriptionUpdate(BaseModel):
    title: Title | None = None
    content: Content | None = None


class TranscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    detected_languages: list[str]
    duration_seconds: float
    word_count: int
    status: str
    created_at: datetime
    updated_at: datetime


class TranscriptionDetail(TranscriptionOut):
    segments: list[SegmentOut]


class TranscriptionPage(BaseModel):
    items: list[TranscriptionOut]
    total: int
    page: int
    page_size: int


class DashboardStats(BaseModel):
    total_transcriptions: int
    total_words: int
    total_duration_seconds: float
    latest: TranscriptionOut | None
