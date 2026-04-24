import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken, verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    });

    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarColor: user.avatarColor,
          lastSeen: user.lastSeen,
        },
        token,
      },
      {
        headers: {
          'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      },
    }
  );
}
