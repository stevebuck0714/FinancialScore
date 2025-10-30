import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateSecureToken } from '@/lib/auth';

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

    // Generate a secure reset token
    const resetToken = generateSecureToken();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Store token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    // In production, send email here with link: ${process.env.NEXT_PUBLIC_APP_URL}/reset-password/${resetToken}
    console.log(`Password reset requested for: ${normalizedEmail}`);
    console.log(`Reset token: ${resetToken}`);
    console.log(`Expires: ${resetExpires}`);

    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
    const resetLink = `${baseUrl}/reset-password/${resetToken}`;

    return NextResponse.json({
      success: true,
      message: 'Password reset instructions have been sent to your email.',
      // In development, include the reset link for testing
      ...(process.env.NODE_ENV === 'development' && {
        dev_info: {
          user_id: user.id,
          email: user.email,
          resetLink: resetLink,
          note: 'In production, this link would be sent via email. For now, you can click the link above.'
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


