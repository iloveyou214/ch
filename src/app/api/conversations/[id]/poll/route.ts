import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/conversations/[id]/poll - Poll for new messages (real-time simulation)
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
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');

    const participant = await db.conversationParticipant.findFirst({
      where: { userId: payload.userId, conversationId },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const since = sinceParam ? new Date(sinceParam) : new Date(0);

    const newMessages = await db.message.findMany({
      where: {
        conversationId,
        createdAt: { gt: since },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatarColor: true } },
      },
    });

    // Get unread count
    const unreadCount = await db.message.count({
      where: {
        conversationId,
        senderId: { not: payload.userId },
        createdAt: { gt: participant.lastReadAt },
        readAt: null,
      },
    });

    // Mark received messages as read
    if (newMessages.some((m) => m.senderId !== payload.userId)) {
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
    }

    return NextResponse.json({
      messages: newMessages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      })),
      unreadCount,
    });
  } catch (error) {
    console.error('Poll error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
