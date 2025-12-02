# Email Notification System

## Overview
The application sends automated email notifications to `support@corelytics.com` when new users register.

## Features

### 1. Consultant Registration Notifications
When a new consultant registers through the public registration form, an email is sent containing:
- Full name
- Email address
- Phone number (if provided)
- Company name (if provided)
- Company address (if provided)
- Registration timestamp

### 2. Business Registration Notifications
When a new business registers through the public registration form, an email is sent containing:
- Business name
- Email address
- Phone number (if provided)
- Industry sector (if available)
- Associated consultant (if applicable)
- Affiliate code (if used)
- Registration timestamp

## Email Service

**Provider:** Resend (https://resend.com)

**Configuration:**
- API Key: `RESEND_API_KEY` (environment variable)
- From Email: `RESEND_FROM_EMAIL` (environment variable, defaults to `onboarding@resend.dev`)
- Notification Email: `support@corelytics.com` (hardcoded in `lib/email.ts`)

## Implementation

### Files Modified
1. **`lib/email.ts`** - Added email notification functions:
   - `sendConsultantRegistrationNotification()` - Sends consultant registration emails
   - `sendBusinessRegistrationNotification()` - Sends business registration emails
   - HTML email templates with professional styling

2. **`app/api/auth/register/route.ts`** - Integrated email notifications:
   - Sends notification after successful registration
   - Email sending is non-blocking (won't fail registration if email fails)
   - Logs errors for debugging

## Email Templates

Both templates feature:
- Professional gradient headers
- Structured information tables
- Responsive HTML design
- Corelytics branding
- Timestamp in local format

### Error Handling
- Email failures are logged but don't block the registration process
- Users can successfully register even if the notification email fails
- Errors are logged to the console for monitoring

## Testing

### Development Mode
In development, emails will be sent using your configured Resend API key. You can:
1. Use Resend's test mode
2. Check the console for email sending status
3. View emails in the Resend dashboard

### Production Mode
In production, emails are sent to `support@corelytics.com` automatically when:
- A new consultant completes registration
- A new business completes registration

### Important Notes
- Only **self-registration** triggers notifications (not Site Admin created accounts)
- Notifications are sent **after** successful database transaction
- Email failures don't affect user registration success
- All emails are sent asynchronously to avoid blocking the response

## Monitoring

Check server logs for:
- `✅ Consultant registration notification sent successfully` - Success
- `✅ Business registration notification sent successfully` - Success  
- `❌ Failed to send registration notification email` - Failure (with error details)

## Future Enhancements
Potential improvements:
- Add welcome emails to the new users themselves
- Include more detailed analytics in notification emails
- Add daily/weekly registration summary emails
- Implement email notification preferences in Site Admin

