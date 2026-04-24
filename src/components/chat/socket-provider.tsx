'use client';

import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import type { MessageWithSender } from '@/lib/types';

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

// Shared state outside React for connection status (avoids setState in effect)
let connectedListeners: Set<(connected: boolean) => void> = new Set();
let _isConnected = false;

function setConnected(connected: boolean) {
  _isConnected = connected;
  connectedListeners.forEach((fn) => fn(connected));
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const connectedRef = useRef(false);

  // Subscribe to connection status changes
  useEffect(() => {
    const listener = (connected: boolean) => {
      connectedRef.current = connected;
      // Force re-render
      useAuthStore.setState({});
    };
    connectedListeners.add(listener);
    return () => { connectedListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    const newSocket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('user-status', (data: { userId: string; isOnline: boolean; lastSeen: string }) => {
      useChatStore.getState().setUserOnlineStatus(data.userId, data.isOnline, data.lastSeen);
    });

    newSocket.on('new-message', (message: MessageWithSender) => {
      const state = useChatStore.getState();
      state.addMessage(message);

      if (state.activeConversationId) {
        newSocket.emit('messages-read', { conversationId: state.activeConversationId });
        fetch(`/api/conversations/${state.activeConversationId}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }

      state.refreshConversations?.();
    });

    newSocket.on('typing-status', (data: { conversationId: string; typingUsers: { userId: string; userName: string }[] }) => {
      useChatStore.getState().setTypingUsers(data.conversationId, data.typingUsers);
    });

    newSocket.on('messages-read', (data: { conversationId: string; readBy: string }) => {
      const state = useChatStore.getState();
      if (state.activeConversationId === data.conversationId) {
        useChatStore.setState((s) => ({
          messages: s.messages.map((m) =>
            m.senderId === data.readBy ? { ...m, readAt: new Date().toISOString() } : m
          ),
        }));
      }
    });

    newSocket.on('conversation-updated', () => {
      useChatStore.getState().refreshConversations?.();
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing', { conversationId, isTyping });
  }, []);

  const emitSendMessage = useCallback((conversationId: string, content: string) => {
    socketRef.current?.emit('send-message', { conversationId, content });
  }, []);

  const emitMessagesRead = useCallback((conversationId: string) => {
    socketRef.current?.emit('messages-read', { conversationId });
  }, []);

  return (
    <SocketContext.Provider value={{ isConnected: _isConnected, emitTyping, emitSendMessage, emitMessagesRead }}>
      {children}
    </SocketContext.Provider>
  );
}
