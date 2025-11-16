'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SyncStatus {
  status: 'started' | 'progress' | 'completed' | 'error';
  message: string;
  progress?: number;
  recordsImported?: number;
  error?: string;
  intuitTid?: string | null;
  timestamp: string;
}

interface Notification {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

export function useWebSocket(userId?: string, companyId?: string) {
  const [connected, setConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only connect if we have userId or companyId
    if (!userId && !companyId) {
      return;
    }

    // Initialize socket connection
    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', socket.id);
      setConnected(true);

      // Join rooms
      if (userId) {
        socket.emit('join', userId);
      }
      if (companyId) {
        socket.emit('joinCompany', companyId);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      setConnected(false);
    });

    socket.on('joined', (data: any) => {
      console.log('✅ Joined user room:', data);
    });

    socket.on('joinedCompany', (data: any) => {
      console.log('✅ Joined company room:', data);
    });

    // Listen for sync status updates
    socket.on('syncStatus', (data: SyncStatus) => {
      console.log('📡 Received sync status:', data);
      setSyncStatus(data);
    });

    // Listen for notifications
    socket.on('notification', (data: Notification) => {
      console.log('📡 Received notification:', data);
      setNotifications(prev => [...prev, data]);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('WebSocket connection error:', error);
      setConnected(false);
    });

    // Cleanup on unmount
    return () => {
      if (companyId) {
        socket.emit('leaveCompany', companyId);
      }
      socket.disconnect();
    };
  }, [userId, companyId]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  const clearSyncStatus = () => {
    setSyncStatus(null);
  };

  return {
    connected,
    syncStatus,
    notifications,
    clearNotifications,
    clearSyncStatus,
    socket: socketRef.current,
  };
}


















