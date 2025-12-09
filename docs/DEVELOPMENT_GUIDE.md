# Development Guide - Preventing Server Corruption

## 🚨 Critical: Development Server Management

**Multiple servers running simultaneously will corrupt your development environment!**

### ✅ CORRECT Development Workflow

#### Starting Development Server
```bash
# Use this command ONLY
npm run dev:vercel

# This automatically:
# 1. Kills any existing dev servers
# 2. Cleans up conflicting processes
# 3. Starts fresh Next.js dev server on port 3000
```

#### Checking Server Status
```bash
# Check what's running on dev ports
netstat -ano | findstr :300

# Should show ONLY one process on port 3000
# If you see multiple ports (3001, 3002, etc.) - CLEANUP NEEDED!
```

#### Emergency Cleanup
```bash
# Kill all dev servers and start fresh
npm run dev:clean

# Then start normally
npm run dev:vercel
```

### ❌ WRONG - These Commands Cause Problems

#### DON'T Use These:
```bash
# ❌ Multiple terminals running different commands
npm run dev:vercel  # Terminal 1
npm run dev:vercel  # Terminal 2 - CONFLICT!

# ❌ Mixing server types
npm run dev        # Uses custom server.js (requires NODE_ENV=development)
npm run dev:vercel  # Uses Next.js dev (ignores NODE_ENV)

# ❌ Manual next commands
npx next dev --port 3000  # Bypasses cleanup
```

### 🔍 Debugging Server Issues

#### Symptoms of Corruption:
- Malformed JSON in API responses
- WebSocket connection failures
- Inconsistent data loading
- Multiple processes on different ports

#### Quick Diagnosis:
```bash
# Check for multiple servers
netstat -ano | findstr :300

# Should show only:
# TCP    0.0.0.0:3000           LISTENING       [single PID]

# If multiple ports visible - run cleanup
npm run dev:clean
npm run dev:vercel
```

### 🛠️ Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:vercel` | **SAFE**: Clean start dev server (use this) |
| `npm run dev:clean` | Kill all dev servers and processes |
| `npm run dev` | Custom server with Socket.IO (requires NODE_ENV=development) |

### 📋 Development Best Practices

1. **Single Terminal Rule**: Only one dev server running at a time
2. **Always Use**: `npm run dev:vercel` to start development
3. **Check Before Starting**: Run `netstat -ano | findstr :300` first
4. **Clean When Corrupted**: Use `npm run dev:clean` if things break
5. **Close Terminals**: Don't leave dev servers running in background

### 🔧 Environment Configuration

- **Development**: Uses `.env.local` (connects to Neon dev database)
- **NODE_ENV**: Set to "production" for staging compatibility
- **Port**: Always 3000 for development

### 🚨 Emergency Recovery

If everything is completely broken:

```bash
# 1. Kill everything
npm run dev:clean

# 2. Force kill any remaining node processes
taskkill /IM node.exe /F

# 3. Clean Next.js cache
rm -rf .next

# 4. Restart fresh
npm run dev:vercel
```

**Remember**: Prevention is better than cure. Always use the safe commands! 🛡️
