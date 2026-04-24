'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { LoginForm } from '@/components/chat/login-form';
import { RegisterForm } from '@/components/chat/register-form';
import { AuthProvider } from '@/components/chat/auth-provider';
import { SocketProvider } from '@/components/chat/socket-provider';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatWindow } from '@/components/chat/chat-window';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

function ChatApp() {
  const [showSidebar, setShowSidebar] = useState(true);
  const { activeConversationId, setActiveConversation } = useChatStore();

  useEffect(() => {
    const handleResize = () => {
      setShowSidebar(window.innerWidth >= 768 || !activeConversationId);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeConversationId]);

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div
        className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-[340px] flex-shrink-0`}
      >
        <ChatSidebar />
      </div>

      {/* Chat area */}
      <div className={`${showSidebar && !activeConversationId ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {/* Mobile back button */}
        <div className="md:hidden bg-white border-b border-gray-100">
          {activeConversationId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                setActiveConversation(null);
                setShowSidebar(true);
              }}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
        </div>
        <ChatWindow />
      </div>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('auth');
      if (mode === 'login' || mode === 'register') return mode;
    }
    return 'login';
  });

  if (!isAuthenticated) {
    if (authMode === 'register') {
      return <RegisterForm onSwitch={() => setAuthMode('login')} />;
    }
    return <LoginForm onSwitch={() => setAuthMode('register')} />;
  }

  return (
    <AuthProvider>
      <SocketProvider>
        <ChatApp />
      </SocketProvider>
    </AuthProvider>
  );
}
