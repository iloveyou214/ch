'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { useSocket } from './socket-provider';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { formatLastSeen } from '@/lib/format';
import { Loader2 } from 'lucide-react';

export function ChatWindow() {
  const { token, user } = useAuthStore();
  const { emitSendMessage, emitMessagesRead } = useSocket();
  const {
    activeConversationId,
    conversations,
    messages,
    hasMoreMessages,
    isLoadingMessages,
    onlineUsers,
    prependMessages,
    setIsLoadingMessages,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearTop, setIsNearTop] = useState(false);
  const isLoadingMoreRef = useRef(false);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const otherUser = activeConversation
    ? activeConversation.participants.find((p) => p.user.id !== user?.id)?.user ?? null
    : null;

  const otherUserOnline = otherUser ? onlineUsers[otherUser.id] : null;

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId || !token) return;

    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await fetch(`/api/conversations/${activeConversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          useChatStore.getState().setMessages(data.messages, data.hasMore);
          setTimeout(() => scrollToBottom(false), 50);
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    emitMessagesRead(activeConversationId);
    fetchMessages();
  }, [activeConversationId, token, setIsLoadingMessages, scrollToBottom, emitMessagesRead]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Load more messages when scrolling to top
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const isNear = target.scrollTop < 100;
      setIsNearTop(isNear);

      if (isNear && hasMoreMessages && !isLoadingMessages && activeConversationId && token && !isLoadingMoreRef.current) {
        const oldestMessage = messages[0];
        if (!oldestMessage) return;

        isLoadingMoreRef.current = true;
        const loadMore = async () => {
          try {
            const res = await fetch(
              `/api/conversations/${activeConversationId}/messages?cursor=${oldestMessage.id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
              const data = await res.json();
              prependMessages(data.messages, data.hasMore);
            }
          } catch (error) {
            console.error('Failed to load more messages:', error);
          } finally {
            isLoadingMoreRef.current = false;
          }
        };
        loadMore();
      }
    },
    [hasMoreMessages, isLoadingMessages, activeConversationId, token, messages, prependMessages]
  );

  const handleSend = useCallback(
    (content: string) => {
      if (!activeConversationId || !content.trim()) return;
      emitSendMessage(activeConversationId, content);
    },
    [activeConversationId, emitSendMessage]
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      // Typing indicators handled via polling
    },
    []
  );

  // Empty state when no conversation is selected
  if (!activeConversationId || !otherUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-10 w-10 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700">Select a conversation</h3>
          <p className="text-sm text-gray-400 mt-1">
            Choose from your existing conversations or start a new one
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="relative">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: otherUser.avatarColor }}
          >
            {otherUser.name.charAt(0).toUpperCase()}
          </div>
          {otherUserOnline?.isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">{otherUser.name}</h2>
          <p className="text-xs text-gray-500">
            {otherUserOnline?.isOnline
              ? 'online'
              : otherUserOnline?.lastSeen
              ? formatLastSeen(otherUserOnline.lastSeen)
              : 'offline'}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {isNearTop && hasMoreMessages && (
          <div className="flex justify-center mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}

        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <div className="space-y-1">
            {messages.length === 0 && !isLoadingMessages && (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <div className="text-center">
                  <p className="text-gray-400 text-sm">No messages yet</p>
                  <p className="text-gray-300 text-xs mt-1">Send a message to start the conversation</p>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <ChatInput
        onSend={handleSend}
        onTyping={handleTyping}
        conversationId={activeConversationId}
      />
    </div>
  );
}
