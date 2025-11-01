'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const THROTTLE_INTERVAL = 30 * 1000; // Only reset timer once per 30 seconds

export default function InactivityLogout() {
  const { data: session, status } = useSession();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    console.log('[InactivityLogout] Session status:', status, 'User:', session?.user?.email);
    
    // Only run if user is authenticated
    if (status !== 'authenticated' || !session?.user) {
      console.log('[InactivityLogout] Not authenticated, skipping timer setup');
      return;
    }

    console.log('[InactivityLogout] Setting up inactivity timer for user:', session.user.email);

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
        console.warn('[InactivityLogout] ⏰ 15 minutes of inactivity detected. Logging out user:', session.user.email);
        signOut({ callbackUrl: '/', redirect: true });
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
  }, [session, status]);

  return null; // This component doesn't render anything
}


