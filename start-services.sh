#!/bin/bash
# Start all services for the chat application
cd /home/z/my-project

# Start chat service
cd /home/z/my-project/mini-services/chat-service
DATABASE_URL="file:../../db/custom.db" JWT_SECRET="chat-app-secret-key-change-in-production" bun --hot index.ts &
CHAT_PID=$!
echo "Chat service started (PID: $CHAT_PID) on port 3003"

# Start Next.js dev
cd /home/z/my-project
bunx next dev -p 3000 2>&1 | tee /home/z/my-project/dev.log &
NEXT_PID=$!
echo "Next.js dev started (PID: $NEXT_PID) on port 3000"

# Wait for servers
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "All servers ready!"
    break
  fi
  sleep 1
done

# Keep script alive
wait
