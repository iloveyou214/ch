'use client';

import { useAuthStore } from '@/lib/auth-store';
import type { MessageWithSender } from '@/lib/types';
import { formatMessageTime } from '@/lib/format';
import { Check, CheckCheck } from 'lucide-react';

export function MessageBubble({ message }: { message: MessageWithSender }) {
  const { user } = useAuthStore();
  const isSent = message.senderId === user?.id;
  const isRead = !!message.readAt;

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`max-w-[75%] sm:max-w-[65%] px-3.5 py-2 rounded-2xl relative ${
          isSent
            ? 'bg-emerald-500 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
        <div
          className={`flex items-center gap-1 mt-1 ${
            isSent ? 'justify-end' : 'justify-start'
          }`}
        >
          <span className={`text-[10px] ${isSent ? 'text-emerald-100' : 'text-gray-400'}`}>
            {formatMessageTime(message.createdAt)}
          </span>
          {isSent && (
            <span className="ml-0.5">
              {isRead ? (
                <CheckCheck className="h-3.5 w-3.5 text-emerald-100" />
              ) : (
                <Check className="h-3.5 w-3.5 text-emerald-200" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
