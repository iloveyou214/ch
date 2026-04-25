import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Map: socketId -> userId
const socketUserMap = new Map<string, string>();
// Map: userId -> Set of socketIds
const userSocketMap = new Map<string, Set<string>>();
// Map: conversationId -> Set of userIds currently typing
const typingUsers = new Map<string, Map<string, { userName: string; timeout: NodeJS.Timeout }>>();

function getUserSockets(userId: string): string[] {
  return Array.from(userSocketMap.get(userId) || []);
}

function addSocketUser(socketId: string, userId: string) {
  socketUserMap.set(socketId, userId);
  if (!userSocketMap.has(userId)) {
    userSocketMap.set(userId, new Set());
  }
  userSocketMap.get(userId)!.add(socketId);
}

function removeSocketUser(socketId: string) {
  const userId = socketUserMap.get(socketId);
  if (userId) {
    const sockets = userSocketMap.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        userSocketMap.delete(userId);
        // Broadcast offline status
        broadcastUserStatus(userId, false);
      }
    }
    socketUserMap.delete(socketId);
  }
}

function broadcastUserStatus(userId: string, isOnline: boolean) {
  io.emit('user-status', { userId, isOnline, lastSeen: new Date().toISOString() });
}

function emitToUser(userId: string, event: string, data: any) {
  const sockets = getUserSockets(userId);
  for (const sid of sockets) {
    io.to(sid).emit(event, data);
  }
}

function handleTyping(userId: string, userName: string, conversationId: string, isTyping: boolean) {
  if (!typingUsers.has(conversationId)) {
    typingUsers.set(conversationId, new Map());
  }
  const convTyping = typingUsers.get(conversationId)!;

  if (isTyping) {
    // Clear existing timeout
    if (convTyping.has(userId)) {
      clearTimeout(convTyping.get(userId)!.timeout);
    }
    // Set new timeout to stop typing after 3 seconds
    const timeout = setTimeout(() => {
      handleTyping(userId, userName, conversationId, false);
    }, 3000);
    convTyping.set(userId, { userName, timeout });
  } else {
    if (convTyping.has(userId)) {
      clearTimeout(convTyping.get(userId)!.timeout);
      convTyping.delete(userId);
    }
  }

  // Broadcast typing status to all participants in the conversation
  // Get the typing user list for this conversation (excluding the sender)
  const typingList: { userId: string; userName: string }[] = [];
  convTyping.forEach((val, uid) => {
    if (uid !== userId) {
      typingList.push({ userId: uid, userName: val.userName });
    }
  });

  // Notify the user who is typing that their status is acknowledged (for the full list)
  // And notify other participants about this user's typing
  io.emit('typing-status', {
    conversationId,
    typingUsers: typingList,
    // Also include the current user's typing status for the receiver
    ...(isTyping ? { currentUser: { userId, userName } } : {}),
  });
}

// Get all participants in a conversation except the sender
async function getOtherParticipantIds(conversationId: string, senderId: string): Promise<string[]> {
  const participants = await prisma.conversationParticipant.findMany({
    where: {
      conversationId,
      userId: { not: senderId },
    },
    select: { userId: true },
  });
  return participants.map((p) => p.userId);
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Authenticate with JWT
  socket.on('authenticate', async (data: { token: string }) => {
    try {
      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'chat-app-secret-key-change-in-production';
      const payload = jwt.verify(data.token, secret) as { userId: string; email: string };

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, name: true, lastSeen: true },
      });

      if (!user) {
        socket.emit('auth-error', { message: 'User not found' });
        return;
      }

      addSocketUser(socket.id, payload.userId);
      await prisma.user.update({
        where: { id: payload.userId },
        data: { lastSeen: new Date() },
      });

      socket.emit('authenticated', { userId: payload.userId, name: user.name });
      broadcastUserStatus(payload.userId, true);

      // Send the list of currently online users to the newly authenticated user
      const onlineUsersList: { userId: string; isOnline: boolean; lastSeen: string }[] = [];
      for (const [onlineUserId] of userSocketMap) {
        if (onlineUserId !== payload.userId) {
          const onlineUser = await prisma.user.findUnique({
            where: { id: onlineUserId },
            select: { lastSeen: true },
          });
          if (onlineUser) {
            onlineUsersList.push({
              userId: onlineUserId,
              isOnline: true,
              lastSeen: onlineUser.lastSeen.toISOString(),
            });
          }
        }
      }
      if (onlineUsersList.length > 0) {
        socket.emit('online-users-list', { users: onlineUsersList });
      }

      console.log(`[Socket] Authenticated: ${user.name} (${socket.id})`);
    } catch (error) {
      socket.emit('auth-error', { message: 'Invalid token' });
      console.log(`[Socket] Auth failed for ${socket.id}`);
    }
  });

  // Send message
  socket.on('send-message', async (data: { conversationId: string; content: string }) => {
    const userId = socketUserMap.get(socket.id);
    if (!userId) return;

    if (!data.content?.trim()) return;

    try {
      // Verify participant
      const participant = await prisma.conversationParticipant.findFirst({
        where: { userId, conversationId: data.conversationId },
      });
      if (!participant) return;

      const message = await prisma.message.create({
        data: {
          conversationId: data.conversationId,
          senderId: userId,
          content: data.content.trim(),
        },
        include: {
          sender: { select: { id: true, name: true, avatarColor: true } },
        },
      });

      await prisma.conversation.update({
        where: { id: data.conversationId },
        data: { updatedAt: new Date() },
      });

      // Emit to sender
      emitToUser(userId, 'new-message', {
        ...message,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt?.toISOString() ?? null,
      });

      // Emit to other participants
      const otherUserIds = await getOtherParticipantIds(data.conversationId, userId);
      for (const otherUserId of otherUserIds) {
        emitToUser(otherUserId, 'new-message', {
          ...message,
          createdAt: message.createdAt.toISOString(),
          readAt: message.readAt?.toISOString() ?? null,
        });
      }

      // Update conversation list for all participants
      const allParticipants = await prisma.conversationParticipant.findMany({
        where: { conversationId: data.conversationId },
        include: {
          user: { select: { id: true, name: true, email: true, avatarColor: true, lastSeen: true } },
        },
      });

      for (const p of allParticipants) {
        emitToUser(p.userId, 'conversation-updated', {
          id: data.conversationId,
          lastMessage: {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            createdAt: message.createdAt.toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('[Socket] Send message error:', error);
    }
  });

  // Typing indicator
  socket.on('typing', async (data: { conversationId: string; isTyping: boolean }) => {
    const userId = socketUserMap.get(socket.id);
    if (!userId) return;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (!user) return;

      handleTyping(userId, user.name, data.conversationId, data.isTyping);

      // Notify other participants
      const otherUserIds = await getOtherParticipantIds(data.conversationId, userId);
      for (const otherUserId of otherUserIds) {
        emitToUser(otherUserId, 'typing-status', {
          conversationId: data.conversationId,
          typingUsers: data.isTyping ? [{ userId, userName: user.name }] : [],
        });
      }
    } catch (error) {
      console.error('[Socket] Typing error:', error);
    }
  });

  // Messages read
  socket.on('messages-read', async (data: { conversationId: string }) => {
    const userId = socketUserMap.get(socket.id);
    if (!userId) return;

    try {
      const participant = await prisma.conversationParticipant.findFirst({
        where: { userId, conversationId: data.conversationId },
      });
      if (!participant) return;

      await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: new Date() },
      });

      await prisma.message.updateMany({
        where: {
          conversationId: data.conversationId,
          senderId: { not: userId },
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      // Notify sender that their messages were read
      const otherUserIds = await getOtherParticipantIds(data.conversationId, userId);
      for (const otherUserId of otherUserIds) {
        emitToUser(otherUserId, 'messages-read', {
          conversationId: data.conversationId,
          readBy: userId,
        });
      }
    } catch (error) {
      console.error('[Socket] Messages read error:', error);
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() },
      });
    }
    removeSocketUser(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error(`[Socket] Error (${socket.id}):`, error);
  });
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[Chat Service] WebSocket server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[Chat Service] Shutting down...');
  httpServer.close(() => {
    prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Chat Service] Shutting down...');
  httpServer.close(() => {
    prisma.$disconnect();
    process.exit(0);
  });
});
