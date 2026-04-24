'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Smile, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOJI_LIST = [
  '😀', '😂', '🥰', '😎', '🤔', '😅', '😭', '🤣',
  '❤️', '👍', '👋', '🙏', '🎉', '🔥', '💯', '✨',
  '😊', '🥺', '😤', '🤗', '😴', '🤩', '😈', '👻',
  '😢', '🥳', '😤', '🤮', '🫡', '🫶', '💅', '🤝',
];

export function ChatInput({
  onSend,
  onTyping,
  conversationId,
}: {
  onSend: (content: string) => void;
  onTyping: (isTyping: boolean) => void;
  conversationId: string;
}) {
  const [message, setMessage] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMessage(e.target.value);
      adjustHeight();
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    },
    [adjustHeight, onTyping]
  );

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTyping(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, onSend, onTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const addEmoji = useCallback((emoji: string) => {
    setMessage((prev) => prev + emoji);
    setEmojiOpen(false);
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <div className="p-3 border-t border-gray-100 bg-white">
      <div className="flex items-end gap-2">
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-gray-400 hover:text-gray-600 flex-shrink-0 rounded-full"
            >
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="top" align="start">
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-gray-100 text-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent max-h-[120px] overflow-y-auto"
          />
        </div>

        <Button
          onClick={handleSend}
          disabled={!message.trim()}
          className="h-10 w-10 rounded-full bg-emerald-500 hover:bg-emerald-600 flex-shrink-0 p-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
