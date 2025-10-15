# Venturis Business Evaluation Tool - Production Upgrade Guide

## Overview
This guide covers upgrading from localStorage-based storage to a production-ready MySQL database with proper authentication and API architecture.

---

## What's Being Upgraded

### Before (Current State)
- ❌ Client-side only (localStorage)
- ❌ No real authentication
- ❌ Data not shared across browsers
- ❌ No backup/recovery
- ❌ Limited to ~5MB storage

### After (Production Ready)
- ✅ MySQL database
- ✅ Secure authentication (NextAuth.js)
- ✅ API-based architecture
- ✅ Multi-device access
- ✅ Unlimited storage
- ✅ Backup & recovery
- ✅ Audit logging
- ✅ Production-ready for Azure/Vercel

---

## Installation Steps

### Step 1: Dependencies Installed ✅
```bash
npm install @prisma/client prisma bcryptjs next-auth@beta
npm install -D @types/bcryptjs tsx
```

### Step 2: Database Setup

#### Option A: Local MySQL
```bash
# Install MySQL 8.0+ or use Docker
docker run --name mysql-venturis -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d mysql:8.0

# Create database
mysql -u root -p
CREATE DATABASE venturis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### Option B: PlanetScale (for Vercel)
```bash
# Sign up at https://planetscale.com/
# Create database
# Copy connection string
```

#### Option C: Azure MySQL
```bash
# Create in Azure Portal or use Azure CLI
az mysql flexible-server create \
  --resource-group venturis-rg \
  --name venturis-mysql \
  --location eastus \
  --admin-user adminuser \
  --admin-password <YourPassword> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32
```

### Step 3: Configure Environment

Update `.env.local` with your database connection:

```env
# Local Development
DATABASE_URL="mysql://root:password@localhost:3306/venturis_db"

# PlanetScale
DATABASE_URL="mysql://username:password@aws.connect.psdb.cloud/venturis-db?sslaccept=strict"

# Azure MySQL
DATABASE_URL="mysql://adminuser:password@venturis-mysql.mysql.database.azure.com:3306/venturis_db?ssl-mode=REQUIRED"
```

### Step 4: Run Migrations
```bash
npx prisma migrate dev --name init
```

This creates all database tables:
- users
- consultants
- companies
- financial_records
- monthly_financials
- assessment_records
- company_profiles
- audit_logs

### Step 5: Seed Initial Data
```bash
npm run db:seed
```

Creates site administrator account:
- Email: `siteadministrator@venturis.com`
- Password: `Venturis0801$`

### Step 6: Generate Prisma Client
```bash
npx prisma generate
```

---

## Next Steps (To Be Implemented)

### Phase 1: API Routes (Week 1)
- [ ] `/api/auth/login` - User login
- [ ] `/api/auth/logout` - User logout
- [ ] `/api/auth/register` - New user registration
- [ ] `/api/companies` - Company CRUD
- [ ] `/api/users` - User management

### Phase 2: Frontend Updates (Week 2)
- [ ] Replace localStorage with API calls
- [ ] Add loading states
- [ ] Error handling
- [ ] Form validation
- [ ] Session management

### Phase 3: File Upload (Week 3)
- [ ] Azure Blob Storage integration
- [ ] Server-side Excel processing
- [ ] File management APIs

### Phase 4: Additional Features (Week 4)
- [ ] Email notifications
- [ ] PDF export
- [ ] Data export (Excel/CSV)
- [ ] Audit logging UI

### Phase 5: Testing & Deployment (Week 5)
- [ ] Unit tests
- [ ] E2E tests
- [ ] Security audit
- [ ] Deploy to Vercel
- [ ] Deploy to Azure

---

## Database Schema Overview

### Core Tables

**users**: All user accounts (site admins, consultants, company users)
- Handles authentication
- Role-based access control
- Links to consultants or companies

**consultants**: Consultant-specific information
- Links to user account
- Manages multiple companies

**companies**: Client companies
- Owned by consultants
- Has multiple users
- Stores location and industry

**financial_records**: Uploaded financial data
- Links to company
- Stores raw Excel data and mappings
- One-to-many with monthly_financials

**monthly_financials**: Parsed monthly data
- 40+ fields for P&L and Balance Sheet
- Enables all financial calculations

**assessment_records**: Management assessment results
- Stores questionnaire responses
- Links to users and companies

**company_profiles**: Company profile information
- Business details
- Disclosures
- One-to-one with companies

**audit_logs**: Track all changes
- Who did what, when
- Security and compliance

---

## Database Commands Cheat Sheet

```bash
# View database in browser
npx prisma studio

# Create new migration
npx prisma migrate dev --name description

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate

# Format schema file
npx prisma format

# Validate schema
npx prisma validate

# Seed database
npm run db:seed
```

---

## Vercel Deployment

### 1. Push to GitHub
```bash
git add .
git commit -m "Added database and API infrastructure"
git push origin main
```

### 2. Connect Vercel
- Go to https://vercel.com/
- Import repository
- Configure environment variables
- Deploy

### 3. Environment Variables in Vercel
```
DATABASE_URL=<your-mysql-connection-string>
NEXTAUTH_SECRET=<generate-random-secret>
NEXTAUTH_URL=https://your-app.vercel.app
```

### 4. Run Migrations
```bash
npx prisma migrate deploy
```

---

## Azure Deployment

### 1. Create Resources
- Azure App Service (Linux, Node.js)
- Azure Database for MySQL
- Azure Blob Storage
- Azure Key Vault (for secrets)

### 2. Configure App Service
```bash
az webapp config appsettings set \
  --resource-group venturis-rg \
  --name venturis-app \
  --settings DATABASE_URL="<connection-string>" \
             NEXTAUTH_SECRET="<secret>" \
             NEXTAUTH_URL="https://venturis-app.azurewebsites.net"
```

### 3. Deploy
```bash
# Build application
npm run build

# Deploy to Azure
az webapp deployment source config-zip \
  --resource-group venturis-rg \
  --name venturis-app \
  --src ./deploy.zip
```

---

## Migration from localStorage to Database

### Option 1: Manual Data Entry
Users re-enter their data after upgrade.

### Option 2: Data Migration Script
We can create a one-time script to:
1. Read localStorage data
2. Send to API endpoints
3. Import into database

### Option 3: Import/Export Feature
Add export from old version, import to new version.

---

## Security Enhancements

### Implemented
- ✅ Password hashing (bcrypt)
- ✅ Prepared statements (Prisma)
- ✅ SQL injection protection
- ✅ XSS protection (React)

### Recommended
- [ ] Rate limiting on API routes
- [ ] CORS configuration
- [ ] Content Security Policy
- [ ] Input sanitization
- [ ] Session timeout
- [ ] Password strength requirements
- [ ] Multi-factor authentication
- [ ] IP whitelisting (optional)

---

## Performance Optimizations

### Database
- [ ] Add indexes on foreign keys (already in schema)
- [ ] Connection pooling (Prisma handles this)
- [ ] Query optimization
- [ ] Caching layer (Redis - optional)

### Application
- [ ] Code splitting (split page.tsx into components)
- [ ] Lazy loading for charts
- [ ] Memoization for expensive calculations
- [ ] Compression (gzip/brotli)
- [ ] CDN for static assets

---

## Monitoring & Logging

### Recommended Tools
- **Sentry** - Error tracking
- **Vercel Analytics** - Page performance
- **Azure Application Insights** - Full observability
- **LogTail/Loggly** - Log aggregation

### Metrics to Track
- API response times
- Database query performance
- User session duration
- Error rates
- File upload success rates

---

## Backup Strategy

### Development
```bash
# Manual backup
mysqldump -u root -p venturis_db > backup.sql
```

### Production (Azure)
- Automated daily backups (7-35 days retention)
- Point-in-time restore
- Geo-redundant backups (optional)

### Vercel with PlanetScale
- Automatic backups included
- Branch-based workflows
- Easy rollback

---

## Cost Estimates

### Vercel (Review/Testing Phase)
- **Free Tier**: $0/month
  - 100 GB bandwidth
  - Serverless functions
  - Automatic SSL
- **Pro**: $20/month (if team features needed)

### Production (Azure)
- **App Service (B1)**: $13/month
- **MySQL Flexible Server (B1ms)**: $12/month
- **Blob Storage**: $5/month
- **Application Insights**: ~$5/month
- **Total**: ~$35-50/month

### Alternative (Vercel + PlanetScale)
- **Vercel Pro**: $20/month
- **PlanetScale Scaler**: $29/month
- **Vercel Blob**: $0.15/GB
- **Total**: ~$50-60/month

---

## Current Status

### ✅ Completed
- Dependencies installed
- Prisma schema defined
- Database seed script created
- Environment configuration
- Documentation created

### 🔄 Next (Ready to implement)
- Create API routes
- Update frontend to use APIs
- Testing with local MySQL
- Vercel deployment

### 📋 Future Enhancements
- Email notifications
- PDF export
- Advanced analytics
- Mobile responsive improvements
- Real-time collaboration

---

## Support & Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **NextAuth.js**: https://next-auth.js.org/
- **Vercel Docs**: https://vercel.com/docs
- **Azure Docs**: https://learn.microsoft.com/azure/

---

**Ready to proceed with API route creation?** 🚀


