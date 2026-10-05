'use client';

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import OperationalReportPanel from './OperationalReportPanel';
import SortableReportCollection, {
  type SortableReportCollectionItem,
} from './SortableReportCollection';

type OperationalReportPageLayoutProps = {
  children: ReactNode;
  persistedOrder?: readonly string[] | null;
  canReorder: boolean;
  isSaving?: boolean;
  onReorder: (orderedIds: string[]) => void;
};

type PanelElementProps = {
  reportKey: string;
  canReorder: boolean;
  style?: CSSProperties;
  children?: ReactNode;
};

type ExtractionResult = {
  fixedContent: ReactNode;
  reports: SortableReportCollectionItem[];
};

function extractReportPanels(node: ReactNode): ExtractionResult {
  const reports: SortableReportCollectionItem[] = [];
  const duplicateCounts = new Map<string, number>();

  const visit = (current: ReactNode): ReactNode => {
    if (current == null || typeof current === 'boolean') return null;

    if (Array.isArray(current)) {
      const children = current.map(visit).filter((child) => child != null);
      return children.length > 0 ? children : null;
    }

    if (!isValidElement(current)) return current;

    if (current.type === OperationalReportPanel) {
      const panel = current as ReactElement<PanelElementProps>;
      const baseId = String(panel.props.reportKey || '').trim();
      if (!baseId) return null;

      const occurrence = (duplicateCounts.get(baseId) || 0) + 1;
      duplicateCounts.set(baseId, occurrence);
      const id = occurrence === 1 ? baseId : `${baseId}::${occurrence}`;
      const panelStyle = { ...(panel.props.style || {}) };
      const wrapperGridColumn = panelStyle.gridColumn;
      delete panelStyle.order;
      delete panelStyle.outline;
      delete panelStyle.outlineOffset;
      if (panelStyle.cursor === 'grab' || panelStyle.cursor === 'grabbing') {
        delete panelStyle.cursor;
      }
      reports.push({
        id,
        // Keep the complete existing panel—including its card styling, report,
        // chart, or table—and let the outer collection own the single handle.
        node: cloneElement(panel, { canReorder: false, style: panelStyle }),
        wrapperStyle: wrapperGridColumn
          ? { gridColumn: wrapperGridColumn }
          : undefined,
      });
      return null;
    }

    const element = current as ReactElement<{ children?: ReactNode }>;
    const originalChildren = element.props.children;
    if (originalChildren === undefined) return current;

    const nextChildren = Children.toArray(originalChildren)
      .map(visit)
      .filter((child) => child != null);

    if (nextChildren.length === 0) return null;
    return cloneElement(element, undefined, ...nextChildren);
  };

  const fixedContent = visit(node);
  return { fixedContent, reports };
}

export default function OperationalReportPageLayout({
  children,
  persistedOrder,
  canReorder,
  isSaving = false,
  onReorder,
}: OperationalReportPageLayoutProps) {
  const { fixedContent, reports } = extractReportPanels(children);

  if (reports.length === 0) return <>{children}</>;

  return (
    <Fragment>
      {fixedContent}
      <SortableReportCollection
        items={reports}
        persistedOrder={persistedOrder}
        canReorder={canReorder}
        isSaving={isSaving}
        onReorder={onReorder}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, max(460px, calc((100% - 16px) / 2))), 1fr))',
          gap: '16px',
          padding: '0 32px 32px',
        }}
      />
    </Fragment>
  );
}
