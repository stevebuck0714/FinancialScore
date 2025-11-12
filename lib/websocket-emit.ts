// Utility functions to emit WebSocket events from API routes

export function emitSyncStatus(companyId: string, data: {
  status: 'started' | 'progress' | 'completed' | 'error';
  message: string;
  progress?: number;
  recordsImported?: number;
  error?: string;
  intuitTid?: string | null;
}) {
  try {
    // Access the global io instance
    const io = (global as any).io;
    
    if (!io) {
      console.warn('⚠️  WebSocket server not available');
      return;
    }

    io.to(`company:${companyId}`).emit('syncStatus', {
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted sync status to company ${companyId}:`, data.status);
  } catch (error) {
    console.error('Error emitting sync status:', error);
  }
}

export function emitNotification(userId: string, notification: {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}) {
  try {
    const io = (global as any).io;
    
    if (!io) {
      console.warn('⚠️  WebSocket server not available');
      return;
    }

    io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted notification to user ${userId}:`, notification.type);
  } catch (error) {
    console.error('Error emitting notification:', error);
  }
}

export function emitToCompany(companyId: string, event: string, data: any) {
  try {
    const io = (global as any).io;
    
    if (!io) {
      console.warn('⚠️  WebSocket server not available');
      return;
    }

    io.to(`company:${companyId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted ${event} to company ${companyId}`);
  } catch (error) {
    console.error(`Error emitting ${event}:`, error);
  }
}

export function emitToUser(userId: string, event: string, data: any) {
  try {
    const io = (global as any).io;
    
    if (!io) {
      console.warn('⚠️  WebSocket server not available');
      return;
    }

    io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted ${event} to user ${userId}`);
  } catch (error) {
    console.error(`Error emitting ${event}:`, error);
  }
}

