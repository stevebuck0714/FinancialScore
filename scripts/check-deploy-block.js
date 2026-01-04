#!/usr/bin/env node

/**
 * Check if deployment should be blocked
 * Used to prevent auto-deploys to production when BLOCK_AUTO_DEPLOY=true
 */

if (process.env.BLOCK_AUTO_DEPLOY === 'true') {
  console.log('');
  console.log('🛑 DEPLOYMENT BLOCKED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('BLOCK_AUTO_DEPLOY environment variable is set to "true"');
  console.log('');
  console.log('This prevents automatic deployments to production.');
  console.log('To deploy:');
  console.log('  1. Remove BLOCK_AUTO_DEPLOY from environment variables');
  console.log('  2. Manually trigger a deployment from Vercel dashboard');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // Exit with code 1 to stop the build
  // This is intentional - we want to block the deployment
  process.exit(1);
}

// Continue with build
console.log('✅ Deploy check passed - proceeding with build...');

