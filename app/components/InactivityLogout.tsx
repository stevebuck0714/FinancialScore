'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const THROTTLE_INTERVAL = 30 * 1000; // Only reset timer once per 30 seconds

export default function InactivityLogout() {
  const { data: session } = useSession();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    // Only run if user is logged in
    if (!session?.user) {
      return;
    }

    const resetTimer = () => {
      const now = Date.now();
      
      // Throttle: only reset if at least THROTTLE_INTERVAL has passed since last activity
      if (now - lastActivityRef.current < THROTTLE_INTERVAL) {
        return;
      }

      lastActivityRef.current = now;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        console.log('Logging out user due to inactivity');
        signOut({ callbackUrl: '/' });
      }, INACTIVITY_TIMEOUT);
    };

    // Events that indicate user activity
    // Removed 'mousemove' to prevent excessive triggering
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
    resetTimer();

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [session]);

  return null; // This component doesn't render anything
}


