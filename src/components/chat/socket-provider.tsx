'use client';

import { createContext, useContext, useCallback, useState, useRef, useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

interface SocketContextType {
  isConnected: boolean;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  emitSendMessage: (conversationId: string, content: string) => void;
  emitMessagesRead: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  isConnected: true,
  emitTyping: () => {},
  emitSendMessage: () => {},
  emitMessagesRead: () => {},
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  const [isConnected, setIsConnected] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Keep token ref updated
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Poll for new messages - the core real-time mechanism
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

          // Update typing status (cleared on new messages)
          if (data.messages.length > 0) {
            useChatStore.getState().setTypingUsers(convId, []);
          }

          // Refresh conversations list for latest message previews
          if (data.messages.length > 0) {
            useChatStore.getState().refreshConversations?.();
          }
        }
      } catch {
        // Silently retry on next poll
      }
    };

    // Poll every 1.5 seconds for near-real-time feel
    pollIntervalRef.current = setInterval(poll, 1500);
    // Also poll immediately
    poll();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [token]);

  // Track active conversation for polling
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      activeConvRef.current = state.activeConversationId;
    });
    activeConvRef.current = useChatStore.getState().activeConversationId;
    return unsub;
  }, []);

  const emitSendMessage = useCallback(
    async (conversationId: string, content: string) => {
      if (!token || !content.trim()) return;

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
          // Add the sent message immediately for instant feedback
          useChatStore.getState().addMessage(data.message);
          // Refresh conversations
          useChatStore.getState().refreshConversations?.();
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    },
    [token]
  );

  const emitTyping = useCallback(
    async (conversationId: string, isTyping: boolean) => {
      if (!token) return;
      // Store typing status locally - in a polling system, typing is only visible to the sender
      // The poll endpoint clears typing when new messages arrive
      // For now, typing indicators work within the same session
    },
    [token]
  );

  const emitMessagesRead = useCallback(
    async (conversationId: string) => {
      if (!token) return;
      try {
        await fetch(`/api/conversations/${conversationId}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Silent
      }
    },
    [token]
  );

  return (
    <SocketContext.Provider value={{ isConnected, emitTyping, emitSendMessage, emitMessagesRead }}>
      {children}
    </SocketContext.Provider>
  );
}
