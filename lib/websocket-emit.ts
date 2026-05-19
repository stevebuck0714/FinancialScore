// Utility functions to emit WebSocket events from API routes

type SocketEmitter = {
  to: (room: string) => {
    emit: (event: string, payload: Record<string, unknown>) => void;
  };
};

function getSocketEmitter(): SocketEmitter | null {
  const io = (global as unknown as Record<string, unknown>).io;
  if (!io || typeof io !== 'object') return null;
  const emitter = io as Record<string, unknown>;
  if (typeof emitter.to !== 'function') return null;
  return emitter as unknown as SocketEmitter;
}

export function emitSyncStatus(companyId: string, data: {
  status: 'started' | 'progress' | 'in_progress' | 'completed' | 'error';
  message: string;
  progress?: number;
  recordsImported?: number;
  error?: string;
  intuitTid?: string | null;
  traceId?: string | null;
}) {
  try {
    const io = getSocketEmitter();
    if (!io) return;

    io.to(`company:${companyId}`).emit('syncStatus', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error emitting sync status:', error);
  }
}
