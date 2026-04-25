import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/presence/offline - Mark user as offline
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ ok: true });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ ok: true });

    // Set lastSeen to 60 seconds ago so they appear offline
    const offlineTime = new Date(Date.now() - 60_000);
    await db.user.update({
      where: { id: payload.userId },
      data: { lastSeen: offlineTime },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
