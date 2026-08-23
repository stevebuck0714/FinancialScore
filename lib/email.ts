import { Resend } from 'resend';
import { formatEstDateTime } from '@/lib/time/eastern';

// Lazy initialize Resend client to avoid errors when API key is not set
let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY not set - email functionality disabled');
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Default sender email (use your verified domain or onboarding@resend.dev for testing)
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const NOTIFICATION_EMAIL = 'support@corelytics.com';
/** Demo upgrade / sales notifications (e.g. Upgrade now modal) */
const CORELYTICS_SALES_NOTIFY_EMAIL = 'arichards@corelytics.com';
const DEFAULT_TRUST_DURATION_DAYS = parseInt(process.env.MFA_TRUST_DURATION_DAYS || '60', 10);

interface PasswordResetEmailProps {
  to: string;
  userName: string;
  resetLink: string;
}

interface ConsultantRegistrationProps {
  consultantName: string;
  consultantEmail: string;
  consultantPhone?: string;
  companyName?: string;
  companyAddress?: string;
  registrationType: 'consultant' | 'business';
}

interface BusinessRegistrationProps {
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  industry?: string;
  consultantName?: string;
  affiliateCode?: string;
}

interface AccountingSystemSelectionNotificationProps {
  recipients: string[];
  companyName: string;
  companyId: string;
  accountingSystem: string;
  changedByEmail: string;
  changedByRole: string;
}

interface SyncFailureNotificationProps {
  recipients: string[];
  companyName: string;
  companyId: string;
  platform: string;
  syncType: string;
  errorSummary: string;
  errorDetails?: string;
  actionUrl?: string;
}

interface DataRoomPastDueNotificationProps {
  recipients: string[];
  companyName: string;
  companyId: string;
  plan: string;
  amount: number;
  graceDays: number;
  reason?: string;
}

interface QboMonthlyUploadReminderProps {
  recipients: string[];
  companyName: string;
  companyId: string;
  missingMonthLabel: string;
  uploadUrl?: string;
}

interface CompanyUserInviteEmailProps {
  to: string;
  inviteeName: string;
  companyName: string;
  inviterNameOrEmail: string;
  inviteLink: string;
  expiresAt: string;
  userType: 'COMPANY' | 'ASSESSMENT';
}

interface WelcomeUserEmailProps {
  to: string;
  userName: string;
  companyName: string;
  addedByNameOrEmail: string;
  loginLink: string;
  userType: 'COMPANY' | 'ASSESSMENT';
}

export async function sendPasswordResetEmail({ 
  to, 
  userName, 
  resetLink 
}: PasswordResetEmailProps) {
  const client = getResendClient();
  if (!client) {
    console.error('❌ RESEND_API_KEY not configured - cannot send password reset email');
    throw new Error('Email service is not configured. Please contact support.');
  }
  
  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: 'Reset Your Password - Corelytics',
      html: getPasswordResetEmailHTML(userName, resetLink),
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Password reset email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
}

// HTML email template for password reset
function getPasswordResetEmailHTML(userName: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                Corelytics
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 24px; font-weight: 600;">
                Reset Your Password
              </h2>
              
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                Hello,
              </p>
              
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password for your Corelytics account. Click the button below to create a new password:
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              
              <p style="margin: 0 0 20px 0; padding: 12px; background-color: #f1f5f9; border-radius: 6px; word-break: break-all;">
                <a href="${resetLink}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                  ${resetLink}
                </a>
              </p>
              
              <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                  <strong>This link will expire in 1 hour</strong> for security reasons.
                </p>
                
                <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                  If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                © ${new Date().getFullYear()} Corelytics. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                This is an automated email. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Send notification to support when a consultant registers
export async function sendConsultantRegistrationNotification({ 
  consultantName,
  consultantEmail,
  consultantPhone,
  companyName,
  companyAddress,
  registrationType
}: ConsultantRegistrationProps) {
  const client = getResendClient();
  if (!client) {
    console.error('❌ RESEND_API_KEY not configured - cannot send consultant registration notification');
    throw new Error('Email service is not configured. Please contact support.');
  }
  
  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [NOTIFICATION_EMAIL],
      subject: `🎉 New ${registrationType === 'consultant' ? 'Consultant' : 'Business'} Registration - ${consultantName}`,
      html: getConsultantRegistrationHTML({
        consultantName,
        consultantEmail,
        consultantPhone,
        companyName,
        companyAddress,
        registrationType
      }),
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Consultant registration notification sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending consultant registration notification:', error);
    throw error;
  }
}

// Send notification to support when a business registers
export async function sendBusinessRegistrationNotification({ 
  businessName,
  businessEmail,
  businessPhone,
  industry,
  consultantName,
  affiliateCode
}: BusinessRegistrationProps) {
  const client = getResendClient();
  if (!client) {
    console.error('❌ RESEND_API_KEY not configured - cannot send business registration notification');
    throw new Error('Email service is not configured. Please contact support.');
  }
  
  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [NOTIFICATION_EMAIL],
      subject: `🏢 New Business Registration - ${businessName}`,
      html: getBusinessRegistrationHTML({
        businessName,
        businessEmail,
        businessPhone,
        industry,
        consultantName,
        affiliateCode
      }),
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Business registration notification sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending business registration notification:', error);
    throw error;
  }
}

// HTML email template for consultant registration notification
function getConsultantRegistrationHTML({
  consultantName,
  consultantEmail,
  consultantPhone,
  companyName,
  companyAddress,
  registrationType
}: ConsultantRegistrationProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New ${registrationType === 'consultant' ? 'Consultant' : 'Business'} Registration</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🎉 New ${registrationType === 'consultant' ? 'Consultant' : 'Business'} Registration
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                A new ${registrationType === 'consultant' ? 'consultant' : 'business'} has just registered on Corelytics!
              </p>
              
              <!-- Registration Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px 0; color: #1e293b; font-size: 18px; font-weight: 600;">
                      Registration Details
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Name:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${consultantName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Email:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <a href="mailto:${consultantEmail}" style="color: #667eea; font-size: 14px; text-decoration: none;">${consultantEmail}</a>
                        </td>
                      </tr>
                      ${consultantPhone ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Phone:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${consultantPhone}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${companyName ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Company:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${companyName}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${companyAddress ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Address:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${companyAddress}</span>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Registration Time:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${formatEstDateTime(new Date())}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                You can view and manage this ${registrationType === 'consultant' ? 'consultant' : 'business'} in the Site Administration dashboard.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                © ${new Date().getFullYear()} Corelytics. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                This is an automated notification email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// HTML email template for business registration notification
function getBusinessRegistrationHTML({
  businessName,
  businessEmail,
  businessPhone,
  industry,
  consultantName,
  affiliateCode
}: BusinessRegistrationProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Business Registration</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🏢 New Business Registration
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                A new business has just registered on Corelytics!
              </p>
              
              <!-- Registration Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px 0; color: #1e293b; font-size: 18px; font-weight: 600;">
                      Business Details
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Business Name:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${businessName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Email:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <a href="mailto:${businessEmail}" style="color: #667eea; font-size: 14px; text-decoration: none;">${businessEmail}</a>
                        </td>
                      </tr>
                      ${businessPhone ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Phone:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${businessPhone}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${industry ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Industry:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${industry}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${consultantName ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Associated Consultant:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${consultantName}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${affiliateCode ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Affiliate Code:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${affiliateCode}</span>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Registration Time:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${formatEstDateTime(new Date())}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                You can view and manage this business in the Site Administration dashboard.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                © ${new Date().getFullYear()} Corelytics. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                This is an automated notification email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Trusted Device Notification Types
interface TrustedDeviceNotificationProps {
  to: string;
  userName: string;
  deviceName: string;
  ipAddress: string;
  timestamp: Date;
  trustDurationDays?: number;
  manageDevicesLink: string;
}

/**
 * Send email notification when a new trusted device is added
 */
export async function sendTrustedDeviceNotification({
  to,
  userName,
  deviceName,
  ipAddress,
  timestamp,
  trustDurationDays,
  manageDevicesLink
}: TrustedDeviceNotificationProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping trusted device notification email');
    return { success: false, reason: 'Email service not configured' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: '🔐 New Trusted Device Added - Corelytics',
      html: getTrustedDeviceNotificationHTML({
        userName,
        deviceName,
        ipAddress,
        timestamp,
        trustDurationDays,
        manageDevicesLink
      }),
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Trusted device notification sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending trusted device notification:', error);
    // Don't throw - we don't want email failures to break the login flow
    return { success: false, error };
  }
}

// HTML email template for trusted device notification
function getTrustedDeviceNotificationHTML({
  userName,
  deviceName,
  ipAddress,
  timestamp,
  trustDurationDays,
  manageDevicesLink
}: Omit<TrustedDeviceNotificationProps, 'to'>): string {
  const durationDays = typeof trustDurationDays === 'number' && Number.isFinite(trustDurationDays)
    ? Math.floor(trustDurationDays)
    : DEFAULT_TRUST_DURATION_DAYS;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Trusted Device Added</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🔐 New Trusted Device
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1e293b; font-size: 16px; line-height: 1.6;">
                Hi <strong>${userName}</strong>,
              </p>
              
              <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                A new device was just added to your trusted devices list. This device will not require MFA verification for the next ${durationDays} days.
              </p>
              
              <!-- Device Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px 0; color: #1e293b; font-size: 18px; font-weight: 600;">
                      Device Information
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Device:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${deviceName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">IP Address:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${ipAddress}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #475569; font-size: 14px;">Time:</strong>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #1e293b; font-size: 14px;">${formatEstDateTime(timestamp)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Security Alert -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 30px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                  <strong>⚠️ Was this you?</strong><br>
                  If you don't recognize this device or didn't add it, please take action immediately to secure your account.
                </p>
              </div>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${manageDevicesLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Manage Trusted Devices
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                You can view all your trusted devices and revoke access to any device at any time from your security settings.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8fafc; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                © ${new Date().getFullYear()} Corelytics. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                This is a security notification email. For your protection, we recommend keeping your account secure.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendAccountingSystemSelectionNotification({
  recipients,
  companyName,
  companyId,
  accountingSystem,
  changedByEmail,
  changedByRole,
}: AccountingSystemSelectionNotificationProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping accounting system selection notification email');
    return { success: false, reason: 'Email service not configured' };
  }

  const uniqueRecipients = Array.from(
    new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );
  if (uniqueRecipients.length === 0) {
    return { success: false, reason: 'No recipients' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: uniqueRecipients,
      subject: `🔔 Accounting system selected for ${companyName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Accounting System Selected</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;font-size:20px;color:#1e293b;">Accounting System Setup Required</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">A company accounting system was selected and may require connector setup.</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Company:</strong> ${escapeHtml(companyName)}</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Company ID:</strong> ${escapeHtml(companyId)}</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Selected Accounting System:</strong> ${escapeHtml(accountingSystem)}</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Saved By:</strong> ${escapeHtml(changedByEmail)} (${escapeHtml(changedByRole)})</p>
          <p style="margin:0;color:#64748b;font-size:13px;">Open Company Management and use the Accounting Integration tab for credential setup.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Accounting system selection notification sent:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending accounting system selection notification:', error);
    return { success: false, error };
  }
}

export async function sendSyncFailureNotification({
  recipients,
  companyName,
  companyId,
  platform,
  syncType,
  errorSummary,
  errorDetails,
  actionUrl,
}: SyncFailureNotificationProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping sync failure notification email');
    return { success: false, reason: 'Email service not configured' };
  }

  const uniqueRecipients = Array.from(new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (uniqueRecipients.length === 0) {
    return { success: false, reason: 'No recipients' };
  }

  const safeSummary = escapeHtml(errorSummary || 'Sync failed');
  const safeDetails = escapeHtml(errorDetails || '');
  const safeCompany = escapeHtml(companyName);
  const safeCompanyId = escapeHtml(companyId);
  const safePlatform = escapeHtml(platform);
  const safeSyncType = escapeHtml(syncType);
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : '';

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: uniqueRecipients,
      subject: `🚨 Sync failed: ${companyName} (${platform})`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sync Failure Alert</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;color:#b91c1c;font-size:22px;">Sync Failure Alert</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">A scheduled or manual sync failed and may require intervention.</p>
        </td></tr>
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Company:</strong> ${safeCompany}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Company ID:</strong> ${safeCompanyId}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Platform:</strong> ${safePlatform}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Sync Type:</strong> ${safeSyncType}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Error:</strong> ${safeSummary}</p>
          ${
            safeDetails
              ? `<p style="margin:0;color:#334155;font-size:14px;"><strong>Details:</strong> ${safeDetails}</p>`
              : ''
          }
          ${
            safeActionUrl
              ? `<p style="margin:14px 0 0;font-size:14px;"><a href="${safeActionUrl}" style="color:#2563eb;text-decoration:none;">Open dashboard and reconnect/retry</a></p>`
              : ''
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Sync failure notification sent:', data);
    return { success: true, data };
  } catch (sendError) {
    console.error('❌ Error sending sync failure notification:', sendError);
    return { success: false, error: sendError };
  }
}

export async function sendDataRoomPastDueNotification({
  recipients,
  companyName,
  companyId,
  plan,
  amount,
  graceDays,
  reason,
}: DataRoomPastDueNotificationProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping DataRoom past-due notification');
    return { success: false, reason: 'Email service not configured' };
  }

  const uniqueRecipients = Array.from(new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (uniqueRecipients.length === 0) {
    return { success: false, reason: 'No recipients' };
  }

  const safeCompany = escapeHtml(companyName);
  const safeCompanyId = escapeHtml(companyId);
  const safePlan = escapeHtml(plan);
  const safeReason = reason ? escapeHtml(reason) : 'Payment processor declined this recurring charge.';

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: uniqueRecipients,
      subject: `⚠️ DataRoom payment past due - ${companyName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DataRoom Payment Past Due</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:22px 26px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;color:#b91c1c;font-size:22px;">Corelytics DataRoom Payment Past Due</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Your DataRoom add-on payment did not process successfully.</p>
        </td></tr>
        <tr><td style="padding:20px 26px;">
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Company:</strong> ${safeCompany}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Company ID:</strong> ${safeCompanyId}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Plan:</strong> ${safePlan}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Recurring Amount:</strong> $${Number(amount || 0).toFixed(2)}</p>
          <p style="margin:0 0 8px;color:#334155;font-size:14px;"><strong>Reason:</strong> ${safeReason}</p>
          <p style="margin:12px 0 0;color:#334155;font-size:14px;">
            You are now in a <strong>${graceDays}-day grace period</strong>. If payment is not resolved, DataRoom access may be restricted.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ DataRoom past-due notification sent:', data);
    return { success: true, data };
  } catch (sendError) {
    console.error('❌ Error sending DataRoom past-due notification:', sendError);
    return { success: false, error: sendError };
  }
}

export async function sendCompanyUserInviteEmail({
  to,
  inviteeName,
  companyName,
  inviterNameOrEmail,
  inviteLink,
  expiresAt,
  userType,
}: CompanyUserInviteEmailProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping company user invite email');
    return { success: false, reason: 'Email service not configured' };
  }

  const safeCompany = escapeHtml(companyName);
  const safeInviter = escapeHtml(inviterNameOrEmail);
  const safeInvitee = escapeHtml(inviteeName || to);
  const safeInviteLink = escapeHtml(inviteLink);
  const safeRole = userType === 'ASSESSMENT' ? 'Team Assessment User' : 'Company User';
  const safeExpires = escapeHtml(
    formatEstDateTime(expiresAt),
  );

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `You're invited to Corelytics - ${companyName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Corelytics Invite</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:22px 26px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;color:#1e293b;font-size:22px;">You are invited to Corelytics</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">You have been invited to access <strong>${safeCompany}</strong> as a <strong>${safeRole}</strong>.</p>
        </td></tr>
        <tr><td style="padding:20px 26px;">
          <p style="margin:0 0 10px;color:#334155;font-size:14px;">Hello ${safeInvitee},</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;">
            ${safeInviter} invited you to join Corelytics for company access.
          </p>
          <p style="margin:0 0 14px;color:#334155;font-size:14px;">
            Click the button below to accept the invite, create your login, and complete security steps.
          </p>
          <p style="margin:0 0 16px;">
            <a href="${safeInviteLink}" style="display:inline-block;padding:12px 18px;background:#1F70C1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              Accept Invite
            </a>
          </p>
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;word-break:break-all;">
            Or paste this link into your browser:<br />
            <a href="${safeInviteLink}" style="color:#2563eb;text-decoration:none;">${safeInviteLink}</a>
          </p>
          <p style="margin:10px 0 0;color:#b45309;font-size:13px;">
            This invite expires on ${safeExpires}.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) throw new Error(`Failed to send email: ${error.message}`);
    return { success: true, data };
  } catch (sendError) {
    console.error('❌ Error sending company invite email:', sendError);
    return { success: false, error: sendError };
  }
}

export async function sendWelcomeUserEmail({
  to,
  userName,
  companyName,
  addedByNameOrEmail,
  loginLink,
  userType,
}: WelcomeUserEmailProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping welcome user email');
    return { success: false, reason: 'Email service not configured' };
  }

  const safeCompany = escapeHtml(companyName);
  const safeAddedBy = escapeHtml(addedByNameOrEmail);
  const safeUser = escapeHtml(userName || to);
  const safeEmail = escapeHtml(to);
  const safeLoginLink = escapeHtml(loginLink);
  const safeRole = userType === 'ASSESSMENT' ? 'Team Assessment User' : 'Company User';

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `Welcome to Corelytics - ${companyName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to Corelytics</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:22px 26px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;color:#1e293b;font-size:22px;">Welcome to Corelytics</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Your account has been created for <strong>${safeCompany}</strong> as a <strong>${safeRole}</strong>.</p>
        </td></tr>
        <tr><td style="padding:20px 26px;">
          <p style="margin:0 0 10px;color:#334155;font-size:14px;">Hello ${safeUser},</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;">
            ${safeAddedBy} created a Corelytics account for you.
          </p>
          <p style="margin:0 0 14px;color:#334155;font-size:14px;">
            Use the credentials provided to you separately to sign in. For your security, your password was not included in this email.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:separate;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
            <tr><td style="padding:12px 16px;color:#475569;font-size:13px;">
              <strong style="color:#0f172a;">Sign-in email:</strong> ${safeEmail}
            </td></tr>
          </table>
          <p style="margin:0 0 16px;">
            <a href="${safeLoginLink}" style="display:inline-block;padding:12px 18px;background:#1F70C1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              Sign in to Corelytics
            </a>
          </p>
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;word-break:break-all;">
            Or paste this link into your browser:<br />
            <a href="${safeLoginLink}" style="color:#2563eb;text-decoration:none;">${safeLoginLink}</a>
          </p>
          <p style="margin:14px 0 0;color:#64748b;font-size:13px;">
            If you did not expect this account, please contact ${safeAddedBy} or reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) throw new Error(`Failed to send email: ${error.message}`);
    return { success: true, data };
  } catch (sendError) {
    console.error('❌ Error sending welcome user email:', sendError);
    return { success: false, error: sendError };
  }
}

// Support ticket props
interface SupportTicketProps {
  subject: string;
  category: string;
  priority?: string;
  description: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  pageModule?: string;
  tier1Owner?: 'CORELYTICS' | 'CONSULTANT';
  routedToEmail?: string;
  routedToLabel?: string;
  tier1ConsultantName?: string;
}

/**
 * Send support ticket email. Demo Upgrade category notifies support@corelytics.com and arichards@corelytics.com.
 */
export async function sendSupportTicket(ticket: SupportTicketProps) {
  const client = getResendClient();
  if (!client) {
    console.error('RESEND_API_KEY not configured - cannot send support ticket');
    throw new Error('Email service is not configured. Please email support@corelytics.com directly.');
  }

  const routeRecipient = (ticket.routedToEmail || NOTIFICATION_EMAIL).trim().toLowerCase();
  const toRecipients =
    ticket.category === 'Demo Upgrade'
      ? Array.from(
          new Set(
            [NOTIFICATION_EMAIL, CORELYTICS_SALES_NOTIFY_EMAIL, routeRecipient]
              .map((e) => String(e || '').trim().toLowerCase())
              .filter(Boolean),
          ),
        )
      : [routeRecipient];
  const subject = `[Support Ticket] ${ticket.subject}`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Support Ticket</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1e293b;">
  <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 8px;">Support Ticket</h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
    <tr><td style="padding: 8px 0; font-weight: 600; width: 160px;">Subject:</td><td>${escapeHtml(ticket.subject)}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600;">Category:</td><td>${escapeHtml(ticket.category)}</td></tr>
    ${ticket.priority ? `<tr><td style="padding: 8px 0; font-weight: 600;">Priority:</td><td>${escapeHtml(ticket.priority)}</td></tr>` : ''}
    <tr><td style="padding: 8px 0; font-weight: 600;">Contact Name:</td><td>${escapeHtml(ticket.contactName)}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600;">Contact Email:</td><td>${escapeHtml(ticket.contactEmail)}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600;">Company Name:</td><td>${escapeHtml(ticket.companyName)}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600;">Tier 1 Owner:</td><td>${escapeHtml(ticket.tier1Owner || 'CORELYTICS')}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600;">Routed To:</td><td>${escapeHtml(ticket.routedToLabel || routeRecipient)}</td></tr>
    ${ticket.tier1ConsultantName ? `<tr><td style="padding: 8px 0; font-weight: 600;">Tier 1 Consultant:</td><td>${escapeHtml(ticket.tier1ConsultantName)}</td></tr>` : ''}
    ${ticket.pageModule ? `<tr><td style="padding: 8px 0; font-weight: 600;">Page/Module:</td><td>${escapeHtml(ticket.pageModule)}</td></tr>` : ''}
  </table>
  <h3 style="margin-top: 24px; color: #475569;">Description</h3>
  <div style="background: #f8fafc; padding: 16px; border-radius: 8px; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(ticket.description)}</div>
  <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">Submitted via Corelytics Support Center</p>
</body>
</html>
  `.trim();

  const { data, error } = await client.emails.send({
    from: DEFAULT_FROM,
    to: toRecipients,
    replyTo: [ticket.contactEmail],
    subject,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(`Failed to send support ticket: ${error.message}`);
  }

  console.log('Support ticket sent to', toRecipients.join(', '), data);
  return { success: true, data };
}

export async function sendQboMonthlyUploadReminder({
  recipients,
  companyName,
  companyId,
  missingMonthLabel,
  uploadUrl,
}: QboMonthlyUploadReminderProps) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping QBO monthly upload reminder');
    return { success: false, reason: 'Email service not configured' };
  }

  const uniqueRecipients = Array.from(
    new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))
  );
  if (uniqueRecipients.length === 0) {
    return { success: false, reason: 'No recipients' };
  }

  const safeCompany = escapeHtml(companyName);
  const safeCompanyId = escapeHtml(companyId);
  const safeMonth = escapeHtml(missingMonthLabel);
  const safeUploadUrl = uploadUrl ? escapeHtml(uploadUrl) : '';

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: uniqueRecipients,
      subject: `Reminder: upload ${missingMonthLabel} QBO data for ${companyName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>QBO Monthly Upload Reminder</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;font-size:20px;color:#1e293b;">Monthly QBO Data Upload Reminder</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Corelytics has not received the latest monthly QuickBooks Online data for this company.</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Company:</strong> ${safeCompany}</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Company ID:</strong> ${safeCompanyId}</p>
          <p style="margin:0 0 18px;color:#334155;font-size:14px;"><strong>Missing month:</strong> ${safeMonth}</p>
          <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
            Please upload the monthly QBO financial data so dashboards, financial reporting, alerts, forecasts, and custom reports stay current.
          </p>
          ${
            safeUploadUrl
              ? `<p style="margin:0 0 18px;"><a href="${safeUploadUrl}" style="display:inline-block;background:#1F70C1;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;font-size:14px;">Open Corelytics Upload</a></p>`
              : ''
          }
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
            In Corelytics, open Company Management &gt; Import Financials and upload the missing QBO monthly data.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ QBO monthly upload reminder sent:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending QBO monthly upload reminder:', error);
    return { success: false, error };
  }
}

export async function sendMorningSmokeReport(params: {
  to: string;
  ok: boolean;
  ranAt: string;
  durationMs: number;
  baseUrl: string;
  checks: Array<{
    id: string;
    name: string;
    status: 'pass' | 'fail' | 'warn';
    detail: string;
    durationMs: number;
  }>;
  summary: { passed: number; failed: number; warned: number };
}) {
  const client = getResendClient();
  if (!client) {
    console.warn('⚠️ RESEND_API_KEY not configured - skipping morning smoke report email');
    return { success: false, reason: 'Email service not configured' };
  }

  const to = String(params.to || '').trim().toLowerCase();
  if (!to) {
    return { success: false, reason: 'No recipients' };
  }

  const statusLabel = params.ok ? 'PASS' : 'FAIL';
  const statusColor = params.ok ? '#15803d' : '#b91c1c';
  const rows = params.checks
    .map((check) => {
      const color =
        check.status === 'pass' ? '#15803d' : check.status === 'warn' ? '#a16207' : '#b91c1c';
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${escapeHtml(check.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:${color};font-size:13px;font-weight:700;text-transform:uppercase;">${escapeHtml(check.status)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px;">${escapeHtml(check.detail)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;">${check.durationMs}ms</td>
        </tr>`;
    })
    .join('');

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject: `${params.ok ? '✅' : '🚨'} Morning smoke ${statusLabel} — Corelytics (${params.summary.failed} failed)`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Morning Smoke Report</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px;">
    <tr><td align="center">
      <table width="760" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
          <h2 style="margin:0;font-size:20px;color:#1e293b;">Daily Morning Smoke Report</h2>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;">Automated API health check for Corelytics production.</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Result:</strong> <span style="color:${statusColor};font-weight:700;">${statusLabel}</span></p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Ran at (UTC):</strong> ${escapeHtml(params.ranAt)}</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Duration:</strong> ${params.durationMs}ms</p>
          <p style="margin:0 0 10px;color:#334155;font-size:14px;"><strong>Base URL:</strong> ${escapeHtml(params.baseUrl || '(not set)')}</p>
          <p style="margin:0 0 18px;color:#334155;font-size:14px;"><strong>Summary:</strong> ${params.summary.passed} passed, ${params.summary.failed} failed, ${params.summary.warned} warned</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <th align="left" style="padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase;">Check</th>
              <th align="left" style="padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase;">Status</th>
              <th align="left" style="padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase;">Detail</th>
              <th align="left" style="padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase;">Time</th>
            </tr>
            ${rows}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `.trim(),
    });

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Morning smoke report emailed:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Error sending morning smoke report:', error);
    return { success: false, error };
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}


