export type SortableReportItem<TNode = unknown> = {
  id: string;
  node: TNode;
};

function normalizedId(value: unknown): string {
  return String(value || '').trim();
}

/**
 * Applies a saved report order without hiding reports added after it was saved.
 */
export function orderSortableReportItems<TItem extends SortableReportItem<unknown>>(
  items: readonly TItem[],
  persistedIds: readonly string[] | null | undefined
): TItem[] {
  const itemsById = new Map<string, TItem>();
  const suppliedItems: TItem[] = [];

  for (const item of items) {
    const id = normalizedId(item.id);
    if (!id || itemsById.has(id)) continue;

    const normalizedItem = { ...item, id } as TItem;
    itemsById.set(id, normalizedItem);
    suppliedItems.push(normalizedItem);
  }

  const ordered: TItem[] = [];
  const includedIds = new Set<string>();

  for (const persistedId of persistedIds || []) {
    const id = normalizedId(persistedId);
    const item = itemsById.get(id);
    if (!item || includedIds.has(id)) continue;
    ordered.push(item);
    includedIds.add(id);
  }

  for (const item of suppliedItems) {
    if (!includedIds.has(item.id)) ordered.push(item);
  }

  return ordered;
}

/**
 * Moves a known report immediately before the requested target report.
 */
export function moveSortableReportIdBefore(
  orderedIds: readonly string[],
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after' = 'before'
): string[] {
  const sourceIndex = orderedIds.indexOf(sourceId);
  const targetIndex = orderedIds.indexOf(targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...orderedIds];
  }

  const nextIds = [...orderedIds];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  const destinationIndex = nextIds.indexOf(targetId);
  nextIds.splice(destinationIndex + (placement === 'after' ? 1 : 0), 0, movedId);
  return nextIds;
}
