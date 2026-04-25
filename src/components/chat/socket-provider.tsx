'use client';

import { createContext, useContext, useCallback, useRef, useEffect, ReactNode } from 'react';
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
  const { user, token } = useAuthStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // Track active conversation for polling
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      activeConvRef.current = state.activeConversationId;
    });
    activeConvRef.current = useChatStore.getState().activeConversationId;
    return unsub;
  }, []);

  // Heartbeat: send presence heartbeat every 10 seconds to stay "online"
  useEffect(() => {
    if (!token) {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      return;
    }

    const sendHeartbeat = async () => {
      const t = tokenRef.current;
      if (!t) return;
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}` },
        });
      } catch { /* silent retry */ }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 10_000);

    const handleUnload = () => {
      const t = tokenRef.current;
      if (!t) return;
      navigator.sendBeacon('/api/presence/offline', JSON.stringify({ token: t }));
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, [token]);

  // Poll online status for conversation participants every 12 seconds
  useEffect(() => {
    if (!token || !user) return;

    const pollStatus = async () => {
      const t = tokenRef.current;
      if (!t) return;

      const chatStore = useChatStore.getState();
      const userIds = new Set<string>();

      for (const conv of chatStore.conversations) {
        const other = conv.participants.find(p => p.user.id !== user.id);
        if (other) userIds.add(other.user.id);
      }

      if (userIds.size === 0) return;

      try {
        const res = await fetch(
          `/api/presence?userIds=${Array.from(userIds).join(',')}`,
          { headers: { Authorization: `Bearer ${t}` } }
        );
        if (res.ok) {
          const data = await res.json();
          for (const [uid, status] of Object.entries(data.statuses)) {
            const s = status as { isOnline: boolean; lastSeen: string };
            chatStore.setUserOnlineStatus(uid, s.isOnline, s.lastSeen);
          }
        }
      } catch { /* silent */ }
    };

    pollStatus();
    statusPollRef.current = setInterval(pollStatus, 12_000);
    return () => { if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; } };
  }, [token, user]);

  // HTTP Polling for new messages
  useEffect(() => {
    if (!token) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
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
      } catch { /* silent retry */ }
    };

    pollIntervalRef.current = setInterval(poll, 2_000);
    poll();

    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } };
  }, [token]);

  const emitSendMessage = useCallback(
    async (conversationId: string, content: string) => {
      if (!token || !content.trim()) return;
      try {
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  const emitTyping = useCallback(() => {
    // Typing is local-only in polling mode
  }, []);

  const emitMessagesRead = useCallback(
    (conversationId: string) => {
      if (!token) return;
      fetch(`/api/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    },
    [token]
  );

  return (
    <SocketContext.Provider value={{ isConnected: true, emitTyping, emitSendMessage, emitMessagesRead }}>
      {children}
    </SocketContext.Provider>
  );
}
