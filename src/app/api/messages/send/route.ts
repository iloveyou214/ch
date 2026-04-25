import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/messages/send - Send a new message
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { conversationId, content } = await req.json();
    if (!conversationId || !content?.trim()) {
      return NextResponse.json({ error: 'Conversation ID and content are required' }, { status: 400 });
    }

    const participant = await db.conversationParticipant.findFirst({
      where: { userId: payload.userId, conversationId },
    });
    if (!participant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const message = await db.message.create({
      data: {
        conversationId,
        senderId: payload.userId,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, avatarColor: true } },
      },
    });

    await db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(
      {
        message: {
          ...message,
          conversationId,
          createdAt: message.createdAt.toISOString(),
          readAt: message.readAt?.toISOString() ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
