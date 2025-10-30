# Email Setup Guide - Resend Integration

This guide will help you set up Resend for sending password reset emails in production.

## 🚀 Quick Setup (5 minutes)

### Step 1: Create a Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up for a **free account** (no credit card required)
3. Verify your email address

### Step 2: Get Your API Key

1. After logging in, go to **API Keys** in the sidebar
2. Click **Create API Key**
3. Give it a name (e.g., "Financial Score Production")
4. Select **Full Access** permission
5. Click **Create**
6. **Copy the API key** (starts with `re_`)

### Step 3: Add to Environment Variables

#### For Local Development:

Add to your `.env.local` file:

```bash
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="onboarding@resend.dev"  # Default test email
```

#### For Production (Vercel):

1. Go to your Vercel dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

| Name | Value |
|------|-------|
| `RESEND_API_KEY` | Your API key (starts with `re_`) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` (for now) |
| `NEXT_PUBLIC_APP_URL` | Your production URL (e.g., `https://financialscore.vercel.app`) |

5. Click **Save**
6. **Redeploy** your application

### Step 4: Test It!

1. Go to your app's login page
2. Click "Forgot Password?"
3. Enter a valid user email
4. Check the email inbox!

## 📧 Email Limits

**Free Tier:**
- ✅ 3,000 emails per month
- ✅ 100 emails per day
- ✅ Perfect for getting started!

**If you need more:**
- $20/month = 50,000 emails/month

## 🎨 Custom Domain (Optional)

Want to send emails from your own domain (e.g., `noreply@yourdomain.com`)?

### Step 1: Verify Your Domain in Resend

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Follow the DNS setup instructions
5. Wait for verification (usually a few minutes)

### Step 2: Update Environment Variable

```bash
RESEND_FROM_EMAIL="noreply@yourdomain.com"
```

## 🔒 Security Best Practices

1. **Never commit your API key** to Git
2. **Use different API keys** for development and production
3. **Rotate your API key** if it's ever compromised
4. **Monitor your email usage** in the Resend dashboard

## 🐛 Troubleshooting

### "Failed to send email"

**Check:**
- ✅ API key is correct and active
- ✅ Environment variable is set correctly
- ✅ You haven't exceeded daily/monthly limits
- ✅ Email address is valid

**View logs:**
- Check Vercel function logs
- Check Resend dashboard → Logs

### Emails not arriving

**Check:**
1. **Spam folder** - Emails might be marked as spam
2. **Domain verification** - If using custom domain, make sure it's verified
3. **Email deliverability** - Some email providers are stricter than others

### Development Mode

In development, even if email sending fails, the reset link will still appear in the console and auto-open in a new tab for testing.

## 📊 Monitoring

Track your email sending in the Resend dashboard:
- Total emails sent
- Delivery rate
- Opens and clicks
- Bounce rate

## 🆘 Need Help?

- **Resend Docs:** https://resend.com/docs
- **Resend Support:** support@resend.com
- **Discord:** https://resend.com/discord

## ✅ You're All Set!

Once you've completed these steps:
- ✅ Password reset emails will be sent automatically
- ✅ Users will receive professional-looking emails
- ✅ Links expire after 1 hour for security
- ✅ Works seamlessly in production

---

**Important:** After adding the environment variables in Vercel, remember to **redeploy** your application for the changes to take effect!

