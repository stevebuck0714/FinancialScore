'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTHS,
  PRODUCTION_TYPE_OPTIONS,
  typedAdjustedMonthQty,
  emptyMonthQtyMap,
  forecastMonthIsEditable,
  monthQty,
  monthQtyTotal,
  pctVsPlan,
  remainingForecastQty,
  summarizeForecastQtyMonths,
  type ForecastMonth,
  type ForecastMonthQtyTotals,
  type MonthQtyMap,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';
import ProductMonthlyTrendChartModal, {
  buildProductMonthlyTrendRows,
} from './ProductMonthlyTrendChartModal';
import { estMonthIndex, estYear } from '@/lib/time/eastern';
import SgpBudgetLockBar from './SgpBudgetLockBar';

type CustomerOption = {
  customerId: string;
  customerName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type ForecastLine = ProductRevenueForecastLineInput & { id: string };
type ItemHistoryPoint = {
  month: string;
  forecast: number | null;
  actual: number | null;
};
type IdentitySortKey = 'itemSku' | 'customerPartNumber' | 'customerGroup' | 'team' | 'csr';
type ForecastSortKey =
  | IdentitySortKey
  | 'productionType'
  | 'previousSgp'
  | 'previousForecast'
  | 'previousAdjusted'
  | 'previousActual'
  | 'previousActualVsForecast'
  | 'previousActualVsAdjusted'
  | 'selectedSgp'
  | 'selectedForecast'
  | 'selectedAdjusted'
  | 'selectedActual'
  | 'selectedActualVsForecast'
  | 'selectedActualVsAdjusted';

type ProductRevenueForecastReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
  itemIdFilter?: string;
  onItemIdFilterChange?: (itemId: string) => void;
  /** Opening an item from the new-items alert resets the customer and resolves it from the item. */
  itemFocusRequest?: { itemId: string; requestId: number } | null;
};

type ItemCustomer = {
  customerId: string;
  customerName: string;
  customerPartNumber: string;
};

function blankForecastLine(
  customer: CustomerOption,
  itemSku: string,
  customerPartNumber: string,
  customerGroup: string,
  sortOrder: number
): ForecastLine {
  return {
    id: `tmp-${Date.now()}`,
    customerId: customer.customerId,
    customerName: customer.customerName,
    customerGroup,
    customerPartNumber,
    itemSku,
    team: '',
    csr: '',
    productionType: '',
    statusFlag: '',
    annualBaseQty: null,
    forecastQty: emptyMonthQtyMap(),
    sgpForecastQty: emptyMonthQtyMap(),
    adjustedQty: emptyMonthQtyMap(),
    actualQty: emptyMonthQtyMap(),
    sortOrder,
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
  fontSize: 12,
  color: '#0f172a',
  background: '#ffffff',
};

const IDENTITY_COLUMNS: Array<{
  key: 'itemSku' | 'customerPartNumber' | 'customerGroup' | 'team' | 'csr';
  label: string;
  widthCh: number;
  compact?: boolean;
  sortable?: boolean;
  readOnly?: boolean;
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 19, sortable: true },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12, sortable: true },
  { key: 'customerGroup', label: 'Group', widthCh: 8, sortable: true },
  { key: 'team', label: 'TEAM', widthCh: 5, compact: true, sortable: true },
  { key: 'csr', label: 'CSR', widthCh: 3, compact: true, sortable: true },
];

const CHAR_PX = 8;
const IDENTITY_CELL_PAD_X = 6;
const IDENTITY_CELL_EXTRA_PX = 28;
const MONTH_COL_HEADER_BG = '#e0e7ff';
const MONTH_COL_CELL_BG = '#eef2ff';
const MONTH_METRIC_COL_PX = 68;
const MONTH_METRIC_COL_COUNT = 12;
const PLANNED_COL_CH = 6;

function columnWidthPx(widthCh: number): number {
  return widthCh * CHAR_PX + IDENTITY_CELL_EXTRA_PX;
}

const IDENTITY_COLUMN_LEFT_PX = IDENTITY_COLUMNS.reduce<number[]>((offsets, column, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + columnWidthPx(IDENTITY_COLUMNS[index - 1].widthCh));
  return offsets;
}, []);

const IDENTITY_COLUMNS_WIDTH_PX = IDENTITY_COLUMNS.reduce(
  (sum, column) => sum + columnWidthPx(column.widthCh),
  0
);
const TABLE_MIN_WIDTH_PX =
  IDENTITY_COLUMNS_WIDTH_PX +
  columnWidthPx(PLANNED_COL_CH) +
  MONTH_METRIC_COL_COUNT * MONTH_METRIC_COL_PX;

function columnWidth(widthCh: number): string {
  return `${columnWidthPx(widthCh)}px`;
}

function stickyIdentityStyle(
  index: number,
  header: boolean,
  columns: typeof IDENTITY_COLUMNS = IDENTITY_COLUMNS
): React.CSSProperties {
  const column = columns[index];
  const isLast = index === columns.length - 1;
  const width = columnWidth(column.widthCh);
  const inputPadX = column.compact ? 4 : 7;
  return {
    position: 'sticky',
    left: columns.slice(0, index).reduce((left, item) => left + columnWidthPx(item.widthCh), 0),
    width,
    minWidth: width,
    maxWidth: width,
    boxSizing: 'border-box',
    zIndex: header ? 4 : 3,
    background: header ? '#f8fafc' : '#ffffff',
    boxShadow: isLast ? '2px 0 0 #e2e8f0' : undefined,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'left',
    paddingLeft: header ? IDENTITY_CELL_PAD_X + inputPadX + 1 : IDENTITY_CELL_PAD_X,
    paddingRight: IDENTITY_CELL_PAD_X,
  };
}

const identityInputStyle: React.CSSProperties = {
  ...inputStyle,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  minWidth: 0,
  textAlign: 'right',
  padding: '5px 2px',
};

function currentYear(): number {
  return estYear();
}

function currentMonth(): ForecastMonth {
  return (estMonthIndex() + 1) as ForecastMonth;
}

function yearOptions(): number[] {
  const year = currentYear();
  const start = year - 1;
  const end = 2030 + Math.max(0, year - 2026);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function comparePn(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function qtyValue(map: MonthQtyMap, month: ForecastMonth): number {
  return monthQty(map, month);
}

export default function ProductRevenueForecastReport({
  selectedCompanyId,
  onOpenInfo,
  itemIdFilter = '',
  onItemIdFilterChange,
  itemFocusRequest = null,
}: ProductRevenueForecastReportProps) {
  const [year, setYear] = useState(currentYear());
  const [catalogSourceYear, setCatalogSourceYear] = useState<number | null>(null);
  const [dataThru, setDataThru] = useState('');
  const [customerIdSearch, setCustomerIdSearch] = useState('');
  const [customerIdSearchError, setCustomerIdSearchError] = useState<string | null>(null);
  const [customerKey, setCustomerKey] = useState('');
  const [customerGroup, setCustomerGroup] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<ForecastMonth>(currentMonth());
  const [sortKey, setSortKey] = useState<ForecastSortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [chartOpen, setChartOpen] = useState(false);
  const [companyMonthTotals, setCompanyMonthTotals] = useState<ForecastMonthQtyTotals | null>(null);
  const [loadingCompanyTotals, setLoadingCompanyTotals] = useState(false);
  const [historyLine, setHistoryLine] = useState<ForecastLine | null>(null);
  const [itemHistory, setItemHistory] = useState<ItemHistoryPoint[]>([]);
  const [loadingItemHistory, setLoadingItemHistory] = useState(false);
  const [itemHistoryError, setItemHistoryError] = useState<string | null>(null);
  const [sgpLocked, setSgpLocked] = useState(false);
  const handleSgpLockChange = useCallback((locked: boolean) => setSgpLocked(locked), []);
  const customersRequestSeq = useRef(0);
  const [itemCustomers, setItemCustomers] = useState<{ itemId: string; customers: ItemCustomer[] } | null>(null);
  const [loadingItemCustomers, setLoadingItemCustomers] = useState(false);
  const [pendingItemCustomer, setPendingItemCustomer] = useState<(ItemCustomer & { itemId: string }) | null>(null);
  const pendingNewRowRef = useRef<{ customerKey: string; itemSku: string; customerPartNumber: string } | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === customerKey) || null,
    [customers, customerKey]
  );
  const customerGroups = useMemo(
    () => Array.from(new Set(customers.map((customer: CustomerOption & { customerGroup?: string }) => customer.customerGroup || '').filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [customers]
  );
  const groupScope = Boolean(customerGroup);
  const selectedCustomerGroup =
    lines.find((line) => line.customerGroup)?.customerGroup ||
    (selectedCustomer as (CustomerOption & { customerGroup?: string }) | null)?.customerGroup ||
    '';
  const visibleIdentityColumns = useMemo(
    () => selectedCustomer && !groupScope
      ? IDENTITY_COLUMNS.filter((column) => column.key !== 'customerGroup')
      : IDENTITY_COLUMNS,
    [groupScope, selectedCustomer]
  );
  const monthName = FORECAST_MONTH_FULL_LABELS[selectedMonth];
  const previousMonth = (selectedMonth === 1 ? 12 : selectedMonth - 1) as ForecastMonth;
  const previousMonthName = FORECAST_MONTH_FULL_LABELS[previousMonth];
  const canEditSelectedMonth = forecastMonthIsEditable(year, selectedMonth);
  const canEditSgp = canEditSelectedMonth && !sgpLocked;
  const sgpQty = (line: ForecastLine): MonthQtyMap =>
    line.sgpForecastQty || (sgpLocked ? emptyMonthQtyMap() : line.forecastQty);

  const sortedLines = useMemo(() => {
    const next = [...lines];
    const valueFor = (line: ForecastLine): string | number => {
      const previousForecast = qtyValue(line.forecastQty, previousMonth);
      const previousAdjusted = typedAdjustedMonthQty(line.forecastQty, previousMonth, line.adjustedQty);
      const previousActual = qtyValue(line.actualQty, previousMonth);
      const selectedForecast = qtyValue(line.forecastQty, selectedMonth);
      const selectedAdjusted = typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty);
      const selectedActual = qtyValue(line.actualQty, selectedMonth);
      switch (sortKey) {
        case 'productionType': return line.productionType || '';
        case 'previousSgp': return qtyValue(sgpQty(line), previousMonth);
        case 'previousForecast': return previousForecast;
        case 'previousAdjusted': return previousAdjusted;
        case 'previousActual': return previousActual;
        case 'previousActualVsForecast': return pctVsPlan(previousActual, previousForecast) ?? -Infinity;
        case 'previousActualVsAdjusted': return pctVsPlan(previousActual, previousAdjusted) ?? -Infinity;
        case 'selectedSgp': return qtyValue(sgpQty(line), selectedMonth);
        case 'selectedForecast': return selectedForecast;
        case 'selectedAdjusted': return selectedAdjusted;
        case 'selectedActual': return selectedActual;
        case 'selectedActualVsForecast': return pctVsPlan(selectedActual, selectedForecast) ?? -Infinity;
        case 'selectedActualVsAdjusted': return pctVsPlan(selectedActual, selectedAdjusted) ?? -Infinity;
        default: return line[sortKey] || '';
      }
    };
    next.sort((a, b) => {
      const left = valueFor(a);
      const right = valueFor(b);
      const cmp = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : comparePn(String(left), String(right));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [lines, previousMonth, selectedMonth, sgpLocked, sortDir, sortKey]);
  const filteredLines = useMemo(() => {
    const filter = itemIdFilter.trim().toUpperCase();
    if (!filter) return sortedLines;
    return sortedLines.filter((line) => line.itemSku.trim().toUpperCase() === filter);
  }, [itemIdFilter, sortedLines]);

  const toggleSort = (key: ForecastSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const sortLabel = (key: ForecastSortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

  const mergeCustomers = useCallback((csi: CustomerOption[], forecast: CustomerOption[]) => {
    const byKey = new Map<string, CustomerOption>();
    [...csi, ...forecast].forEach((customer) => {
      const key = customer.key || `${customer.customerId}||${customer.customerName}`;
      const prior = byKey.get(key);
      byKey.set(key, {
        ...prior,
        ...customer,
        key,
        label: customer.label || customer.customerName || customer.customerId || 'Unknown customer',
        lineCount: customer.lineCount ?? prior?.lineCount,
      });
    });
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const loadCsiCustomers = useCallback(async (seq: number) => {
    if (!selectedCompanyId) return;
    try {
      const csiRes = await fetch(
        `/api/operational-data/product-raw?companyId=${encodeURIComponent(selectedCompanyId)}&view=customers`
      );
      const csiJson = await csiRes.json().catch(() => ({}));
      if (seq !== customersRequestSeq.current || !csiRes.ok) return;
      setCustomers((prev) => mergeCustomers(csiJson.customers || [], prev));
    } catch {
      // CSI names are optional; forecast customers are enough to use the page.
    }
  }, [mergeCustomers, selectedCompanyId]);

  const loadCustomers = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    const seq = ++customersRequestSeq.current;
    setLoadingCustomers(true);
    setError(null);
    try {
      const forecastRes = await fetch(
        `/api/operational-data/product-forecast?companyId=${encodeURIComponent(selectedCompanyId)}&year=${nextYear}`
      );
      const forecastJson = await forecastRes.json().catch(() => ({}));
      if (seq !== customersRequestSeq.current) return;
      if (!forecastRes.ok) throw new Error(forecastJson.error || 'Failed to load customers');
      setCustomers(mergeCustomers([], forecastJson.customers || []));
      setCatalogSourceYear(Number(forecastJson.catalogSourceYear) || null);
      setCompanyMonthTotals(null);
      if (forecastJson.dataThru) setDataThru(String(forecastJson.dataThru).slice(0, 10));
      void loadCsiCustomers(seq);
    } catch (err: any) {
      if (seq !== customersRequestSeq.current) return;
      setError(err?.message || 'Failed to load customers');
    } finally {
      if (seq === customersRequestSeq.current) setLoadingCustomers(false);
    }
  }, [loadCsiCustomers, mergeCustomers, selectedCompanyId, year]);

  const loadLines = useCallback(async (customer: CustomerOption | null, group = customerGroup, nextYear = year, options?: { keepDirty?: boolean }) => {
    if (!selectedCompanyId || (!customer && !group)) return;
    setLoadingLines(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
      });
      if (group) params.set('customerGroup', group);
      else if (customer) {
        params.set('customerId', customer.customerId);
        params.set('customerName', customer.customerName);
      }
      const response = await fetch(`/api/operational-data/product-forecast?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load forecast rows');
      const nextLines: ForecastLine[] = Array.isArray(payload.lines) ? payload.lines : [];
      const pendingRow = pendingNewRowRef.current;
      if (pendingRow && !group && customer && pendingRow.customerKey === customer.key) {
        pendingNewRowRef.current = null;
        const itemKey = pendingRow.itemSku.trim().toUpperCase();
        if (!nextLines.some((line) => line.itemSku.trim().toUpperCase() === itemKey)) {
          nextLines.push(
            blankForecastLine(
              customer,
              pendingRow.itemSku,
              pendingRow.customerPartNumber,
              nextLines[0]?.customerGroup || '',
              nextLines.length
            )
          );
          setNotice(`Added Item ID ${pendingRow.itemSku} for ${customer.label}. Enter monthly projections, then Save page.`);
        }
      }
      setLines(nextLines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      if (!options?.keepDirty) setDirty(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load forecast rows');
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [customerGroup, selectedCompanyId, year]);

  useEffect(() => {
    setCustomerKey('');
    setCustomerGroup('');
    setLines([]);
    setDirty(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    setLines([]);
    setDirty(false);
    void loadCustomers();
  }, [selectedCompanyId, year, loadCustomers]);

  useEffect(() => {
    if (!selectedCustomer && !customerGroup) {
      setLines([]);
      setDirty(false);
      return;
    }
    void loadLines(selectedCustomer);
  }, [customerGroup, selectedCustomer?.key, loadLines]);

  const focusRequestId = itemFocusRequest?.requestId;
  const focusItemId = itemFocusRequest?.itemId || '';
  useEffect(() => {
    if (!focusRequestId || !focusItemId || !selectedCompanyId) return;
    let cancelled = false;
    pendingNewRowRef.current = null;
    setPendingItemCustomer(null);
    setCustomerKey('');
    setCustomerGroup('');
    setCustomerIdSearch('');
    setCustomerIdSearchError(null);
    setLines([]);
    setDirty(false);
    setNotice(null);
    setItemCustomers(null);
    setLoadingItemCustomers(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          companyId: selectedCompanyId,
          itemCustomers: '1',
          itemSku: focusItemId,
        });
        const response = await fetch(`/api/operational-data/product-forecast?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.error || 'Failed to find customers for this item');
        const found: ItemCustomer[] = Array.isArray(payload?.customers) ? payload.customers : [];
        setItemCustomers({ itemId: focusItemId, customers: found });
        if (found.length === 1) setPendingItemCustomer({ ...found[0], itemId: focusItemId });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to find customers for this item');
      } finally {
        if (!cancelled) setLoadingItemCustomers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusItemId, focusRequestId, selectedCompanyId]);

  useEffect(() => {
    if (!pendingItemCustomer || loadingCustomers) return;
    const customerId = pendingItemCustomer.customerId.trim();
    const existing = customers.find(
      (customer) => customer.customerId.trim().toLowerCase() === customerId.toLowerCase()
    );
    const name = pendingItemCustomer.customerName || customerId;
    const option: CustomerOption = existing || {
      customerId,
      customerName: name,
      key: `${customerId}||${name}`,
      label: name,
    };
    if (!existing) setCustomers((prev) => mergeCustomers([option], prev));
    pendingNewRowRef.current = {
      customerKey: option.key,
      itemSku: pendingItemCustomer.itemId,
      customerPartNumber: pendingItemCustomer.customerPartNumber,
    };
    setCustomerGroup('');
    setCustomerIdSearch(option.customerId);
    setCustomerIdSearchError(null);
    setCustomerKey(option.key);
    setPendingItemCustomer(null);
  }, [customers, loadingCustomers, mergeCustomers, pendingItemCustomer]);

  const itemCustomersForFilter =
    itemCustomers && itemCustomers.itemId.trim().toUpperCase() === itemIdFilter.trim().toUpperCase()
      ? itemCustomers
      : null;

  const chooseItemCustomer = (candidate: ItemCustomer) => {
    if (!itemCustomersForFilter) return;
    if (dirty && !window.confirm('You have unsaved changes. Switch customer without saving?')) return;
    setDirty(false);
    setPendingItemCustomer({ ...candidate, itemId: itemCustomersForFilter.itemId });
  };

  const addFilteredItemRow = () => {
    const itemSku = itemIdFilter.trim();
    if (!selectedCustomer || groupScope || !itemSku) return;
    const customerPartNumber =
      itemCustomersForFilter?.customers.find(
        (candidate) =>
          candidate.customerId.trim().toLowerCase() === selectedCustomer.customerId.trim().toLowerCase()
      )?.customerPartNumber || '';
    setLines((prev) => [
      ...prev,
      blankForecastLine(selectedCustomer, itemSku, customerPartNumber, prev[0]?.customerGroup || '', prev.length),
    ]);
    markDirty();
  };

  const loadCompanyMonthTotals = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoadingCompanyTotals(true);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(year),
        includeTotals: '1',
      });
      const response = await fetch(`/api/operational-data/product-forecast?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load company trend');
      setCompanyMonthTotals(payload.totals || summarizeForecastQtyMonths([]));
    } catch {
      setCompanyMonthTotals(summarizeForecastQtyMonths([]));
    } finally {
      setLoadingCompanyTotals(false);
    }
  }, [selectedCompanyId, year]);

  const openMonthlyTrend = () => {
    setChartOpen(true);
    if (!selectedCustomer && !companyMonthTotals && !loadingCompanyTotals) {
      void loadCompanyMonthTotals();
    }
  };

  const openItemHistory = async (line: ForecastLine) => {
    if (!selectedCompanyId || !selectedCustomer) return;
    setHistoryLine(line);
    setItemHistory([]);
    setItemHistoryError(null);
    setLoadingItemHistory(true);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        customerId: selectedCustomer.customerId,
        customerName: selectedCustomer.customerName,
        itemSku: line.itemSku,
        customerPartNumber: line.customerPartNumber,
        historyMonths: '36',
      });
      const response = await fetch(`/api/operational-data/product-forecast?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Failed to load item history');
      setItemHistory(Array.isArray(payload?.rows) ? payload.rows : []);
    } catch (loadError: any) {
      setItemHistoryError(loadError?.message || 'Failed to load item history');
    } finally {
      setLoadingItemHistory(false);
    }
  };

  useEffect(() => {
    if (!chartOpen || selectedCustomer || companyMonthTotals || loadingCompanyTotals) return;
    void loadCompanyMonthTotals();
  }, [chartOpen, companyMonthTotals, loadCompanyMonthTotals, loadingCompanyTotals, selectedCustomer]);

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
  };

  const updateLine = (id: string, patch: Partial<ForecastLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    markDirty();
  };

  const updateCustomerGroup = (customerGroup: string) => {
    setLines((prev) => prev.map((line) => ({ ...line, customerGroup })));
    markDirty();
  };

  const updateMonthQty = (
    id: string,
    field: 'forecastQty' | 'sgpForecastQty',
    month: ForecastMonth,
    raw: string
  ) => {
    if (!forecastMonthIsEditable(year, month)) return;
    if (field === 'sgpForecastQty' && sgpLocked) return;
    const parsed = raw === '' ? 0 : Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const current =
          field === 'sgpForecastQty'
            ? line.sgpForecastQty || line.forecastQty || emptyMonthQtyMap()
            : line.forecastQty || emptyMonthQtyMap();
        return { ...line, [field]: { ...current, [String(month)]: value } };
      })
    );
    markDirty();
  };

  const handleCustomerChange = (nextKey: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch customer without saving?')) return;
    setCustomerKey(nextKey);
  };

  const handleGroupChange = (nextGroup: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch group without saving?')) return;
    setCustomerGroup(nextGroup);
  };

  const handleCustomerIdSearchChange = (nextCustomerId: string) => {
    setCustomerIdSearch(nextCustomerId);
    const matchingCustomer = customers.find(
      (customer) => customer.customerId.trim().toLowerCase() === nextCustomerId.trim().toLowerCase()
    );
    if (matchingCustomer) {
      setCustomerIdSearchError(null);
      if (matchingCustomer.key !== customerKey) handleCustomerChange(matchingCustomer.key);
    } else if (!nextCustomerId.trim()) {
      setCustomerIdSearchError(null);
    } else if (customers.length > 0) {
      setCustomerIdSearchError('No matching customer ID.');
      if (customerKey) handleCustomerChange('');
      setCustomerGroup('');
    }
  };

  useEffect(() => {
    if (dirty) return;
    const matchingCustomer = customers.find(
      (customer) => customer.customerId.trim().toLowerCase() === customerIdSearch.trim().toLowerCase()
    );
    if (customerIdSearch.trim() && matchingCustomer && matchingCustomer.key !== customerKey) {
      setCustomerKey(matchingCustomer.key);
    }
  }, [customerIdSearch, customerKey, customers, dirty]);

  const handleYearChange = (nextYear: number) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch year without saving?')) return;
    setYear(nextYear);
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !selectedCustomer || groupScope) return;
    if (lines.some((line) => !String(line.itemSku || '').trim())) {
      setError('Every row needs an APR P/N before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/product-forecast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          dataThru: dataThru || null,
          customerId: selectedCustomer.customerId,
          customerName: selectedCustomer.customerName,
          lines: lines.map((line) => ({
            ...line,
            customerName: selectedCustomer.customerName,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      setLines(Array.isArray(payload.lines) ? payload.lines : lines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      const savedCount = Array.isArray(payload.lines) ? payload.lines.length : lines.length;
      setNotice(`Saved ${savedCount} rows for ${selectedCustomer.label}.`);
      setCompanyMonthTotals(null);
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.key === selectedCustomer.key ? { ...customer, lineCount: savedCount } : customer
        )
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to save monthly forecast');
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => {
    const ytdMonths = FORECAST_MONTHS.filter((month) => month <= selectedMonth);
    const thru = dataThru || null;
    return lines.reduce(
      (acc, line) => {
        acc.remaining += remainingForecastQty(line.forecastQty, thru);
        acc.monthForecast += qtyValue(line.forecastQty, selectedMonth);
        acc.monthAdjusted += typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty);
        acc.monthActual += qtyValue(line.actualQty, selectedMonth);
        acc.ytdForecast += monthQtyTotal(line.forecastQty, ytdMonths);
        acc.ytdAdjusted += ytdMonths.reduce(
          (sum, month) => sum + typedAdjustedMonthQty(line.forecastQty, month, line.adjustedQty),
          0
        );
        acc.ytdActual += monthQtyTotal(line.actualQty, ytdMonths);
        return acc;
      },
      {
        remaining: 0,
        monthForecast: 0,
        monthAdjusted: 0,
        monthActual: 0,
        ytdForecast: 0,
        ytdAdjusted: 0,
        ytdActual: 0,
      }
    );
  }, [dataThru, lines, selectedMonth]);

  const trendRows = useMemo(
    () =>
      buildProductMonthlyTrendRows(
        selectedCustomer || groupScope ? summarizeForecastQtyMonths(lines) : companyMonthTotals || summarizeForecastQtyMonths([]),
        year
      ),
    [companyMonthTotals, groupScope, lines, selectedCustomer, year]
  );
  const trendScopeLabel = groupScope ? `Group: ${customerGroup}` : selectedCustomer ? selectedCustomer.label : 'All customers';

  const monthHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 2px',
    color: '#3730a3',
    background: MONTH_COL_HEADER_BG,
    whiteSpace: 'normal',
    lineHeight: 1.15,
    minWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const monthCellStyle: React.CSSProperties = {
    padding: '6px 2px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
    color: '#312e81',
    minWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
  };
  const monthInputCellStyle: React.CSSProperties = {
    padding: 2,
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
    minWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
  };
  const monthQtyInputStyle: React.CSSProperties = {
    ...qtyInputStyle,
    background: '#f5f7ff',
    borderColor: '#c7d2fe',
  };
  const priorHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 2px',
    color: '#475569',
    background: '#f8fafc',
    whiteSpace: 'normal',
    lineHeight: 1.15,
    minWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const priorCellStyle: React.CSSProperties = {
    padding: '6px 2px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#475569',
    minWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
  };

  const shiftMonth = (delta: number) => {
    const next = ((((selectedMonth - 1 + delta) % 12) + 12) % 12) + 1;
    setSelectedMonth(next as ForecastMonth);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Volume Forecast</h3>
        {onOpenInfo ? (
          <button
            type="button"
            onClick={onOpenInfo}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0 2px',
              color: '#2563eb',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            What is this?
          </button>
        ) : null}
        <button
          type="button"
          onClick={openMonthlyTrend}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '0 2px',
            color: '#2563eb',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          Monthly trend
        </button>
      </div>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
        Monthly unit forecast vs actual by APR P/N and customer. Select a customer, fill Group / TEAM / CSR on each row, enter Planned or MTO and monthly quantities, then save this page.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer ID
          <input
            type="search"
            value={customerIdSearch}
            onChange={(event) => handleCustomerIdSearchChange(event.target.value)}
            placeholder="Search customer ID"
            style={{ ...inputStyle, width: 180 }}
          />
          {customerIdSearchError && <span style={{ color: '#b91c1c', fontSize: 11, fontWeight: 600 }}>{customerIdSearchError}</span>}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer Name
          <select
            value={customerKey}
            onChange={(event) => handleCustomerChange(event.target.value)}
            disabled={loadingCustomers && customers.length === 0}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">
              {loadingCustomers && customers.length === 0 ? 'Loading customers…' : 'Select a customer'}
            </option>
            {customers.map((customer) => (
              <option key={customer.key} value={customer.key}>
                {customer.label}{customer.lineCount ? ` (${customer.lineCount})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Item ID
          <input
            type="search"
            value={itemIdFilter}
            onChange={(event) => onItemIdFilterChange?.(event.target.value)}
            placeholder="All items"
            style={{ ...inputStyle, width: 180 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Group Name
          <select
            value={customerGroup}
            onChange={(event) => handleGroupChange(event.target.value)}
            disabled={loadingCustomers && customers.length === 0}
            style={{ ...inputStyle, minWidth: 220 }}
          >
            <option value="">Select a group</option>
            {customerGroups.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Year
          <select
            value={year}
            onChange={(event) => handleYearChange(Number(event.target.value))}
            style={{ ...inputStyle, width: 108 }}
          >
            {yearOptions().map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Data thru
          <input
            type="date"
            value={dataThru}
            onChange={(event) => {
              setDataThru(event.target.value);
              markDirty();
            }}
            disabled={groupScope}
            style={{ ...inputStyle, width: 150 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Month
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                width: 28,
                height: 30,
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value) as ForecastMonth)}
              style={{ ...inputStyle, width: 132 }}
            >
              {FORECAST_MONTHS.map((month) => (
                <option key={month} value={month}>{FORECAST_MONTH_FULL_LABELS[month]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                width: 28,
                height: 30,
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </span>
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!selectedCustomer || groupScope || saving || !dirty}
          style={{
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '8px 14px',
            background: !selectedCustomer || groupScope || saving || !dirty ? '#c7d2fe' : '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            cursor: !selectedCustomer || groupScope || saving || !dirty ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save page' : 'Saved'}
        </button>
      </div>

      {selectedCompanyId ? (
        <SgpBudgetLockBar companyId={selectedCompanyId} year={year} onLockChange={handleSgpLockChange} />
      ) : null}
      {loadingCustomers && customers.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading customers…</div>
      )}
      {catalogSourceYear && catalogSourceYear !== year && (
        <div style={{ color: '#1e3a8a', fontSize: 13, marginBottom: 8 }}>
          {`Showing ${catalogSourceYear} items for ${year}. Monthly quantities start blank so you can enter this year’s projections.`}
        </div>
      )}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}
      {loadingItemCustomers && focusItemId && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>
          Finding the customer for Item ID {focusItemId}…
        </div>
      )}
      {!loadingItemCustomers && itemCustomersForFilter && itemCustomersForFilter.customers.length === 0 && (
        <div style={{ color: '#1e3a8a', fontSize: 13, marginBottom: 8 }}>
          {`Item ID ${itemCustomersForFilter.itemId} is not linked to a customer yet (no orders, invoices, saved forecast, or Infor customer item). Select the customer, then use Add Item ID ${itemCustomersForFilter.itemId}.`}
        </div>
      )}
      {!loadingItemCustomers && itemCustomersForFilter && itemCustomersForFilter.customers.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', color: '#1e3a8a', fontSize: 13, marginBottom: 8 }}>
          <span>{`Item ID ${itemCustomersForFilter.itemId} is linked to ${itemCustomersForFilter.customers.length} customers. Choose one:`}</span>
          {itemCustomersForFilter.customers.map((candidate) => {
            const known = customers.find(
              (customer) => customer.customerId.trim().toLowerCase() === candidate.customerId.trim().toLowerCase()
            );
            const name = known?.label || candidate.customerName || candidate.customerId;
            return (
              <button
                key={`${candidate.customerId}||${candidate.customerPartNumber}`}
                type="button"
                onClick={() => chooseItemCustomer(candidate)}
                style={{
                  border: '1px solid #c7d2fe',
                  borderRadius: 5,
                  background: '#eef2ff',
                  color: '#4338ca',
                  padding: '4px 8px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {`${name} (${candidate.customerId})${candidate.customerPartNumber ? ` · Customer P/N ${candidate.customerPartNumber}` : ''}`}
              </button>
            );
          })}
        </div>
      )}

      {!selectedCustomer && !groupScope ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          Select a customer or group first. You can then type Group / TEAM / CSR on each row, enter
          Planned or MTO and monthly quantities, and save. Import the workbook once to load all customers.
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              color: '#334155',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{monthName} YTD DATA</span>
              <span><strong>Forecasted YTD:</strong> {fmtQty(totals.ytdForecast)}</span>
              <span><strong>Forecast - Adjusted YTD:</strong> {fmtQty(totals.ytdAdjusted)}</span>
              <span><strong>Actual YTD:</strong> {fmtQty(totals.ytdActual)}</span>
              <span>
                <strong>Actual YTD vs. Forecasted YTD:</strong>{' '}
                {fmtPct(pctVsPlan(totals.ytdActual, totals.ytdForecast))}
              </span>
              <span>
                <strong>Actual YTD vs Forecast - Adjusted YTD:</strong>{' '}
                {fmtPct(pctVsPlan(totals.ytdActual, totals.ytdAdjusted))}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{monthName}</span>
              <span><strong>Forecasted {monthName}:</strong> {fmtQty(totals.monthForecast)}</span>
              <span><strong>{monthName} Forecast - ADJUSTED:</strong> {fmtQty(totals.monthAdjusted)}</span>
              <span><strong>{monthName} Actual:</strong> {fmtQty(totals.monthActual)}</span>
              <span>
                <strong>% {monthName} Actual vs. Forecasted:</strong>{' '}
                {fmtPct(pctVsPlan(totals.monthActual, totals.monthForecast))}
              </span>
              <span>
                <strong>% {monthName} Actual vs Adj. Forecast:</strong>{' '}
                {fmtPct(pctVsPlan(totals.monthActual, totals.monthAdjusted))}
              </span>
              <span><strong>Remaining-year forecast:</strong> {fmtQty(totals.remaining)}</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '10px 12px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
                position: 'sticky',
                left: 0,
                zIndex: 5,
              }}
            >
              <div style={{ fontSize: 16.25, fontWeight: 600, color: '#0f172a' }}>{groupScope ? 'Group' : 'Customer'}</div>
              <div
                title={groupScope ? customerGroup : selectedCustomer?.label}
                style={{
                  fontSize: groupScope ? 13 : 16.25,
                  color: '#0f172a',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {groupScope ? `Group: ${customerGroup}` : selectedCustomer?.label}
              </div>
              {!groupScope && selectedCustomer?.customerId ? (
                <div style={{ fontSize: 16.25, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <strong>Customer ID:</strong> {selectedCustomer.customerId}
                </div>
              ) : null}
              {!groupScope && selectedCustomerGroup ? (
                <div style={{ fontSize: 16.25, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <strong>Group Name:</strong> {selectedCustomerGroup}
                </div>
              ) : null}
            </div>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: visibleIdentityColumns.reduce((sum, column) => sum + columnWidthPx(column.widthCh), 0) + columnWidthPx(PLANNED_COL_CH) + MONTH_METRIC_COL_COUNT * MONTH_METRIC_COL_PX, fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                {visibleIdentityColumns.map((column) => (
                  <col key={column.key} style={{ width: columnWidth(column.widthCh) }} />
                ))}
                <col style={{ width: columnWidth(PLANNED_COL_CH) }} />
                {Array.from({ length: MONTH_METRIC_COL_COUNT }, (_, index) => (
                  <col key={`metric-${index}`} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {visibleIdentityColumns.map((column, index) => (
                    <th
                      key={column.key}
                      title={column.sortable ? `Sort by ${column.label}` : column.label}
                      align="left"
                      onClick={column.sortable ? () => toggleSort(column.key as IdentitySortKey) : undefined}
                      style={{
                        ...stickyIdentityStyle(index, true, visibleIdentityColumns),
                        textAlign: 'left',
                        paddingTop: 8,
                        paddingBottom: 8,
                        color: '#334155',
                        cursor: column.sortable ? 'pointer' : undefined,
                        userSelect: column.sortable ? 'none' : undefined,
                      }}
                    >
                      {column.label}
                      {column.sortable ? sortLabel(column.key as IdentitySortKey) : ''}
                    </th>
                  ))}
                  {[
                    { key: 'planned', label: <>Planned<br />MTO</>, widthCh: 6 },
                  ].map((column) => (
                    <th
                      key={column.key}
                      title="Sort by Planned / MTO"
                      onClick={() => toggleSort('productionType')}
                      aria-sort={sortKey === 'productionType' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{
                        textAlign: 'right',
                        padding: '8px 4px',
                        whiteSpace: 'normal',
                        lineHeight: 1.2,
                        width: column.widthCh ? columnWidth(column.widthCh) : undefined,
                        minWidth: column.widthCh ? columnWidth(column.widthCh) : 64,
                        maxWidth: column.widthCh ? columnWidth(column.widthCh) : 76,
                        color: '#334155',
                        background: '#f8fafc',
                        verticalAlign: 'bottom',
                        fontSize: 11,
                        fontWeight: 700,
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {column.label}{sortLabel('productionType')}
                    </th>
                  ))}
                  <th title={`Sort by SGP Forecast ${previousMonthName}`} onClick={() => toggleSort('previousSgp')} aria-sort={sortKey === 'previousSgp' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>{sgpLocked ? '🔒 ' : ''}SGP Forecast<br />{previousMonthName}<br />{sortLabel('previousSgp')}</th>
                  <th title={`Sort by Forecasted ${previousMonthName}`} onClick={() => toggleSort('previousForecast')} aria-sort={sortKey === 'previousForecast' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>Forecasted<br />{previousMonthName}<br />{sortLabel('previousForecast')}</th>
                  <th title={`Sort by ${previousMonthName} Forecast - Adjusted`} onClick={() => toggleSort('previousAdjusted')} aria-sort={sortKey === 'previousAdjusted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{previousMonthName}<br />Forecast -<br />ADJUSTED {sortLabel('previousAdjusted')}</th>
                  <th title={`Sort by ${previousMonthName} Actual`} onClick={() => toggleSort('previousActual')} aria-sort={sortKey === 'previousActual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{previousMonthName}<br />Actual<br />{sortLabel('previousActual')}</th>
                  <th title={`Sort by ${previousMonthName} Actual vs Forecasted`} onClick={() => toggleSort('previousActualVsForecast')} aria-sort={sortKey === 'previousActualVsForecast' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>% {previousMonthName} Actual<br />vs<br />Forecasted {sortLabel('previousActualVsForecast')}</th>
                  <th title={`Sort by ${previousMonthName} Actual vs Adjusted Forecast`} onClick={() => toggleSort('previousActualVsAdjusted')} aria-sort={sortKey === 'previousActualVsAdjusted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>% {previousMonthName} Actual<br />vs Adj.<br />Forecast {sortLabel('previousActualVsAdjusted')}</th>
                  <th title={`Sort by SGP Forecast ${monthName}`} onClick={() => toggleSort('selectedSgp')} aria-sort={sortKey === 'selectedSgp' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe', cursor: 'pointer', userSelect: 'none' }}>{sgpLocked ? '🔒 ' : ''}SGP Forecast<br />{monthName}<br />{sortLabel('selectedSgp')}</th>
                  <th title={`Sort by Forecasted ${monthName}`} onClick={() => toggleSort('selectedForecast')} aria-sort={sortKey === 'selectedForecast' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>Forecasted<br />{monthName}<br />{sortLabel('selectedForecast')}</th>
                  <th title={`Sort by ${monthName} Forecast - Adjusted`} onClick={() => toggleSort('selectedAdjusted')} aria-sort={sortKey === 'selectedAdjusted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{monthName}<br />Forecast -<br />ADJUSTED {sortLabel('selectedAdjusted')}</th>
                  <th title={`Sort by ${monthName} Actual`} onClick={() => toggleSort('selectedActual')} aria-sort={sortKey === 'selectedActual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{monthName}<br />Actual<br />{sortLabel('selectedActual')}</th>
                  <th title={`Sort by ${monthName} Actual vs Forecasted`} onClick={() => toggleSort('selectedActualVsForecast')} aria-sort={sortKey === 'selectedActualVsForecast' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>% {monthName} Actual<br />vs<br />Forecasted {sortLabel('selectedActualVsForecast')}</th>
                  <th title={`Sort by ${monthName} Actual vs Adjusted Forecast`} onClick={() => toggleSort('selectedActualVsAdjusted')} aria-sort={sortKey === 'selectedActualVsAdjusted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>% {monthName} Actual<br />vs Adj.<br />Forecast {sortLabel('selectedActualVsAdjusted')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => {
                  return (
                    <tr key={line.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      {visibleIdentityColumns.map((column, index) => (
                        <td
                          key={column.key}
                          title={line[column.key] || undefined}
                          style={{
                            ...stickyIdentityStyle(index, false, visibleIdentityColumns),
                            paddingTop: 6,
                            paddingBottom: 6,
                            borderTop: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              value={line[column.key]}
                              title={line[column.key] || undefined}
                              readOnly={column.readOnly || groupScope}
                              onChange={
                                column.readOnly || groupScope
                                  ? undefined
                                  : column.key === 'customerGroup'
                                    ? (event) => updateCustomerGroup(event.target.value)
                                    : (event) => updateLine(line.id, { [column.key]: event.target.value })
                              }
                              style={{
                                ...identityInputStyle,
                                minWidth: 0,
                                padding: column.compact ? '5px 4px' : identityInputStyle.padding,
                                ...(column.readOnly || groupScope ? { background: '#f8fafc', color: '#475569', cursor: 'default' } : {}),
                              }}
                            />
                            {column.key === 'itemSku' && selectedCustomer && !groupScope ? (
                              <button
                                type="button"
                                onClick={() => void openItemHistory(line)}
                                title={`View 36-month Forecast and Actual history for ${line.itemSku}`}
                                style={{
                                  flex: '0 0 auto',
                                  border: '1px solid #c7d2fe',
                                  borderRadius: 5,
                                  background: '#eef2ff',
                                  color: '#4338ca',
                                  padding: '4px 5px',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                History
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ))}
                      <td
                        style={{
                          padding: 4,
                          borderTop: '1px solid #e2e8f0',
                          width: columnWidth(6),
                          minWidth: columnWidth(6),
                          maxWidth: columnWidth(6),
                          boxSizing: 'border-box',
                        }}
                      >
                        <select
                          value={line.productionType}
                          onChange={(event) => updateLine(line.id, { productionType: event.target.value })}
                          disabled={groupScope}
                          style={{ ...inputStyle, padding: '5px 2px' }}
                        >
                          <option value="" />
                          {PRODUCTION_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...priorCellStyle, borderLeft: '1px solid #e2e8f0' }}>
                        {fmtQty(qtyValue(sgpQty(line), previousMonth))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtQty(qtyValue(line.forecastQty, previousMonth))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtQty(typedAdjustedMonthQty(line.forecastQty, previousMonth, line.adjustedQty))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtQty(qtyValue(line.actualQty, previousMonth))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, previousMonth),
                          qtyValue(line.forecastQty, previousMonth)
                        ))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, previousMonth),
                          typedAdjustedMonthQty(line.forecastQty, previousMonth, line.adjustedQty)
                        ))}
                      </td>
                      {canEditSgp && !groupScope ? (
                        <td style={{ ...monthInputCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                          <input
                            type="number"
                            value={qtyValue(sgpQty(line), selectedMonth)}
                            onChange={(event) => updateMonthQty(line.id, 'sgpForecastQty', selectedMonth, event.target.value)}
                            style={monthQtyInputStyle}
                            aria-label={`SGP Forecast ${monthName}`}
                          />
                        </td>
                      ) : (
                        <td style={{ ...monthCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                          {fmtQty(qtyValue(sgpQty(line), selectedMonth))}
                        </td>
                      )}
                      {canEditSelectedMonth && !groupScope ? (
                        <td style={monthInputCellStyle}>
                          <input
                            type="number"
                            value={qtyValue(line.forecastQty, selectedMonth)}
                            onChange={(event) => updateMonthQty(line.id, 'forecastQty', selectedMonth, event.target.value)}
                            style={monthQtyInputStyle}
                            aria-label={`Forecasted ${monthName}`}
                          />
                        </td>
                      ) : (
                        <td style={monthCellStyle}>
                          {fmtQty(qtyValue(line.forecastQty, selectedMonth))}
                        </td>
                      )}
                      <td style={monthCellStyle}>
                        {fmtQty(typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty))}
                      </td>
                      <td style={monthCellStyle}>
                        {fmtQty(qtyValue(line.actualQty, selectedMonth))}
                      </td>
                      <td style={monthCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, selectedMonth),
                          qtyValue(line.forecastQty, selectedMonth)
                        ))}
                      </td>
                      <td style={monthCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, selectedMonth),
                          typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty)
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={visibleIdentityColumns.length + 13} style={{ padding: 16, color: '#64748b' }}>
                      {itemIdFilter
                        ? `No forecast rows match Item ID ${itemIdFilter}.`
                        : `No forecast rows for this ${groupScope ? 'group' : 'customer'} yet. Import the workbook to load customers and parts, then save.`}
                      {itemIdFilter.trim() && selectedCustomer && !groupScope ? (
                        <button
                          type="button"
                          onClick={addFilteredItemRow}
                          style={{
                            marginLeft: 10,
                            border: '1px solid #c7d2fe',
                            borderRadius: 5,
                            background: '#eef2ff',
                            color: '#4338ca',
                            padding: '4px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {`Add Item ID ${itemIdFilter.trim()}`}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ProductMonthlyTrendChartModal
        open={chartOpen}
        onClose={() => setChartOpen(false)}
        title={`Volume Forecast trend · ${year}`}
        subtitle={`${trendScopeLabel}. Units by month: Forecast, Forecast - ADJ, and Actual.`}
        unit="qty"
        rows={trendRows}
        loading={!selectedCustomer && !groupScope && (loadingCompanyTotals || !companyMonthTotals)}
      />
      <ProductMonthlyTrendChartModal
        open={Boolean(historyLine)}
        onClose={() => setHistoryLine(null)}
        title={`36-Month History · ${historyLine?.itemSku || ''}`}
        subtitle={[
          selectedCustomer?.label,
          historyLine?.customerPartNumber ? `Customer P/N: ${historyLine.customerPartNumber}` : null,
          'Forecast and Actual units by month.',
        ].filter(Boolean).join(' · ')}
        unit="qty"
        rows={itemHistory.map((point) => ({
          month: point.month,
          forecast: point.forecast,
          forecastAdj: 0,
          actual: point.actual,
        }))}
        loading={loadingItemHistory}
        error={itemHistoryError}
        showAdjusted={false}
        showValuesTable
      />
    </div>
  );
}
