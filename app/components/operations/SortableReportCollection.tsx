'use client';

import { type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode, useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import {
  moveSortableReportIdBefore,
  orderSortableReportItems,
  type SortableReportItem,
} from '@/lib/operations/sortable-report-order';

const REPORT_DRAG_DATA_TYPE = 'application/x-sortable-report';

export type SortableReportCollectionItem = SortableReportItem<ReactNode> & {
  wrapperStyle?: CSSProperties;
};

type SortableReportCollectionProps = {
  items: readonly SortableReportCollectionItem[];
  persistedOrder?: readonly string[] | null;
  canReorder: boolean;
  onReorder: (orderedIds: string[]) => void;
  isSaving?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Renders report nodes in their saved order while leaving each node's layout
 * classes and styles under the caller's control.
 */
export default function SortableReportCollection({
  items,
  persistedOrder,
  canReorder,
  onReorder,
  isSaving = false,
  className,
  style,
}: SortableReportCollectionProps) {
  const orderedItems = useMemo(
    () => orderSortableReportItems(items, persistedOrder),
    [items, persistedOrder]
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const isReorderEnabled = canReorder && !isSaving;
  const orderedIds = orderedItems.map((item) => item.id);

  const moveReport = (sourceId: string, targetId: string, placement: 'before' | 'after') => {
    const nextIds = moveSortableReportIdBefore(orderedIds, sourceId, targetId, placement);
    if (nextIds.some((id, index) => id !== orderedIds[index])) onReorder(nextIds);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, id: string) => {
    if (!isReorderEnabled) {
      event.preventDefault();
      return;
    }

    setDraggedId(id);
    event.dataTransfer.setData(REPORT_DRAG_DATA_TYPE, id);
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!isReorderEnabled) return;
    event.preventDefault();

    const sourceId =
      event.dataTransfer.getData(REPORT_DRAG_DATA_TYPE) ||
      event.dataTransfer.getData('text/plain');

    if (sourceId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const placement =
        event.clientY > bounds.top + bounds.height / 2 ||
        (
          Math.abs(event.clientY - (bounds.top + bounds.height / 2)) < bounds.height / 4 &&
          event.clientX > bounds.left + bounds.width / 2
        )
          ? 'after'
          : 'before';
      moveReport(sourceId, targetId, placement);
    }
    setDraggedId(null);
  };

  const handleHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!isReorderEnabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    const currentIndex = orderedIds.indexOf(id);
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const adjacentId = orderedIds[currentIndex + direction];
    if (!adjacentId) return;

    event.preventDefault();
    const nextIds = [...orderedIds];
    const [movedId] = nextIds.splice(currentIndex, 1);
    nextIds.splice(currentIndex + direction, 0, movedId);
    onReorder(nextIds);
  };

  return (
    <div className={className} style={style}>
      {orderedItems.map((item) => (
        <div
          key={item.id}
          data-sortable-report-id={item.id}
          onDragOver={(event) => {
            if (!isReorderEnabled || draggedId === item.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => handleDrop(event, item.id)}
          style={{
            position: 'relative',
            ...item.wrapperStyle,
          }}
        >
          {canReorder && (
            <button
              className="ops-print-hide"
              type="button"
              draggable={isReorderEnabled}
              disabled={!isReorderEnabled}
              onDragStart={(event) => handleDragStart(event, item.id)}
              onDragEnd={() => setDraggedId(null)}
              onKeyDown={(event) => handleHandleKeyDown(event, item.id)}
              aria-label="Reorder report"
              aria-grabbed={draggedId === item.id}
              title="Reorder report"
              style={{
                position: 'absolute',
                zIndex: 2,
                top: '50%',
                right: '-11px',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '32px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                background: '#fff',
                color: '#64748b',
                cursor: isReorderEnabled ? 'grab' : 'wait',
              }}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
          )}
          {item.node}
        </div>
      ))}
    </div>
  );
}
