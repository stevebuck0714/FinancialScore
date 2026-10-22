'use client';

import { useEffect } from 'react';
import { MAX_SECTION_SEGMENT_MS, type TrafficSectionKey } from './sections';

const ENDPOINT = '/api/section-views';
const MIN_SEGMENT_MS = 1000;

type Segment = { section: TrafficSectionKey; startedAt: number; isResume: boolean };

function sendSegment(segment: Segment, durationMs: number) {
  const body = JSON.stringify({
    section: segment.section,
    startedAt: new Date(segment.startedAt).toISOString(),
    durationMs: Math.min(MAX_SECTION_SEGMENT_MS, durationMs),
    isResume: segment.isResume,
  });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Times the visible stretches a user spends in one sidebar section. Hiding the
 * tab ends a stretch; returning resumes the same view instead of counting a new one.
 * Pass a null section to disable tracking (non-client users, Site Admin preview).
 */
export function useSectionTracking(section: TrafficSectionKey | null, companyId: string | null) {
  useEffect(() => {
    if (!section || !companyId) return;
    let segment: Segment | null = null;
    let viewCounted = false;

    const start = () => {
      if (segment) return;
      segment = { section, startedAt: Date.now(), isResume: viewCounted };
    };
    const stop = () => {
      if (!segment) return;
      const durationMs = Date.now() - segment.startedAt;
      // A pass-through shorter than a second is navigation, not a visit.
      if (durationMs >= MIN_SEGMENT_MS) {
        sendSegment(segment, durationMs);
        viewCounted = true;
      }
      segment = null;
    };
    const onVisibilityChange = () => (document.visibilityState === 'hidden' ? stop() : start());

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [section, companyId]);
}
