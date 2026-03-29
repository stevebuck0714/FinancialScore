const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables - .env.local takes precedence for development
// IMPORTANT: Use override=true so a blank host env var doesn't mask .env.local
const envLocal = dotenv.config({ path: '.env.local', override: true });
// Fallback to .env for any missing vars, but DO NOT override .env.local
dotenv.config({ path: '.env', override: false });

// Hard pin database vars from .env.local in local/dev runtime.
// This prevents .env or inherited shell vars from accidentally switching DB targets.
if (envLocal?.parsed?.DATABASE_URL) {
  process.env.DATABASE_URL = envLocal.parsed.DATABASE_URL;
}
if (envLocal?.parsed?.DIRECT_URL) {
  process.env.DIRECT_URL = envLocal.parsed.DIRECT_URL;
}

// Debug (safe): show whether keys are present (no secrets)
let serpApiFileLen = 0;
let serpApiFilePrefix = '';
try {
  const raw = fs.readFileSync('.env.local', 'utf8');
  const parsedEnv = dotenv.parse(raw);
  const fileKey = String(parsedEnv.SERPAPI_API_KEY || '');
  serpApiFileLen = fileKey.length;
  serpApiFilePrefix = fileKey.slice(0, 8);
} catch (e) {
  // ignore
}
console.log('🔐 ENV loaded:', {
  hasOpenAI: !!process.env.OPENAI_API_KEY,
  hasSerpApi: !!process.env.SERPAPI_API_KEY,
  serpApiLen: (process.env.SERPAPI_API_KEY || '').length,
  serpApiFileLen,
  serpApiFilePrefix,
});

// SAFETY CHECK: Local/dev/preview should NEVER connect to production databases
// CRITICAL: Even if NODE_ENV is "production" locally, this must be blocked.
// Production databases are only allowed on Vercel production runtime: VERCEL=1 and VERCEL_ENV=production.

const productionProjects = (process.env.PRODUCTION_DB_PROJECTS || 'orange-poetry,aged-snow')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const stagingProjects = (process.env.STAGING_DB_PROJECTS || 'cold-frost')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const isProductionDatabase = productionProjects.some((project) => process.env.DATABASE_URL?.includes(project));
const isStagingDatabase = stagingProjects.some((project) => process.env.DATABASE_URL?.includes(project));
const isVercelProductionRuntime = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';

// CRITICAL: Block production database everywhere except Vercel production runtime
if (isProductionDatabase && !isVercelProductionRuntime) {
  console.error('🚨 SECURITY ERROR: Staging/Dev environment is trying to connect to a PRODUCTION database!');
  console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
  console.error(`🚨 VERCEL_ENV: ${process.env.VERCEL_ENV}  VERCEL: ${process.env.VERCEL}  NODE_ENV: ${process.env.NODE_ENV}`);
  console.error('🚨 This is a critical security violation. Local/dev/preview must never connect to production databases.');
  console.error('🚨 Aborting startup.');
  process.exit(1);
}

// NOTE: We do not block cold-frost when VERCEL_ENV=production here because Vercel "production"
// is per-project; some non-prod projects may deploy with --prod while correctly using cold-frost.

// Log which database we're connecting to
let dbLabel = 'UNKNOWN';
if (isStagingDatabase) {
  const stagingName = stagingProjects.find((project) => process.env.DATABASE_URL?.includes(project)) || 'staging';
  dbLabel = `STAGING (${stagingName})`;
} else if (isProductionDatabase) {
  const prodName = productionProjects.find((project) => process.env.DATABASE_URL?.includes(project)) || 'production';
  dbLabel = `PRODUCTION (${prodName}) ⚠️`;
  console.warn('⚠️  WARNING: Connected to PRODUCTION database!');
} else if (process.env.DATABASE_URL?.includes('file:')) {
  dbLabel = 'SQLITE (file)';
} else {
  dbLabel = 'OTHER';
}
console.log('🔗 DATABASE:', dbLabel);

// Force development mode for dev script
const dev = true;
console.log('🔧 Forced dev mode:', dev);
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || `http://${hostname}:${port}`,
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  // Store io instance globally for API routes to access
  global.io = io;

  io.on('connection', (socket) => {
    console.log('🔌 New WebSocket connection:', socket.id);

    // Join user-specific room
    socket.on('join', (userId) => {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room`);
      socket.emit('joined', { userId, message: 'Successfully joined' });
    });

    // Join company-specific room
    socket.on('joinCompany', (companyId) => {
      socket.join(`company:${companyId}`);
      console.log(`Joined company room: ${companyId}`);
      socket.emit('joinedCompany', { companyId, message: 'Successfully joined company room' });
    });

    // Leave company room
    socket.on('leaveCompany', (companyId) => {
      socket.leave(`company:${companyId}`);
      console.log(`Left company room: ${companyId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected:', socket.id);
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`✅ Server ready on http://${hostname}:${port}`);
    console.log(`✅ WebSocket ready on ws://${hostname}:${port}/api/socket`);
  });
});


















