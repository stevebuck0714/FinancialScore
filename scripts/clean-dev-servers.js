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
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        timeout: 15000,
      });
      const lines = output
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const pids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const localAddress = String(parts[1] || '');
        const state = String(parts[3] || '').toUpperCase();
        const pid = String(parts[4] || '').trim();
        const pidAsNumber = Number(pid);
        if (!localAddress.endsWith(`:${port}`)) continue;
        if (state !== 'LISTENING') continue;
        if (!Number.isFinite(pidAsNumber) || pidAsNumber <= 0) continue;
        pids.add(pidAsNumber);
      }

      for (const pid of pids) {
        if (killPidWindows(pid)) {
          console.log(`✅ Killed process ${pid} on port ${port}`);
        }
      }
    } else {
      // Unix-like systems
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe', timeout: 15000 });
        console.log(`✅ Killed processes on port ${port}`);
      } catch (e) {
        // No processes on this port
      }
    }
  } catch (e) {
    // No processes found on this port
  }
}

function killPidWindows(pid) {
  const pidNum = Number(pid);
  if (!Number.isFinite(pidNum) || pidNum <= 0) return false;

  try {
    execSync(`taskkill /PID ${pidNum} /F`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch (taskkillError) {
    // Some Windows sessions return timeout even when the process is killable.
    // Fall back to the .NET Process API for reliability.
    try {
      const command =
        `powershell -NoProfile -Command "` +
        `$p=[System.Diagnostics.Process]::GetProcessById(${pidNum});` +
        `$p.Kill();` +
        `$p.WaitForExit(5000) | Out-Null` +
        `"`;
      execSync(command, { stdio: 'pipe', timeout: 15000 });
      return true;
    } catch (psError) {
      return false;
    }
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
