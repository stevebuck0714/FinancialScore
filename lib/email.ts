import { Resend } from 'resend';

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

export async function sendPasswordResetEmail({ 
  to, 
  userName, 
  resetLink 
}: PasswordResetEmailProps) {
  const client = getResendClient();
  if (!client) {
    console.log('⚠️ Skipping password reset email - Resend not configured');
    return { success: false, skipped: true };
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
    console.log('⚠️ Skipping consultant registration notification - Resend not configured');
    return { success: false, skipped: true };
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
    console.log('⚠️ Skipping business registration notification - Resend not configured');
    return { success: false, skipped: true };
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
                          <span style="color: #1e293b; font-size: 14px;">${new Date().toLocaleString('en-US', { 
                            dateStyle: 'medium', 
                            timeStyle: 'short' 
                          })}</span>
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
                          <span style="color: #1e293b; font-size: 14px;">${new Date().toLocaleString('en-US', { 
                            dateStyle: 'medium', 
                            timeStyle: 'short' 
                          })}</span>
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

