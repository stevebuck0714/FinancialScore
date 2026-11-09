import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { sendExternalCompanyAccessEmail, sendWelcomeUserEmail } from '@/lib/email';

export type EmailDeliveryResult = { emailSent: boolean; emailError: string | null };

function appBaseUrl(request: NextRequest): string {
  return String(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin || 'http://localhost:3002'
  ).replace(/\/+$/, '');
}

async function addedByLabel(actorUserId: string): Promise<string> {
  const requester = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true, email: true },
  });
  return (requester?.name && requester.name.trim()) || requester?.email || 'A Corelytics administrator';
}

function deliveryResult(result: unknown): EmailDeliveryResult {
  const typed = result as { success?: boolean; reason?: string; error?: unknown };
  if (typed?.success) return { emailSent: true, emailError: null };
  return {
    emailSent: false,
    emailError:
      typed?.reason ||
      (typed?.error instanceof Error ? typed.error.message : 'Email delivery failed'),
  };
}

export async function sendManagedUserWelcomeEmail(params: {
  request: NextRequest;
  actorUserId: string;
  to: string;
  userName: string;
  companyName: string;
  userType: 'ASSESSMENT' | 'COMPANY';
  roleLabel?: string;
}): Promise<EmailDeliveryResult> {
  try {
    const result = await sendWelcomeUserEmail({
      to: params.to,
      userName: params.userName || params.to,
      companyName: params.companyName,
      addedByNameOrEmail: await addedByLabel(params.actorUserId),
      loginLink: appBaseUrl(params.request),
      userType: params.userType,
      roleLabel: params.roleLabel,
    });
    return deliveryResult(result);
  } catch (error) {
    return { emailSent: false, emailError: error instanceof Error ? error.message : 'Email delivery failed' };
  }
}

export async function sendExternalAccessAddedEmail(params: {
  request: NextRequest;
  actorUserId: string;
  to: string;
  userName: string;
  companyName: string;
}): Promise<EmailDeliveryResult> {
  try {
    const result = await sendExternalCompanyAccessEmail({
      to: params.to,
      userName: params.userName || params.to,
      companyName: params.companyName,
      addedByNameOrEmail: await addedByLabel(params.actorUserId),
      loginLink: appBaseUrl(params.request),
    });
    return deliveryResult(result);
  } catch (error) {
    return { emailSent: false, emailError: error instanceof Error ? error.message : 'Email delivery failed' };
  }
}
