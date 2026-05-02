#!/bin/sh
set -eu

IMAGE_NAME="${IMAGE_NAME:-avalon-api:runtime}"
CONTAINER_NAME="${CONTAINER_NAME:-avalon-api-runtime-export}"
OUTPUT_DIR="${OUTPUT_DIR:-release}"
OUTPUT_FILE="${OUTPUT_FILE:-avalon-runtime.tar.gz}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

docker build -t "$IMAGE_NAME" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker create --name "$CONTAINER_NAME" "$IMAGE_NAME" >/dev/null
docker cp "$CONTAINER_NAME:/app/." "$OUTPUT_DIR/app"
docker rm -f "$CONTAINER_NAME" >/dev/null

tar -czf "$OUTPUT_FILE" -C "$OUTPUT_DIR/app" .

echo "Created $OUTPUT_FILE"
