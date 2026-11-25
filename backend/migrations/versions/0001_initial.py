"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("detected_languages", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("duration_seconds", sa.Float, nullable=False, server_default="0"),
        sa.Column("word_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_transcriptions_created_at", "transcriptions", ["created_at"])
    op.create_index(
        "ix_transcriptions_languages", "transcriptions", ["detected_languages"], postgresql_using="gin"
    )
    op.create_table(
        "transcription_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "transcription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transcriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence_number", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("language", sa.String(16)),
        sa.Column("start_time", sa.Float, nullable=False, server_default="0"),
        sa.Column("end_time", sa.Float, nullable=False, server_default="0"),
        sa.Column("is_final", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_segments_transcription_seq", "transcription_segments", ["transcription_id", "sequence_number"]
    )


def downgrade() -> None:
    op.drop_table("transcription_segments")
    op.drop_table("transcriptions")
