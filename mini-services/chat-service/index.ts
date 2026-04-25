import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer((req, res) => {
  // Simple HTTP endpoint for Next.js API routes to broadcast events
  if (req.method === 'POST' && req.url === '/api/notify') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { targetUserIds, event, payload } = data;

        if (event && payload) {
          if (targetUserIds && Array.isArray(targetUserIds)) {
            for (const userId of targetUserIds) {
              emitToUser(userId, event, payload);
            }
          } else {
            io.emit(event, payload);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: socketUserMap.size }));
    return;
  }

  // Let Socket.io handle its own routes
  res.writeHead(404);
  res.end('Not found');
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 15000,
});

// Lightweight in-memory maps (no database)
const socketUserMap = new Map<string, string>(); // socketId -> userId
const userSocketMap = new Map<string, Set<string>>(); // userId -> Set<socketId>

function addUserSocket(socketId: string, userId: string) {
  socketUserMap.set(socketId, userId);
  if (!userSocketMap.has(userId)) {
    userSocketMap.set(userId, new Set());
  }
  userSocketMap.get(userId)!.add(socketId);
}

function removeUserSocket(socketId: string): string | null {
  const userId = socketUserMap.get(socketId);
  if (userId) {
    const sockets = userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        userSocketMap.delete(userId);
        io.emit('user-status', { userId, isOnline: false, lastSeen: new Date().toISOString() });
      }
    }
    socketUserMap.delete(socketId);
  }
  return userId;
}

function emitToUser(userId: string, event: string, data: unknown) {
  const sockets = userSocketMap.get(userId);
  if (!sockets) return;
  for (const sid of sockets) {
    io.to(sid).emit(event, data);
  }
}

// Expose for HTTP handler
declare global {
  var emitToUser: (userId: string, event: string, data: unknown) => void;
  var socketUserMap: Map<string, string>;
}

globalThis.emitToUser = emitToUser;
globalThis.socketUserMap = socketUserMap;

io.on('connection', (socket) => {
  console.log(`[Relay] Connected: ${socket.id}`);

  socket.on('authenticate', (data: { userId: string; name: string }) => {
    addUserSocket(socket.id, data.userId);
    socket.emit('authenticated', { userId: data.userId, name: data.name });

    // Broadcast online
    io.emit('user-status', { userId: data.userId, isOnline: true, lastSeen: new Date().toISOString() });

    // Send online users list
    const onlineUsers: { userId: string; isOnline: boolean }[] = [];
    for (const [uid] of userSocketMap) {
      if (uid !== data.userId) {
        onlineUsers.push({ userId: uid, isOnline: true });
      }
    }
    if (onlineUsers.length > 0) {
      socket.emit('online-users-list', { users: onlineUsers });
    }

    console.log(`[Relay] Auth: ${data.name} (${socket.id})`);
  });

  socket.on('typing', (data: { conversationId: string; userId: string; isTyping: boolean; userName: string }) => {
    const myUserId = socketUserMap.get(socket.id);
    if (!myUserId) return;
    io.emit('typing-status', {
      conversationId: data.conversationId,
      typingUsers: data.isTyping ? [{ userId: myUserId, userName: data.userName }] : [],
    });
  });

  socket.on('messages-read', (data: { conversationId: string }) => {
    const myUserId = socketUserMap.get(socket.id);
    if (!myUserId) return;
    io.emit('messages-read', { conversationId: data.conversationId, readBy: myUserId });
  });

  socket.on('disconnect', () => {
    const userId = removeUserSocket(socket.id);
    console.log(`[Relay] Disconnected: ${socket.id} (user: ${userId || '?'})`);
  });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[Chat Relay] Running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[Chat Relay] Shutting down...');
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Chat Relay] Shutting down...');
  httpServer.close(() => process.exit(0));
});
