import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const participants = await db.conversationParticipant.findMany({
      where: { userId: payload.userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarColor: true, lastSeen: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const conversations = participants.map((p) => {
      const conv = p.conversation;
      const otherParticipant = conv.participants.find((pt) => pt.user.id !== payload.userId);
      const unread = conv.messages.filter(
        (m) => m.senderId !== payload.userId && m.readAt === null && new Date(m.createdAt) > new Date(p.lastReadAt)
      ).length;

      return {
        id: conv.id,
        type: conv.type,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        participants: conv.participants.map((pt) => ({ user: pt.user })),
        lastMessage: conv.messages[0]
          ? {
              id: conv.messages[0].id,
              content: conv.messages[0].content,
              senderId: conv.messages[0].senderId,
              createdAt: conv.messages[0].createdAt,
            }
          : null,
        unreadCount: unread,
        otherUser: otherParticipant?.user ?? null,
      };
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req.headers);
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { userId: otherUserId } = await req.json();
    if (!otherUserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (otherUserId === payload.userId) {
      return NextResponse.json({ error: 'Cannot create conversation with yourself' }, { status: 400 });
    }

    const otherUser = await db.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const existingParticipant = await db.conversationParticipant.findFirst({
      where: {
        userId: payload.userId,
        conversation: {
          type: 'private',
          participants: { some: { userId: otherUserId } },
        },
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarColor: true, lastSeen: true },
                },
              },
            },
          },
        },
      },
    });

    if (existingParticipant) {
      const conv = existingParticipant.conversation;
      const otherParticipant = conv.participants.find((p) => p.user.id !== payload.userId);
      return NextResponse.json({
        conversation: {
          id: conv.id,
          type: conv.type,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          participants: conv.participants.map((p) => ({ user: p.user })),
          lastMessage: null,
          unreadCount: 0,
          otherUser: otherParticipant?.user ?? null,
        },
      });
    }

    const conversation = await db.conversation.create({
      data: {
        type: 'private',
        participants: {
          create: [
            { userId: payload.userId },
            { userId: otherUserId },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarColor: true, lastSeen: true },
            },
          },
        },
      },
    });

    const otherParticipant = conversation.participants.find((p) => p.user.id !== payload.userId);

    return NextResponse.json(
      {
        conversation: {
          id: conversation.id,
          type: conversation.type,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          participants: conversation.participants.map((p) => ({ user: p.user })),
          lastMessage: null,
          unreadCount: 0,
          otherUser: otherParticipant?.user ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
