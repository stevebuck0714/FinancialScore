'use client';

import { useEffect, useRef } from 'react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const THROTTLE_INTERVAL = 30 * 1000; // Only reset timer once per 30 seconds

interface InactivityLogoutProps {
  isLoggedIn: boolean;
  userEmail?: string;
  onLogout: () => void;
}

export default function InactivityLogout({ isLoggedIn, userEmail, onLogout }: InactivityLogoutProps) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onLogoutRef = useRef(onLogout);
  const isInitializedRef = useRef(false);

  // Keep logout function ref up to date without triggering re-initialization
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    console.log('[InactivityLogout] Auth status:', isLoggedIn ? 'logged in' : 'logged out', 'User:', userEmail);
    
    // Only run if user is logged in
    if (!isLoggedIn) {
      console.log('[InactivityLogout] Not logged in, skipping timer setup');
      isInitializedRef.current = false;
      return;
    }

    // Prevent re-initialization if already set up
    if (isInitializedRef.current) {
      console.log('[InactivityLogout] Timer already initialized, skipping duplicate setup');
      return;
    }

    console.log('[InactivityLogout] Setting up inactivity timer for user:', userEmail);
    isInitializedRef.current = true;

    const resetTimer = () => {
      const now = Date.now();
      
      // Throttle: only reset if at least THROTTLE_INTERVAL has passed since last activity
      if (now - lastActivityRef.current < THROTTLE_INTERVAL) {
        return;
      }

      const minutesUntilLogout = INACTIVITY_TIMEOUT / 60000;
      console.log(`[InactivityLogout] Activity detected. Timer reset. User will be logged out after ${minutesUntilLogout} minutes of inactivity.`);
      lastActivityRef.current = now;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout - use ref to get latest logout function
      timeoutRef.current = setTimeout(() => {
        console.warn('[InactivityLogout] ⏰ 15 minutes of inactivity detected. Logging out user.');
        alert('You have been logged out due to 15 minutes of inactivity.');
        onLogoutRef.current();
      }, INACTIVITY_TIMEOUT);
    };

    // Events that indicate user activity
    const events = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    // Add event listeners with passive option for better performance
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Initialize timer
    console.log('[InactivityLogout] ✅ Inactivity timer initialized');
    resetTimer();

    // Cleanup
    return () => {
      console.log('[InactivityLogout] Cleaning up inactivity timer');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      isInitializedRef.current = false;
    };
  }, [isLoggedIn, userEmail]);

  return null; // This component doesn't render anything
}


