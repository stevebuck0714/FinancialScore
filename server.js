const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');

// Load environment variables - .env.local takes precedence for development
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Fallback to .env for any missing vars

// Log which database we're connecting to
console.log('🔗 DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');

const dev = process.env.NODE_ENV !== 'production';
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


















