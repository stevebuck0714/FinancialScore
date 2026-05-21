import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    DATABASE_URL_CONFIGURED: Boolean(process.env.DATABASE_URL),
    NODE_ENV: process.env.NODE_ENV,
    cwd: process.cwd(),
    timestamp: new Date().toISOString()
  });
}



