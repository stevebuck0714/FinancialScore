const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

// Load environment variables - .env.local takes precedence for development
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Fallback to .env for any missing vars

// SAFETY CHECK: Ensure staging/dev environment NEVER connects to production database
// Staging should ONLY use cold-frost, NEVER orange-poetry (production)
// This is the first line of defense - additional checks in lib/db-security.ts

const isProductionDatabase = process.env.DATABASE_URL?.includes('orange-poetry');
const isStagingDatabase = process.env.DATABASE_URL?.includes('cold-frost');

// CRITICAL: Block production database in development/preview environments
if ((process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview') && isProductionDatabase) {
  console.error('🚨 SECURITY ERROR: Staging/Dev environment is trying to connect to PRODUCTION database (orange-poetry)!');
  console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
  console.error('🚨 This is a critical security violation. Staging must use cold-frost only.');
  console.error('🚨 Aborting startup.');
  process.exit(1);
}

// CRITICAL: Block staging database in production environment
if (process.env.VERCEL_ENV === 'production' && isStagingDatabase) {
  console.error('🚨 SECURITY ERROR: Production environment is trying to connect to STAGING database (cold-frost)!');
  console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
  console.error('🚨 This is a critical security violation. Production must use orange-poetry only.');
  console.error('🚨 Aborting startup.');
  process.exit(1);
}

// Log which database we're connecting to
let dbLabel = 'UNKNOWN';
if (isStagingDatabase) {
  dbLabel = 'STAGING (cold-frost)';
} else if (isProductionDatabase) {
  dbLabel = 'PRODUCTION (orange-poetry) ⚠️';
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


















