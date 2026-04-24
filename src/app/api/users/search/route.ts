import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const url = new URL(req.url);
    const query = url.searchParams.get('q')?.trim();
    if (!query) {
      return NextResponse.json({ users: [] });
    }

    const users = await db.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query } },
              { email: { contains: query } },
            ],
          },
          { id: { not: payload.userId } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarColor: true,
        lastSeen: true,
      },
      take: 20,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
