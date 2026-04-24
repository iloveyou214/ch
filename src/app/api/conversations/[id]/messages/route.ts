import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
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

    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      include: {
        sender: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    });

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

    return NextResponse.json({
      messages: messages.reverse(),
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
