'use client';

import type { CSSProperties, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

type OperationalReportPanelProps = {
  reportKey: string;
  canReorder: boolean;
  isSaving?: boolean;
  onMove: (sourceReportKey: string, targetReportKey: string) => void;
  style?: CSSProperties;
  children: ReactNode;
};

export default function OperationalReportPanel({
  reportKey,
  canReorder,
  isSaving = false,
  onMove,
  style,
  children,
}: OperationalReportPanelProps) {
  return (
    <div
      data-operational-report-key={reportKey}
      onDragOver={(event) => {
        if (!canReorder || isSaving) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        if (!canReorder || isSaving) return;
        event.preventDefault();
        const sourceReportKey = event.dataTransfer.getData('application/x-operational-report') || '';
        if (sourceReportKey && sourceReportKey !== reportKey) onMove(sourceReportKey, reportKey);
      }}
      style={{
        position: 'relative',
        ...style,
      }}
    >
      {canReorder && (
        <button
          className="ops-print-hide"
          type="button"
          draggable={!isSaving}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-operational-report', reportKey);
            event.dataTransfer.effectAllowed = 'move';
          }}
          aria-label="Drag to reorder report"
          title="Drag to reorder report"
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
            cursor: isSaving ? 'wait' : 'grab',
          }}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      )}
      {children}
    </div>
  );
}
