# syntax=docker/dockerfile:1
#
# Nelko P21 print-server image.
#   stage "web"     -> builds the React/Vite app into /app/dist
#   stage "runtime" -> tiny Python image that serves dist/ and bridges Bluetooth
#
# Build from the repo root:  docker build -t nelko-p21 .

# ---- 1) Build the web app ---------------------------------------------------
FROM node:24-slim AS web
WORKDIR /app
# Install deps first for layer caching.
COPY app/package.json app/package-lock.json ./
RUN npm ci
# Then the sources and build.
COPY app/ ./
RUN npm run build

# ---- 2) Runtime: serve dist/ + WebSocket<->Bluetooth pipe -------------------
FROM python:3.13-slim AS runtime
RUN pip install --no-cache-dir "aiohttp>=3.10"
WORKDIR /srv
COPY tools/server.py ./server.py
COPY --from=web /app/dist ./dist
ENV STATIC_DIR=/srv/dist \
    HOST=0.0.0.0 \
    PORT=8080 \
    BT=on
EXPOSE 8080
CMD ["python", "server.py"]
