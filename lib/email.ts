import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email (use your verified domain or onboarding@resend.dev for testing)
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

interface PasswordResetEmailProps {
  to: string;
  userName: string;
  resetLink: string;
}

export async function sendPasswordResetEmail({ 
  to, 
  userName, 
  resetLink 
}: PasswordResetEmailProps) {
  try {
    const { data, error } = await resend.emails.send({
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

