import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true, name: true, email: true, avatarColor: true, lastSeen: true, createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
