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

  useEffect(() => {
    console.log('[InactivityLogout] Auth status:', isLoggedIn ? 'logged in' : 'logged out', 'User:', userEmail);
    
    // Only run if user is logged in
    if (!isLoggedIn) {
      console.log('[InactivityLogout] Not logged in, skipping timer setup');
      return;
    }

    console.log('[InactivityLogout] Setting up inactivity timer for user:', userEmail);

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

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('[InactivityLogout] ⏰ 15 minutes of inactivity detected. Logging out user:', userEmail);
        onLogout();
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
    };
  }, [isLoggedIn, userEmail, onLogout]);

  return null; // This component doesn't render anything
}


