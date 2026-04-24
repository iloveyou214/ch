export interface UserPublic {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  lastSeen: string;
  isOnline?: boolean;
}

export interface ConversationWithDetails {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  participants: {
    user: UserPublic;
  }[];
  lastMessage?: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
  };
  unreadCount: number;
}

export interface MessageWithSender {
  id: string;
  content: string;
  senderId: string;
  readAt: string | null;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    avatarColor: string;
  };
}

export interface TypingUser {
  userId: string;
  userName: string;
  conversationId: string;
}
