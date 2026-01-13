#!/usr/bin/env tsx
/**
 * Cleanup Expired Trusted Devices
 * 
 * This script marks expired trusted devices as inactive.
 * Run this script daily via cron or scheduled task.
 * 
 * Usage:
 *   tsx scripts/cleanup-expired-devices.ts
 * 
 * Cron example (daily at 2 AM):
 *   0 2 * * * cd /path/to/project && tsx scripts/cleanup-expired-devices.ts
 */

import { cleanupExpiredDevices } from '../lib/trusted-device';

async function main() {
  console.log('🧹 Starting cleanup of expired trusted devices...');
  console.log('⏰ Run time:', new Date().toISOString());
  
  try {
    const count = await cleanupExpiredDevices();
    console.log(`✅ Cleanup complete. Removed ${count} expired device(s).`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();

