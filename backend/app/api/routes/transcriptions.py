import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Transcription, TranscriptionSegment
from app.schemas.transcription import (
    TranscriptionCreate,
    TranscriptionDetail,
    TranscriptionOut,
    TranscriptionPage,
    TranscriptionUpdate,
)

router = APIRouter(prefix="/api", tags=["transcriptions"])


def auto_title(content: str) -> str:
    words = content.split()
    return " ".join(words[:6])[:60] if words else "Untitled recording"


def _get_or_404(db: Session, transcription_id: uuid.UUID) -> Transcription:
    obj = db.get(Transcription, transcription_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transcription not found")
    return obj


@router.post("/transcriptions", response_model=TranscriptionDetail, status_code=status.HTTP_201_CREATED)
def create_transcription(body: TranscriptionCreate, db: Session = Depends(get_db)) -> Transcription:
    obj = Transcription(
        title=body.title or auto_title(body.content),
        content=body.content,
        detected_languages=body.detected_languages,
        duration_seconds=body.duration_seconds,
        word_count=len(body.content.split()),
        segments=[
            TranscriptionSegment(sequence_number=i, **s.model_dump()) for i, s in enumerate(body.segments, 1)
        ],
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/transcriptions", response_model=TranscriptionPage)
def list_transcriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, max_length=200),
    language: str | None = Query(None, max_length=16),
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["newest", "oldest"] = "newest",
    db: Session = Depends(get_db),
) -> TranscriptionPage:
    stmt = select(Transcription)
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(Transcription.title.ilike(like), Transcription.content.ilike(like)))
    if language:
        stmt = stmt.where(Transcription.detected_languages.contains([language]))
    if date_from:
        stmt = stmt.where(Transcription.created_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        end = datetime.combine(date_to + timedelta(days=1), time.min, timezone.utc)
        stmt = stmt.where(Transcription.created_at < end)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = Transcription.created_at.desc() if sort == "newest" else Transcription.created_at.asc()
    items = db.scalars(stmt.order_by(order).offset((page - 1) * page_size).limit(page_size)).all()
    return TranscriptionPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/languages", response_model=list[str])
def list_languages(db: Session = Depends(get_db)) -> list[str]:
    rows = db.execute(
        text("SELECT DISTINCT jsonb_array_elements_text(detected_languages) AS l FROM transcriptions ORDER BY l")
    )
    return [r.l for r in rows]


@router.get("/transcriptions/{transcription_id}", response_model=TranscriptionDetail)
def get_transcription(transcription_id: uuid.UUID, db: Session = Depends(get_db)) -> Transcription:
    return _get_or_404(db, transcription_id)


@router.put("/transcriptions/{transcription_id}", response_model=TranscriptionOut)
def update_transcription(
    transcription_id: uuid.UUID, body: TranscriptionUpdate, db: Session = Depends(get_db)
) -> Transcription:
    obj = _get_or_404(db, transcription_id)
    if body.title is not None:
        obj.title = body.title
    if body.content is not None:
        obj.content = body.content
        obj.word_count = len(body.content.split())
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/transcriptions/{transcription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transcription(transcription_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_get_or_404(db, transcription_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
