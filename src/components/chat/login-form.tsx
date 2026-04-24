'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Loader2 } from 'lucide-react';

export function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      setUser(data.user, data.token);
      router.push('/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
            <MessageCircle className="h-7 w-7 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
          <CardDescription>Sign in to your ChatFlow account</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={onSwitch} className="text-emerald-600 hover:text-emerald-700 font-medium">
                Sign up
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
