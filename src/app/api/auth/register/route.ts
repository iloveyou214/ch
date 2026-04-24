import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken, AVATAR_COLORS } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash,
        avatarColor,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarColor: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json(
      { user, token },
      {
        status: 201,
        headers: {
          'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
        },
      }
    );
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
