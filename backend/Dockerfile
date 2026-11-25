FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_DIR=/models

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Faster-Whisper model into the image so the container starts offline.
# Must be a multilingual model (not *.en). Override: --build-arg WHISPER_MODEL=medium
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import download_model; download_model('${WHISPER_MODEL}', cache_dir='/models')"
ENV HF_HUB_OFFLINE=1

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --system --no-create-home app
USER app

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
