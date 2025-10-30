# Production Deployment Guide - Corelytics Dashboard

## Deployment Information
- **Production URL**: https://dashboard.corelytics.com
- **Platform**: Vercel
- **Database**: Neon PostgreSQL (already configured)
- **Domain Provider**: GoDaddy

---

## Step 1: Deploy to Vercel

### Option A: GitHub Integration (Recommended)
1. Go to https://vercel.com/new
2. Select "Import Git Repository"
3. Choose: `stevebuck0714/FinancialScore`
4. Click "Import"

### Option B: CLI Deployment
```bash
cd "C:\Users\steve\FinancialScore"
vercel --prod
```

---

## Step 2: Configure Environment Variables in Vercel

After importing the project, add these environment variables in Vercel:

### Database Configuration
```
DATABASE_URL=postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### NextAuth Configuration
```
NEXTAUTH_SECRET=your-secret-key-change-this-in-production
NEXTAUTH_URL=https://dashboard.corelytics.com
```

### Site Administrator Credentials
```
SITEADMIN_EMAIL=steve@stevebuck.us
SITEADMIN_PASSWORD=Venturis0801$
```

### OpenAI API Key (for AI-based account mapping)
```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
(Use your actual OpenAI API key from https://platform.openai.com/api-keys)

### QuickBooks OAuth Configuration
```
QUICKBOOKS_CLIENT_ID=AB5P6FjeAERDi5BtFO1uug3haKS4NhciqxvkyfvU8vyJXpu6IA
QUICKBOOKS_CLIENT_SECRET=xYjxOnZwCJoDfbnY8oDLlnJFa8thx1qUDGnmzdOM
QUICKBOOKS_REDIRECT_URI=https://dashboard.corelytics.com/api/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=production
OAUTH_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

**IMPORTANT**: Update `NEXTAUTH_URL` and `QUICKBOOKS_REDIRECT_URI` to use your production domain!

---

## Step 3: Configure Custom Domain in Vercel

1. In your Vercel project dashboard, go to **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `dashboard.corelytics.com`
4. Vercel will provide DNS records (usually CNAME)

---

## Step 4: Configure DNS in GoDaddy

1. Log into GoDaddy DNS Management
2. Go to your `corelytics.com` domain DNS settings
3. Add a **CNAME record**:
   - **Type**: CNAME
   - **Name**: dashboard
   - **Value**: cname.vercel-dns.com (Vercel will provide the exact value)
   - **TTL**: 600 seconds

---

## Step 5: Verify Benchmark Data

After deployment, verify the benchmark data is accessible:
1. Log into https://dashboard.corelytics.com
2. Navigate to a company with financial data
3. Check if industry benchmarks are displaying

If benchmarks are missing, run the import script:
```bash
npm run import:benchmarks
```

---

## Database Notes

- **Database Provider**: Neon PostgreSQL
- **Connection**: Already configured and working
- **Benchmark Data**: Should be in the database from GitHub repository
- **Migrations**: Will run automatically on Vercel deployment

---

## Security Checklist

- [ ] Generate new `NEXTAUTH_SECRET` for production
- [ ] Verify `SITEADMIN_PASSWORD` is secure
- [ ] Confirm API keys are valid and have proper limits
- [ ] Test QuickBooks OAuth with production redirect URI
- [ ] Enable Vercel password protection during testing (optional)

---

## Post-Deployment Testing

1. **Login**: Test site admin login
2. **Consultant Registration**: Create a test consultant
3. **Company Creation**: Create a test company
4. **Financial Import**: Upload financial data
5. **Benchmarks**: Verify industry benchmarks load
6. **QuickBooks**: Test QuickBooks OAuth connection
7. **Subscriptions**: Test $0 and paid subscriptions

---

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL in Vercel environment variables
- Check Neon dashboard for connection limits
- Ensure IP allowlist includes Vercel IPs (or set to 0.0.0.0/0)

### Domain Not Working
- Wait 5-10 minutes for DNS propagation
- Use https://www.whatsmydns.net/ to check DNS propagation
- Verify CNAME record is correct in GoDaddy

### QuickBooks OAuth Failing
- Update `QUICKBOOKS_REDIRECT_URI` to production URL
- Update callback URI in Intuit Developer Portal
- Re-test OAuth flow

---

## Support Resources

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Neon Database**: https://console.neon.tech/
- **GitHub Repo**: https://github.com/stevebuck0714/FinancialScore
- **Domain DNS**: GoDaddy DNS Management

