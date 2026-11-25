from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Transcription
from app.schemas.transcription import DashboardStats

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db)) -> DashboardStats:
    total, words, duration = db.execute(
        select(
            func.count(Transcription.id),
            func.coalesce(func.sum(Transcription.word_count), 0),
            func.coalesce(func.sum(Transcription.duration_seconds), 0.0),
        )
    ).one()
    latest = db.scalars(select(Transcription).order_by(Transcription.created_at.desc()).limit(1)).first()
    return DashboardStats(
        total_transcriptions=total, total_words=int(words), total_duration_seconds=float(duration), latest=latest
    )
