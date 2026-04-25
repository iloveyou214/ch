'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, LogOut, X, MessageCircle, Wifi, WifiOff } from 'lucide-react';
import { useSocket } from './socket-provider';
import { formatTimeAgo } from '@/lib/format';
import type { ConversationWithDetails, UserPublic } from '@/lib/types';

export function ChatSidebar() {
  const { user, token, logout } = useAuthStore();
  const { isConnected } = useSocket();
  const {
    conversations,
    activeConversationId,
    onlineUsers,
    searchQuery,
    setActiveConversation,
    setConversations,
    setSearchQuery,
    addConversation,
  } = useChatStore();

  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<UserPublic[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }, [token, setConversations]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim() || !token) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users);
        }
      } catch {
        console.error('Search failed');
      } finally {
        setIsSearching(false);
      }
    },
    [token, setSearchQuery]
  );

  const startConversation = async (otherUser: UserPublic) => {
    if (!token) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: otherUser.id }),
      });
      if (res.ok) {
        const data = await res.json();
        addConversation(data.conversation);
        setActiveConversation(data.conversation.id);
        setSearchMode(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/login', {
        method: 'DELETE',
      });
    } finally {
      logout();
    }
  };

  const getOtherUser = (conv: ConversationWithDetails): UserPublic | null => {
    if (!user) return null;
    return conv.participants.find((p) => p.user.id !== user.id)?.user ?? null;
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">ChatFlow</h1>
            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isConnected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span>{isConnected ? 'Live' : 'Connecting...'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchMode(!searchMode)}
              className="h-9 w-9 text-gray-500 hover:text-gray-900"
            >
              {searchMode ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 text-gray-500 hover:text-red-500"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {searchMode && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-10 bg-gray-50"
              autoFocus
            />
          </div>
        )}

        {!searchMode && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 h-10 bg-gray-50"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {searchMode ? (
          <ScrollArea className="h-full">
            <div className="p-2">
              {isSearching && (
                <div className="p-4 text-center text-sm text-gray-400">Searching...</div>
              )}
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversation(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div
                    className="relative flex-shrink-0"
                    style={{ width: 48, height: 48 }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                      style={{ backgroundColor: u.avatarColor }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    {onlineUsers[u.id]?.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-gray-900 truncate">{u.name}</p>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                  </div>
                </button>
              ))}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-400">No users found</div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-2">
              {conversations.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
                    <MessageCircle className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No conversations yet</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Click + to find and start chatting
                  </p>
                </div>
              )}
              {conversations
                .filter(
                  (conv) =>
                    !searchQuery ||
                    getOtherUser(conv)?.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((conv) => {
                  const otherUser = getOtherUser(conv);
                  if (!otherUser) return null;
                  const isActive = activeConversationId === conv.id;
                  const isOnline = onlineUsers[otherUser.id]?.isOnline ?? false;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConversation(conv.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isActive ? 'bg-emerald-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                          style={{ backgroundColor: otherUser.avatarColor }}
                        >
                          {otherUser.name.charAt(0).toUpperCase()}
                        </div>
                        {isOnline && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900 truncate">{otherUser.name}</p>
                          {conv.lastMessage && (
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                              {formatTimeAgo(new Date(conv.lastMessage.createdAt))}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-500 truncate">
                            {conv.lastMessage
                              ? `${conv.lastMessage.senderId === user?.id ? 'You: ' : ''}${conv.lastMessage.content}`
                              : 'No messages yet'}
                          </p>
                          {conv.unreadCount > 0 && (
                            <Badge
                              variant="default"
                              className="flex-shrink-0 ml-2 bg-emerald-500 hover:bg-emerald-600 text-xs px-1.5 py-0.5 min-w-[20px] flex items-center justify-center rounded-full"
                            >
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
