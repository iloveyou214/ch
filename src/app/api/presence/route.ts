import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

const ONLINE_THRESHOLD_MS = 30_000; // 30 seconds = online

// POST /api/presence/heartbeat - "I'm still here"
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    await db.user.update({
      where: { id: payload.userId },
      data: { lastSeen: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/presence/status?userIds=xxx,yyy - Get online status of specific users
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const userIdsParam = req.nextUrl.searchParams.get('userIds');
    if (!userIdsParam) {
      return NextResponse.json({ statuses: {} });
    }

    const userIds = userIdsParam.split(',').filter(Boolean);
    const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS);

    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lastSeen: true },
    });

    const statuses: Record<string, { isOnline: boolean; lastSeen: string }> = {};
    for (const user of users) {
      statuses[user.id] = {
        isOnline: user.lastSeen > threshold,
        lastSeen: user.lastSeen.toISOString(),
      };
    }

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
