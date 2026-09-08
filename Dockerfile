FROM python:3.12-slim

# GeoDjango needs these C libraries. This is the whole reason
# native Windows was painful and WSL wasn't.
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils libproj-dev gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copied separately so a code change doesn't reinstall every dependency —
# Docker caches this layer until requirements.txt itself changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]