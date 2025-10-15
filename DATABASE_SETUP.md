# Database Setup Instructions

## Local Development Setup

### 1. Install MySQL (if not already installed)

**Windows:**
- Download MySQL Community Server from https://dev.mysql.com/downloads/mysql/
- Or use XAMPP/WAMP which includes MySQL
- Or use Docker: `docker run --name mysql-venturis -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d mysql:8.0`

### 2. Create Database

```sql
CREATE DATABASE venturis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Update .env.local

Edit `.env.local` with your MySQL connection details:

```
DATABASE_URL="mysql://USERNAME:PASSWORD@localhost:3306/venturis_db"
```

Example:
```
DATABASE_URL="mysql://root:mypassword@localhost:3306/venturis_db"
```

### 4. Run Migrations

```bash
npx prisma migrate dev --name init
```

This will:
- Create all database tables
- Generate Prisma Client
- Set up relationships

### 5. Seed Initial Data (Site Administrator)

```bash
npm run db:seed
```

This creates the site administrator account:
- Email: `siteadministrator@venturis.com`
- Password: `Venturis0801$`

### 6. View Database (Optional)

```bash
npx prisma studio
```

Opens a visual database browser at http://localhost:5555

---

## Vercel Deployment

### Option 1: PlanetScale (Recommended for Vercel)

1. Create free account at https://planetscale.com/
2. Create new database
3. Copy connection string
4. Add to Vercel environment variables

### Option 2: Azure MySQL

1. Create Azure Database for MySQL
2. Configure firewall rules
3. Copy connection string
4. Add to Vercel environment variables

---

## Azure Production Deployment

### 1. Create Azure MySQL Database

```bash
az mysql server create \
  --resource-group myResourceGroup \
  --name venturis-mysql \
  --location eastus \
  --admin-user adminuser \
  --admin-password <password> \
  --sku-name B_Gen5_1
```

### 2. Configure Firewall

```bash
az mysql server firewall-rule create \
  --resource-group myResourceGroup \
  --server venturis-mysql \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 3. Get Connection String

```
mysql://adminuser:password@venturis-mysql.mysql.database.azure.com:3306/venturis_db?sslmode=require
```

### 4. Run Migrations

```bash
npx prisma migrate deploy
```

---

## Database Backup

### Automated Backup Script

```bash
# Create backup
mysqldump -u root -p venturis_db > backup_$(date +%Y%m%d).sql

# Restore backup
mysql -u root -p venturis_db < backup_20250101.sql
```

### Azure Backup
- Azure MySQL includes automatic backups
- Retention: 7-35 days
- Point-in-time restore available

---

## Troubleshooting

### Connection Errors
- Check MySQL is running: `mysql -u root -p`
- Verify credentials in .env.local
- Check firewall rules

### Migration Errors
- Reset database: `npx prisma migrate reset`
- Delete prisma/migrations folder and start fresh
- Check MySQL version compatibility (8.0+ recommended)

### Prisma Client Issues
- Regenerate client: `npx prisma generate`
- Clear cache: `rm -rf node_modules/.prisma`


