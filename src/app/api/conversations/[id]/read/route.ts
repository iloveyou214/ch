import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id: conversationId } = await params;

    const participant = await db.conversationParticipant.findFirst({
      where: { userId: payload.userId, conversationId },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await db.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    await db.message.updateMany({
      where: {
        conversationId,
        senderId: { not: payload.userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
