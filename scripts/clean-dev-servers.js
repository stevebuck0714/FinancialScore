#!/usr/bin/env node

/**
 * Clean Development Servers Script
 * Prevents multiple dev servers from running and causing corruption
 */

const { execSync } = require('child_process');
const os = require('os');

function isWindows() {
  return os.platform() === 'win32';
}

function killProcessOnPort(port) {
  try {
    if (isWindows()) {
      // Use netstat and taskkill on Windows
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[4];
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
            console.log(`✅ Killed process ${pid} on port ${port}`);
          } catch (e) {
            // Process might already be gone
          }
        }
      }
    } else {
      // Unix-like systems
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
        console.log(`✅ Killed processes on port ${port}`);
      } catch (e) {
        // No processes on this port
      }
    }
  } catch (e) {
    // No processes found on this port
  }
}

function killAllNodeProcesses() {
  try {
    if (isWindows()) {
      // Only kill Next.js development processes, not all Node processes
      execSync('taskkill /IM node.exe /FI "WINDOWTITLE eq next dev*" /F', { stdio: 'pipe' });
      execSync('taskkill /IM node.exe /FI "WINDOWTITLE eq npm run dev*" /F', { stdio: 'pipe' });
      console.log('✅ Killed development server processes');
    } else {
      execSync('pkill -f "node.*server\\.js\\|next.*dev"', { stdio: 'pipe' });
      console.log('✅ Killed all development server processes');
    }
  } catch (e) {
    console.log('ℹ️  No development server processes found');
  }
}

function main() {
  console.log('🧹 Cleaning development servers...\n');

  // Kill specific ports that dev servers commonly use
  const ports = [3000, 3001, 3002, 3003, 3004, 3005];
  ports.forEach(port => killProcessOnPort(port));

  console.log('\n✅ Development environment cleaned!');
  console.log('💡 Safe to run: npm run dev:vercel');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { killProcessOnPort, killAllNodeProcesses };
