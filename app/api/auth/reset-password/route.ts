import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email?.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // For security, always return success even if user doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      return NextResponse.json(
        { success: true, message: 'If an account exists with that email, password reset instructions have been sent.' }
      );
    }

    // TODO: In production, you would:
    // 1. Generate a secure reset token
    // 2. Store it in the database with an expiration time
    // 3. Send an email with a reset link containing the token
    // 4. Create a separate page/route to handle the reset form
    
    // For now, we'll simulate success
    // In a real implementation, you'd use a service like SendGrid, AWS SES, or similar
    console.log(`Password reset requested for: ${normalizedEmail}`);
    console.log(`User ID: ${user.id}, Name: ${user.name}`);

    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return NextResponse.json({
      success: true,
      message: 'Password reset instructions have been sent to your email.',
      // In development, you might want to include the user info for testing
      ...(process.env.NODE_ENV === 'development' && {
        dev_info: {
          user_id: user.id,
          email: user.email,
          note: 'In production, this would send an actual email'
        }
      })
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}


