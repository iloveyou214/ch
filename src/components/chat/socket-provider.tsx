'use client';

import { createContext, useContext, useCallback, useReducer, useRef, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

interface SocketContextType {
  isConnected: boolean;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  emitSendMessage: (conversationId: string, content: string) => void;
  emitMessagesRead: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  emitTyping: () => {},
  emitSendMessage: () => {},
  emitMessagesRead: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

type ConnectionAction = { type: 'connect' } | { type: 'disconnect' } | { type: 'logout' };

function connectionReducer(state: boolean, action: ConnectionAction): boolean {
  switch (action.type) {
    case 'connect': return true;
    case 'disconnect': return false;
    case 'logout': return false;
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  const [isConnected, dispatchIsConnected] = useReducer(connectionReducer, false);
  const socketRef = useRef<Socket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const destroyedRef = useRef(false);

  // Keep token ref updated
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Track active conversation for polling
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      activeConvRef.current = state.activeConversationId;
    });
    activeConvRef.current = useChatStore.getState().activeConversationId;
    return unsub;
  }, []);

  // Handle logout state reset
  useEffect(() => {
    if (!token) {
      dispatchIsConnected({ type: 'logout' });
    }
  }, [token]);

  // Initialize Socket.io connection
  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    destroyedRef.current = false;

    const connectSocket = () => {
      if (destroyedRef.current || !tokenRef.current) return;

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const socket = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (destroyedRef.current) return;
        console.log('[Socket] Connected:', socket.id);
        dispatchIsConnected({ type: 'connect' });
        socket.emit('authenticate', { token: tokenRef.current });
      });

      socket.on('authenticated', (data: { userId: string; name: string }) => {
        console.log('[Socket] Authenticated as:', data.name);
      });

      // Receive initial list of online users after authentication
      socket.on('online-users-list', (data: { users: { userId: string; isOnline: boolean; lastSeen: string }[] }) => {
        const store = useChatStore.getState();
        for (const u of data.users) {
          store.setUserOnlineStatus(u.userId, u.isOnline, u.lastSeen);
        }
      });

      socket.on('auth-error', (data: { message: string }) => {
        console.error('[Socket] Auth error:', data.message);
      });

      socket.on('disconnect', (reason) => {
        if (destroyedRef.current) return;
        console.log('[Socket] Disconnected:', reason);
        dispatchIsConnected({ type: 'disconnect' });
      });

      socket.on('connect_error', (error) => {
        if (destroyedRef.current) return;
        console.error('[Socket] Connection error:', error.message);
        dispatchIsConnected({ type: 'disconnect' });
      });

      // Listen for user online/offline status changes
      socket.on('user-status', (data: { userId: string; isOnline: boolean; lastSeen: string }) => {
        useChatStore.getState().setUserOnlineStatus(data.userId, data.isOnline, data.lastSeen);
      });

      // Listen for new messages (real-time)
      socket.on('new-message', (data: any) => {
        const chatStore = useChatStore.getState();
        if (chatStore.activeConversationId === data.conversationId) {
          chatStore.addMessage(data);
        }
        chatStore.refreshConversations?.();
      });

      // Listen for conversation updates
      socket.on('conversation-updated', () => {
        useChatStore.getState().refreshConversations?.();
      });

      // Listen for typing status
      socket.on('typing-status', (data: { conversationId: string; typingUsers: { userId: string; userName: string }[] }) => {
        useChatStore.getState().setTypingUsers(data.conversationId, data.typingUsers);
      });

      // Listen for messages read receipts
      socket.on('messages-read', (data: { conversationId: string; readBy: string }) => {
        const chatStore = useChatStore.getState();
        if (chatStore.activeConversationId === data.conversationId) {
          const updatedMessages = chatStore.messages.map((msg) => ({
            ...msg,
            readAt: msg.senderId === data.readBy ? null : msg.readAt,
          }));
          useChatStore.setState({ messages: updatedMessages });
        }
      });

      socket.connect();
    };

    connectSocket();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token]);

  // HTTP Polling as fallback/reinforcement for messages
  useEffect(() => {
    if (!token) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const convId = activeConvRef.current;
      const t = tokenRef.current;
      if (!convId || !t) return;

      try {
        const lastMsg = useChatStore.getState().messages;
        const since = lastMsg.length > 0
          ? lastMsg[lastMsg.length - 1].createdAt
          : new Date(0).toISOString();

        const res = await fetch(
          `/api/conversations/${convId}/poll?since=${encodeURIComponent(since)}`,
          { headers: { Authorization: `Bearer ${t}` } }
        );

        if (res.ok) {
          const data = await res.json();
          for (const msg of data.messages) {
            useChatStore.getState().addMessage(msg);
          }

          if (data.messages.length > 0) {
            useChatStore.getState().setTypingUsers(convId, []);
          }
        }
      } catch {
        // Silently retry on next poll
      }
    };

    pollIntervalRef.current = setInterval(poll, 3000);
    poll();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [token]);

  const emitSendMessage = useCallback(
    async (conversationId: string, content: string) => {
      if (!token || !content.trim()) return;

      if (socketRef.current?.connected) {
        socketRef.current.emit('send-message', { conversationId, content: content.trim() });
        return;
      }

      try {
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationId, content }),
        });

        if (res.ok) {
          const data = await res.json();
          useChatStore.getState().addMessage(data.message);
          useChatStore.getState().refreshConversations?.();
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    },
    [token]
  );

  const emitTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('typing', { conversationId, isTyping });
      }
    },
    []
  );

  const emitMessagesRead = useCallback(
    (conversationId: string) => {
      if (!token) return;
      if (socketRef.current?.connected) {
        socketRef.current.emit('messages-read', { conversationId });
        return;
      }
      fetch(`/api/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    },
    [token]
  );

  return (
    <SocketContext.Provider value={{ isConnected, emitTyping, emitSendMessage, emitMessagesRead }}>
      {children}
    </SocketContext.Provider>
  );
}
