import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    console.log('🔍 Test auth for:', email);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      console.log('❌ User not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User found:', user.email, user.role);

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    console.log('🔐 Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('❌ Invalid password');
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    console.log('✅ Authentication successful');
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Auth test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


