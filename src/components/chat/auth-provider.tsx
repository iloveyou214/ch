'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, token, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.push('/?auth=login');
      return;
    }

    // Verify token is still valid
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (!res.ok) {
        logout();
        router.push('/?auth=login');
      }
    });
  }, [isAuthenticated, token, router, logout]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
