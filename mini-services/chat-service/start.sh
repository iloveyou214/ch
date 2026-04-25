#!/bin/bash
# Auto-restart wrapper for chat service
cd "$(dirname "$0")"
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export JWT_SECRET="chat-app-secret-key-change-in-production"

while true; do
  echo "[$(date)] Starting chat service..."
  bun --hot index.ts 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Chat service exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
