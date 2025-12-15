import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    console.log('=== API DEBUG ===');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);

    // Try to query the database
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);

    const users = await prisma.user.findMany({
      select: { email: true, role: true }
    });

    return NextResponse.json({
      databaseUrl: process.env.DATABASE_URL,
      userCount,
      users: users.map(u => ({ email: u.email, role: u.role }))
    });

  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      databaseUrl: process.env.DATABASE_URL
    }, { status: 500 });
  }
}



