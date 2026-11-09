'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Horizontal scroll container with a second, synced scrollbar above the content. */
export default function TopScrollContainer({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setScrollWidth(body.scrollWidth);
      setOverflowing(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, [children]);

  const sync = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (source && target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };

  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      {overflowing && (
        <div ref={topRef} onScroll={() => sync(topRef.current, bodyRef.current)} style={{ overflowX: 'auto', overflowY: 'hidden', height: 14 }}>
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
      <div ref={bodyRef} onScroll={() => sync(bodyRef.current, topRef.current)} style={{ ...style, overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
