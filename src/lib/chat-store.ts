import { create } from 'zustand';
import type { MessageWithSender, ConversationWithDetails } from '@/lib/types';

interface OnlineUser {
  isOnline: boolean;
  lastSeen: string;
}

interface ChatState {
  conversations: ConversationWithDetails[];
  activeConversationId: string | null;
  messages: MessageWithSender[];
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  onlineUsers: Record<string, OnlineUser>;
  typingUsers: Record<string, { userId: string; userName: string }[]>;
  searchQuery: string;

  // Actions
  setConversations: (conversations: ConversationWithDetails[]) => void;
  addConversation: (conversation: ConversationWithDetails) => void;
  refreshConversations: () => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: MessageWithSender[], hasMore: boolean) => void;
  addMessage: (message: MessageWithSender) => void;
  prependMessages: (messages: MessageWithSender[], hasMore: boolean) => void;
  setIsLoadingMessages: (loading: boolean) => void;
  setUserOnlineStatus: (userId: string, isOnline: boolean, lastSeen: string) => void;
  setTypingUsers: (conversationId: string, users: { userId: string; userName: string }[]) => void;
  setSearchQuery: (query: string) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  hasMoreMessages: false,
  isLoadingMessages: false,
  onlineUsers: {},
  typingUsers: {},
  searchQuery: '',

  setConversations: (conversations) =>
    set((state) => {
      const merged = [...conversations];
      for (const existing of state.conversations) {
        if (!merged.find((c) => c.id === existing.id)) {
          merged.push(existing);
        }
      }
      merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return { conversations: merged };
    }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    })),

  refreshConversations: () => {
    const token = useChatStoreToken.getToken();
    if (!token) return;
    fetch('/api/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.conversations) {
          get().setConversations(data.conversations);
        }
      })
      .catch(() => {});
  },

  setActiveConversation: (id) => set({ activeConversationId: id, messages: [], hasMoreMessages: false }),

  setMessages: (messages, hasMore) => set({ messages, hasMoreMessages: hasMore }),

  addMessage: (message) =>
    set((state) => {
      const exists = state.messages.find((m) => m.id === message.id);
      if (exists) return state;
      return { messages: [...state.messages, message] };
    }),

  prependMessages: (messages, hasMore) =>
    set((state) => ({
      messages: [...messages, ...state.messages],
      hasMoreMessages: hasMore,
    })),

  setIsLoadingMessages: (loading) => set({ isLoadingMessages: loading }),

  setUserOnlineStatus: (userId, isOnline, lastSeen) =>
    set((state) => ({
      onlineUsers: { ...state.onlineUsers, [userId]: { isOnline, lastSeen } },
    })),

  setTypingUsers: (conversationId, users) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [conversationId]: users },
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  clearChat: () =>
    set({
      conversations: [],
      activeConversationId: null,
      messages: [],
      hasMoreMessages: false,
      isLoadingMessages: false,
      onlineUsers: {},
      typingUsers: {},
      searchQuery: '',
    }),
}));

// Helper to get token from auth store (avoids circular dependency)
import { useAuthStore } from './auth-store';
const useChatStoreToken = {
  getToken: () => useAuthStore.getState().token,
};
