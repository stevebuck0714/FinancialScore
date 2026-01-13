# Setting Up Automated Trusted Device Cleanup

This guide explains how to set up automated cleanup of expired trusted devices.

## Option 1: Cron Job (Linux/Mac)

1. Open your crontab:
```bash
crontab -e
```

2. Add the following line to run cleanup daily at 2 AM:
```bash
0 2 * * * cd /path/to/FinancialScore && tsx scripts/cleanup-expired-devices.ts >> /var/log/device-cleanup.log 2>&1
```

3. Save and exit.

## Option 2: Windows Task Scheduler

1. Open Task Scheduler
2. Click "Create Basic Task"
3. Name: "Cleanup Expired Trusted Devices"
4. Trigger: Daily at 2:00 AM
5. Action: Start a program
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `node_modules\.bin\tsx scripts\cleanup-expired-devices.ts`
   - Start in: `C:\path\to\FinancialScore`
6. Finish

## Option 3: Vercel Cron (Production on Vercel)

Add to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-devices",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Then create the API route at `app/api/cron/cleanup-devices/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredDevices } from '@/lib/trusted-device';

export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await cleanupExpiredDevices();
    return NextResponse.json({ 
      success: true, 
      cleaned: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron cleanup failed:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
```

## Option 4: Manual Execution

Run manually whenever needed:

```bash
npm run cleanup:devices
```

Add to `package.json`:
```json
{
  "scripts": {
    "cleanup:devices": "tsx scripts/cleanup-expired-devices.ts"
  }
}
```

## Recommended Schedule

- **Development**: Run manually as needed
- **Staging**: Daily at 2 AM
- **Production**: Daily at 2 AM

## Monitoring

Check logs to ensure cleanup is running:
- Linux/Mac: `/var/log/device-cleanup.log`
- Windows: Task Scheduler History
- Vercel: Function Logs in dashboard

