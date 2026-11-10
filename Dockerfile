# Stage 1: build the 3D page with Node. Nothing from this stage ships except web/dist.
FROM node:22.17.0-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm test && npm run build

# Stage 2: the image that ships. A slim, pinned Python base, dependencies before code, non-root.
FROM python:3.12.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py content.json ./
COPY planets/ planets/
COPY templates/ templates/
COPY static/ static/
COPY --from=web /web/dist web/dist
RUN useradd --uid 10001 --no-create-home galaxy
USER 10001
# CI passes the commit's tag in, so the page and /health show which image is running.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "app:app"]
