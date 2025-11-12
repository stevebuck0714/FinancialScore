import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function initWebSocketServer(server: HTTPServer) {
  if (io) {
    console.log('WebSocket server already initialized');
    return io;
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  io.on('connection', (socket) => {
    console.log('🔌 New WebSocket connection:', socket.id);

    // Join user-specific room
    socket.on('join', (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    // Join company-specific room
    socket.on('joinCompany', (companyId: string) => {
      socket.join(`company:${companyId}`);
      console.log(`Joined company room: ${companyId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected:', socket.id);
    });
  });

  console.log('✅ WebSocket server initialized');
  return io;
}

export function getWebSocketServer(): SocketIOServer | null {
  return io;
}

// Emit sync status update to specific company
export function emitSyncStatus(companyId: string, data: {
  status: 'started' | 'progress' | 'completed' | 'error';
  message: string;
  progress?: number;
  recordsImported?: number;
  error?: string;
}) {
  if (!io) {
    console.warn('WebSocket server not initialized');
    return;
  }

  io.to(`company:${companyId}`).emit('syncStatus', {
    ...data,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted sync status to company ${companyId}:`, data.status);
}

// Emit notification to specific user
export function emitNotification(userId: string, notification: {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}) {
  if (!io) {
    console.warn('WebSocket server not initialized');
    return;
  }

  io.to(`user:${userId}`).emit('notification', {
    ...notification,
    timestamp: new Date().toISOString(),
  });

  console.log(`📡 Emitted notification to user ${userId}:`, notification.type);
}



