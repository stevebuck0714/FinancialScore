"use client";

import React from "react";
import { exportDataReviewToExcel } from "../../utils/excel-export";
import type { MonthlyDataRow, Mappings } from "../../types";
import { useAllMasterData } from "@/lib/master-data-store";
import { getFieldDisplayName } from "@/lib/constants/field-display-names";
import { getTargetFieldOptions } from "@/lib/constants/sector-target-fields";
import { useCompanyMoneyFormatter } from "@/app/hooks/useCompanyMoneyFormatter";
import { currentMonthKeyUtc } from "@/lib/date-utils";

interface DataReviewTabProps {
  selectedCompanyId: string;
  companyName: string;
  accountMappings: Mappings[];
  industrySectorCategory?: string | null;
}

export default function DataReviewTab({ selectedCompanyId, companyName, accountMappings, industrySectorCategory }: DataReviewTabProps) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const fmtMoney = (value: number) => money.fmt(Number(value || 0), 0);
  const fmtSigned = (value: number) => money.fmtSigned(Number(value || 0), 0);
  // Data Review shows imported closed months. In-progress MTD months stay
  // hidden until that month's end books are imported.
  const { monthlyData, loading: masterDataLoading, error: masterDataError } = useAllMasterData(selectedCompanyId);

  const getMonthKey = (monthValue: unknown): string | null => {
    if (monthValue instanceof Date && !Number.isNaN(monthValue.getTime())) {
      return `${monthValue.getUTCFullYear()}-${String(monthValue.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    const raw = String(monthValue || "").trim();
    if (!raw) return null;
    const yyyymmMatch = raw.match(/^(\d{4})-(\d{2})/);
    if (yyyymmMatch) return `${yyyymmMatch[1]}-${yyyymmMatch[2]}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const monthKeyToSortValue = (monthKey: string | null): number => {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return Number.MIN_SAFE_INTEGER;
    const [year, month] = monthKey.split("-").map((x) => Number(x));
    return year * 100 + month;
  };

  // Use master data as monthly data, enforce stable chronological ordering, then
  // display only the latest 36 months with newest month first.
  const { monthly, totalMonths } = React.useMemo(() => {
    const rows = Array.isArray(monthlyData) ? [...monthlyData] : [];
    rows.sort((a, b) => {
      const aKey = getMonthKey(a?.month ?? a?.date);
      const bKey = getMonthKey(b?.month ?? b?.date);
      return monthKeyToSortValue(aKey) - monthKeyToSortValue(bKey);
    });
    const currentMonthKey = currentMonthKeyUtc();
    const closedMonthRows = rows.filter((row: any) => {
      const key = getMonthKey(row?.month ?? row?.date);
      return !key || key !== currentMonthKey;
    });
    return {
      monthly: closedMonthRows.slice(-36).reverse(),
      totalMonths: closedMonthRows.length,
    };
  }, [monthlyData]);
  const displayedMonths = monthly;
  const [statementView, setStatementView] = React.useState<'income' | 'balance'>('income');
  const allowedBalanceSheetFields = React.useMemo(() => {
    const targetOptions = getTargetFieldOptions(industrySectorCategory || undefined);
    return new Set([
      ...targetOptions.asset.map((option) => option.value),
      ...targetOptions.liability.map((option) => option.value),
      ...targetOptions.equity.map((option) => option.value),
    ]);
  }, [industrySectorCategory]);

  const renderBalanceSheetLine = (field: keyof MonthlyDataRow | string, label: string, paddingLeft = "20px") => {
    if (!allowedBalanceSheetFields.has(String(field))) return null;
    const values = monthly.slice(-36).map((m: any) => Number(m?.[field] || 0));
    if (!values.some((value) => value !== 0)) return null;

    return (
      <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
        <td
          style={{
            padding: "8px 10px",
            paddingLeft,
            position: "sticky",
            left: 0,
            background: "white",
            zIndex: 1,
          }}
        >
          {label}
        </td>
        {values.map((value: number, idx: number) => (
          <td
            key={idx}
            style={{
              padding: "8px 10px",
              textAlign: "right",
              fontFamily: "monospace",
            }}
          >
            {fmtMoney(value)}
          </td>
        ))}
      </tr>
    );
  };

  // Check if master data exists
  if (masterDataLoading) {
    return (
      <div style={{ maxWidth: "100%", marginTop: "-52px", padding: "8px 32px 32px", overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "#1e293b", marginBottom: "8px" }}>
              Loading Data Review
            </div>
            <p style={{ fontSize: "14px", color: "#64748b" }}>
              Loading financial data from master data store...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (masterDataError || !monthlyData || monthlyData.length === 0) {
    return (
      <div style={{ maxWidth: "100%", marginTop: "-52px", padding: "8px 32px 32px", overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "#1e293b", marginBottom: "8px" }}>
              No Data Available
            </div>
            <p style={{ fontSize: "14px", color: "#64748b" }}>
              {masterDataError ? `Error: ${masterDataError}` : 'No master data available for data review.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatDynamicFieldLabel = (field: string): string => {
    return getFieldDisplayName(field);
  };

  const hasNonZeroValue = (field: string): boolean =>
    displayedMonths.some((m: any) => Number(m[field] || 0) !== 0);

  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const getNonOperatingIncome = (month: any): number =>
    toNumber(
      month?.nonOperatingIncome ??
        month?.nonOpertingIncome ??
        month?.non_operating_income ??
        month?.expenseBreakdown?.nonOperatingIncome ??
        month?.expenseBreakdown?.nonOpertingIncome,
    );

  const getNonOperatingExpense = (month: any): number =>
    toNumber(
      month?.nonOperatingExpense ??
        month?.nonOpertingExpense ??
        month?.non_operating_expense ??
        month?.expenseBreakdown?.nonOperatingExpense ??
        month?.expenseBreakdown?.nonOpertingExpense,
    );

  const getDynamicFieldValue = (month: any, field: string): number => {
    const direct = Number(month?.[field] || 0);
    if (direct !== 0) return direct;
    if (field.startsWith("rev_")) return Number(month?.revenueBreakdown?.[field] || 0);
    if (field.startsWith("cogs_")) return Number(month?.cogsBreakdown?.[field] || 0);
    return 0;
  };

  const getDynamicFieldsForPrefix = (month: any, prefix: "rev_" | "cogs_"): string[] => {
    const directKeys = Object.keys(month || {}).filter((key) => key.startsWith(prefix));
    const breakdown =
      prefix === "rev_"
        ? (month?.revenueBreakdown && typeof month.revenueBreakdown === "object" ? month.revenueBreakdown : {})
        : (month?.cogsBreakdown && typeof month.cogsBreakdown === "object" ? month.cogsBreakdown : {});
    const breakdownKeys = Object.keys(breakdown || {}).filter((key) => key.startsWith(prefix));
    return Array.from(new Set([...directKeys, ...breakdownKeys]));
  };

  const sectorRevenueFields = Array.from(
    new Set(
      displayedMonths.flatMap((m: any) =>
        getDynamicFieldsForPrefix(m, "rev_").filter((key) => getDynamicFieldValue(m, key) !== 0),
      ),
    ),
  ).sort((a, b) => formatDynamicFieldLabel(a).localeCompare(formatDynamicFieldLabel(b)));

  const sectorCogsFields = Array.from(
    new Set(
      displayedMonths.flatMap((m: any) =>
        getDynamicFieldsForPrefix(m, "cogs_").filter(
          (key) => key !== "cogs_total" && getDynamicFieldValue(m, key) !== 0,
        ),
      ),
    ),
  ).sort((a, b) => formatDynamicFieldLabel(a).localeCompare(formatDynamicFieldLabel(b)));
  // Revenue/COGS detail rows are always sector-aware dynamic mappings.
  const cogsDetailFields = sectorCogsFields;

  // Format month as MM-YYYY
  const formatMonth = (monthValue: any): string => {
    if (!monthValue) return '';

    const monthKey = getMonthKey(monthValue);
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      const [year, month] = monthKey.split("-");
      return `${month}-${year}`;
    }
    return String(monthValue);
  };

  return (
    <div style={{ maxWidth: "100%", marginTop: "-52px", padding: "8px 32px 32px", overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "16px",
          marginBottom: "4px",
        }}
      >
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "700",
            color: "#1e293b",
            margin: 0,
          }}
        >
          📊 Data Review - Financial Data
        </h1>
        {monthly && monthly.length > 0 && (
          <div style={{ fontSize: "14px", color: "#64748b", whiteSpace: "nowrap" }}>
            Total months: {totalMonths} | Displaying: Last {Math.min(36, totalMonths)} months
          </div>
        )}
      </div>
      {/* Intentionally omit company name + export button + helper text to reduce clutter */}

      {(!monthly || monthly.length === 0) && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "20px",
            color: "#991b1b",
          }}
        >
          <strong>No financial data found.</strong>
          <p style={{ marginTop: "8px", marginBottom: 0 }}>
            Please upload financial data in the Excel Import tab or sync from
            QuickBooks in the Accounting API Connections tab.
          </p>
        </div>
      )}

      {monthly && monthly.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "0",
              borderBottom: "2px solid #e2e8f0",
            }}
          >
            <button
              type="button"
              onClick={() => setStatementView("income")}
              style={{
                padding: "10px 20px",
                background: "none",
                color: statementView === "income" ? "#2751d0" : "#64748b",
                border: "none",
                borderBottom: statementView === "income" ? "3px solid #2751d0" : "3px solid transparent",
                marginBottom: "-2px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Income Statement (Last 36 Months)
            </button>
            <button
              type="button"
              onClick={() => setStatementView("balance")}
              style={{
                padding: "10px 20px",
                background: "none",
                color: statementView === "balance" ? "#2751d0" : "#64748b",
                border: "none",
                borderBottom: statementView === "balance" ? "3px solid #2751d0" : "3px solid transparent",
                marginBottom: "-2px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Balance Sheet (Last 36 Months)
            </button>
          </div>

          {statementView === "income" && (
          <div
            style={{
              background: "white",
              borderRadius: "0 0 12px 12px",
              padding: "16px 24px 24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        fontWeight: "600",
                        position: "sticky",
                        left: 0,
                        background: "#f8fafc",
                        zIndex: 1,
                        minWidth: "150px",
                      }}
                    >
                      Item
                    </th>
                    {displayedMonths.map((m: any, idx: number) => (
                      <th
                        key={idx}
                        style={{
                          padding: "10px",
                          textAlign: "right",
                          fontWeight: "600",
                          minWidth: "90px",
                        }}
                      >
                        {formatMonth(m.month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Total Revenue */}
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#f0fdf4",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#f0fdf4",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('revenue')}
                    </td>
                    {displayedMonths.map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                        }}
                      >
                        {fmtMoney((m.revenue || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Revenue Detail (sector-specific mapped categories) */}
                  {sectorRevenueFields.map((field) => (
                    <tr key={field} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "8px 10px",
                          paddingLeft: "20px",
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 1,
                        }}
                      >
                        {formatDynamicFieldLabel(field)}
                      </td>
                      {displayedMonths.map((m: any, idx: number) => (
                        <td
                          key={idx}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                          }}
                        >
                          {fmtMoney(getDynamicFieldValue(m, field))}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* COGS Detail */}
                  <tr
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#fef3c7",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#fef3c7",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('costOfGoodsSold')}
                    </td>
                    {displayedMonths.map((m: any, idx: number) => (
                      <td key={idx} style={{ padding: "8px 10px" }}></td>
                    ))}
                  </tr>
                  {cogsDetailFields.map((field) => (
                    <tr key={field} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "8px 10px",
                          paddingLeft: "20px",
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 1,
                        }}
                      >
                        {formatDynamicFieldLabel(field)}
                      </td>
                      {displayedMonths.map((m: any, idx: number) => (
                        <td
                          key={idx}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                          }}
                        >
                          {fmtMoney(getDynamicFieldValue(m, field))}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#fef9c3",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#fef9c3",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('cogsTotal')}
                    </td>
                    {displayedMonths.map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                        }}
                      >
                        {fmtMoney((m.cogsTotal || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Gross Profit */}
                  <tr
                    style={{
                      borderBottom: "2px solid #10b981",
                      background: "#d1fae5",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "700",
                        fontSize: "14px",
                        position: "sticky",
                        left: 0,
                        background: "#d1fae5",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('grossProfit')}
                    </td>
                    {displayedMonths.map((m: any, idx: number) => {
                      const grossProfit = (m.revenue || 0) - (m.cogsTotal || 0);
                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                            fontSize: "14px",
                          }}
                        >
                          {fmtMoney(grossProfit)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Operating Expenses */}
                  <tr
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#dbeafe",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#dbeafe",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('operatingExpenses')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td key={idx} style={{ padding: "8px 10px" }}></td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('payroll')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.payroll || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ownerBasePay')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ownerBasePay || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('benefits')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.benefits || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('insurance')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.insurance || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('professionalFees')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.professionalFees || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('subcontractors')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.subcontractors || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('rent')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.rent || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('taxLicense')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.taxLicense || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('phoneComm')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.phoneComm || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('infrastructure')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.infrastructure || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('autoTravel')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.autoTravel || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('salesExpense')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.salesExpense || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('marketing')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.marketing || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('trainingCert')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.trainingCert || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('mealsEntertainment')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.mealsEntertainment || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('interestExpense')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.interestExpense || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('depreciationAmortization')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.depreciationAmortization || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('otherExpense')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.otherExpense || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#e0f2fe",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#e0f2fe",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('totalOperatingExpenses')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => {
                      const totalOpex =
                        (m.payroll || 0) +
                        (m.ownerBasePay || 0) +
                        (m.ownersRetirement || 0) +
                        (m.professionalFees || 0) +
                        (m.rent || 0) +
                        (m.utilities || 0) +
                        (m.infrastructure || 0) +
                        (m.autoTravel || 0) +
                        (m.insurance || 0) +
                        (m.salesExpense || 0) +
                        (m.subcontractors || 0) +
                        (m.depreciationAmortization || 0) +
                        (m.interestExpense || 0) +
                        (m.marketing || 0) +
                        (m.benefits || 0) +
                        (m.taxLicense || 0) +
                        (m.phoneComm || 0) +
                        (m.trainingCert || 0) +
                        (m.mealsEntertainment || 0) +
                        (m.otherExpense || 0);
                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                          }}
                        >
                          {fmtMoney(totalOpex)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Income Before Tax */}
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#f1f5f9",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#f1f5f9",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('incomeBeforeTax')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => {
                      const totalOpex =
                        (m.payroll || 0) +
                        (m.ownerBasePay || 0) +
                        (m.ownersRetirement || 0) +
                        (m.professionalFees || 0) +
                        (m.rent || 0) +
                        (m.utilities || 0) +
                        (m.infrastructure || 0) +
                        (m.autoTravel || 0) +
                        (m.insurance || 0) +
                        (m.salesExpense || 0) +
                        (m.subcontractors || 0) +
                        (m.depreciationAmortization || 0) +
                        (m.interestExpense || 0) +
                        (m.marketing || 0) +
                        (m.benefits || 0) +
                        (m.taxLicense || 0) +
                        (m.phoneComm || 0) +
                        (m.trainingCert || 0) +
                        (m.mealsEntertainment || 0) +
                        (m.otherExpense || 0);

                      const incomeBeforeTax =
                        (m.revenue || 0) -
                        (m.cogsTotal || 0) -
                        totalOpex +
                        getNonOperatingIncome(m) -
                        getNonOperatingExpense(m) +
                        (m.extraordinaryItems || 0);

                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "10px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                          }}
                        >
                          {fmtMoney(incomeBeforeTax)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Income Taxes (only show if any month has > 0) */}
                  {monthly.slice(-36).some((m: any) => (m.stateIncomeTaxes || 0) > 0) && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "8px 10px",
                          paddingLeft: "20px",
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 1,
                        }}
                      >
                        {getFieldDisplayName('stateIncomeTaxes')}
                      </td>
                      {monthly.slice(-36).map((m: any, idx: number) => (
                        <td
                          key={idx}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                          }}
                        >
                          {fmtMoney((m.stateIncomeTaxes || 0))}
                        </td>
                      ))}
                    </tr>
                  )}

                  {monthly.slice(-36).some((m: any) => (m.federalIncomeTaxes || 0) > 0) && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "8px 10px",
                          paddingLeft: "20px",
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 1,
                        }}
                      >
                        {getFieldDisplayName('federalIncomeTaxes')}
                      </td>
                      {monthly.slice(-36).map((m: any, idx: number) => (
                        <td
                          key={idx}
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                          }}
                        >
                          {fmtMoney((m.federalIncomeTaxes || 0))}
                        </td>
                      ))}
                    </tr>
                  )}

                  {/* Non-Operating Income & Expense */}
                  {(monthly.slice(-36).some((m: any) => getNonOperatingIncome(m) !== 0) ||
                    monthly.slice(-36).some((m: any) => getNonOperatingExpense(m) !== 0) ||
                    monthly.slice(-36).some((m: any) => (m.extraordinaryItems || 0) !== 0)) && (
                    <>
                      <tr
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: "#f5f3ff",
                        }}
                      >
                        <td
                          style={{
                            padding: "8px 10px",
                            fontWeight: "700",
                            position: "sticky",
                            left: 0,
                            background: "#f5f3ff",
                            zIndex: 1,
                          }}
                        >
                          Non-Operating Income & Expense
                        </td>
                        {monthly.slice(-36).map((m: any, idx: number) => (
                          <td key={idx} style={{ padding: "8px 10px" }}></td>
                        ))}
                      </tr>
                      {monthly.slice(-36).some((m: any) => getNonOperatingIncome(m) !== 0) && (
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td
                            style={{
                              padding: "8px 10px",
                              paddingLeft: "20px",
                              position: "sticky",
                              left: 0,
                              background: "white",
                              zIndex: 1,
                            }}
                          >
                            {getFieldDisplayName('nonOperatingIncome')}
                          </td>
                          {monthly.slice(-36).map((m: any, idx: number) => (
                            <td
                              key={idx}
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontFamily: "monospace",
                              }}
                            >
                              {fmtMoney(getNonOperatingIncome(m))}
                            </td>
                          ))}
                        </tr>
                      )}
                      {monthly.slice(-36).some((m: any) => getNonOperatingExpense(m) !== 0) && (
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td
                            style={{
                              padding: "8px 10px",
                              paddingLeft: "20px",
                              position: "sticky",
                              left: 0,
                              background: "white",
                              zIndex: 1,
                            }}
                          >
                            {getFieldDisplayName('nonOperatingExpense')}
                          </td>
                          {monthly.slice(-36).map((m: any, idx: number) => (
                            <td
                              key={idx}
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontFamily: "monospace",
                              }}
                            >
                              {fmtMoney(getNonOperatingExpense(m))}
                            </td>
                          ))}
                        </tr>
                      )}
                    </>
                  )}

                  {/* Net Income */}
                  <tr
                    style={{
                      borderBottom: "3px solid #10b981",
                      background: "#10b981",
                      color: "white",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 10px",
                        fontWeight: "700",
                        fontSize: "15px",
                        position: "sticky",
                        left: 0,
                        background: "#10b981",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('netIncome')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => {
                      const totalOpex =
                        (m.payroll || 0) +
                        (m.ownerBasePay || 0) +
                        (m.ownersRetirement || 0) +
                        (m.professionalFees || 0) +
                        (m.rent || 0) +
                        (m.utilities || 0) +
                        (m.infrastructure || 0) +
                        (m.autoTravel || 0) +
                        (m.insurance || 0) +
                        (m.salesExpense || 0) +
                        (m.subcontractors || 0) +
                        (m.depreciationAmortization || 0) +
                        (m.interestExpense || 0) +
                        (m.marketing || 0) +
                        (m.benefits || 0) +
                        (m.taxLicense || 0) +
                        (m.phoneComm || 0) +
                        (m.trainingCert || 0) +
                        (m.mealsEntertainment || 0) +
                        (m.otherExpense || 0);
                      const incomeBeforeTax =
                        (m.revenue || 0) -
                        (m.cogsTotal || 0) -
                        totalOpex +
                        getNonOperatingIncome(m) -
                        getNonOperatingExpense(m) +
                        (m.extraordinaryItems || 0);
                      const netIncome =
                        incomeBeforeTax -
                        (m.stateIncomeTaxes || 0) -
                        (m.federalIncomeTaxes || 0);
                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "12px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                            fontSize: "15px",
                          }}
                        >
                          {fmtMoney(netIncome)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          )}

          {statementView === "balance" && (
          <div
            style={{
              background: "white",
              borderRadius: "0 0 12px 12px",
              padding: "16px 24px 24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        fontWeight: "600",
                        position: "sticky",
                        left: 0,
                        background: "#f8fafc",
                        zIndex: 1,
                        minWidth: "150px",
                      }}
                    >
                      Item
                    </th>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <th
                        key={idx}
                        style={{
                          padding: "10px",
                          textAlign: "right",
                          fontWeight: "600",
                          minWidth: "90px",
                        }}
                      >
                        {formatMonth(m.month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Current Assets */}
                  <tr
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#dbeafe",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#dbeafe",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('currentAssets')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td key={idx} style={{ padding: "8px 10px" }}></td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('cash')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.cash || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ar')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ar || 0))}
                      </td>
                    ))}
                  </tr>
                  {renderBalanceSheetLine('retainageReceivables', 'Retainage Receivables')}
                  {renderBalanceSheetLine('contractAssets', 'Contract Assets')}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('inventory')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.inventory || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('otherCA')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.otherCA || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#dbeafe",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#dbeafe",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('tca')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                        }}
                      >
                        {fmtMoney((m.tca || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Fixed Assets */}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('fixedAssets')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.fixedAssets || 0))}
                      </td>
                    ))}
                  </tr>
                  {renderBalanceSheetLine('constructionEquipment', 'Construction Equipment', "32px")}
                  {renderBalanceSheetLine('officeEquipment', 'Office Equipment', "32px")}
                  {renderBalanceSheetLine('shopEquipment', 'Shop Equipment', "32px")}
                  {renderBalanceSheetLine('investments', 'Investments')}
                  {renderBalanceSheetLine('rightOfUseLeases', 'Right of Use - Leases')}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('otherAssets')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.otherAssets || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "3px solid #3b82f6",
                      background: "#e0f2fe",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "700",
                        fontSize: "14px",
                        position: "sticky",
                        left: 0,
                        background: "#e0f2fe",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('totalAssets')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                          fontSize: "14px",
                        }}
                      >
                        {fmtMoney((m.totalAssets || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Current Liabilities */}
                  <tr
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#fef3c7",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#fef3c7",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('currentLiabilities')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td key={idx} style={{ padding: "8px 10px" }}></td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ap')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ap || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('loc')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.loc || 0))}
                      </td>
                    ))}
                  </tr>
                  {renderBalanceSheetLine('contractLiabilities', 'Contract Liabilities')}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('otherCL')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.otherCL || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "2px solid #e2e8f0",
                      background: "#fef3c7",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#fef3c7",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('tcl')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                        }}
                      >
                        {fmtMoney((m.tcl || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Long-term Liabilities */}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ltd')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ltd || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "3px solid #f59e0b",
                      background: "#fef9c3",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "700",
                        fontSize: "14px",
                        position: "sticky",
                        left: 0,
                        background: "#fef9c3",
                        zIndex: 1,
                      }}
                    >
                      TOTAL LIABILITIES
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: "700",
                          fontSize: "14px",
                        }}
                      >
                        {fmtMoney((m.totalLiab || 0))}
                      </td>
                    ))}
                  </tr>

                  {/* Equity */}
                  <tr
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: "#f0fdf4",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: "700",
                        position: "sticky",
                        left: 0,
                        background: "#f0fdf4",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('equity')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td key={idx} style={{ padding: "8px 10px" }}></td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ownersCapital')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ownersCapital || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('ownersDraw')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.ownersDraw || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('commonStock')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.commonStock || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('preferredStock')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.preferredStock || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('retainedEarnings')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.retainedEarnings || 0))}
                      </td>
                    ))}
                  </tr>
                  {monthly.slice(-36).some((m: any) => Number(m.currentYearNetIncome || 0) !== 0) && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td
                        style={{
                          padding: "8px 10px",
                          paddingLeft: "20px",
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 1,
                        }}
                      >
                        {getFieldDisplayName('currentYearNetIncome')}
                      </td>
                      {monthly.slice(-36).map((m: any, idx: number) => {
                        const value = Number(m.currentYearNetIncome || 0);
                        return (
                          <td
                            key={idx}
                            style={{
                              padding: "8px 10px",
                              textAlign: "right",
                              fontFamily: "monospace",
                            }}
                          >
                            {fmtSigned(value)}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('additionalPaidInCapital')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.additionalPaidInCapital || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        paddingLeft: "20px",
                        position: "sticky",
                        left: 0,
                        background: "white",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('treasuryStock')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => (
                      <td
                        key={idx}
                        style={{
                          padding: "8px 10px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {fmtMoney((m.treasuryStock || 0))}
                      </td>
                    ))}
                  </tr>
                  <tr
                    style={{
                      borderBottom: "3px solid #10b981",
                      background: "#f0fdf4",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight: "700",
                        fontSize: "14px",
                        position: "sticky",
                        left: 0,
                        background: "#f0fdf4",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('totalEquity')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => {
                      const calculatedTotalEquity =
                        (m.ownersCapital || 0) +
                        (m.ownersDraw || 0) +
                        (m.commonStock || 0) +
                        (m.preferredStock || 0) +
                        (m.retainedEarnings || 0) +
                        (m.currentYearNetIncome || 0) +
                        (m.additionalPaidInCapital || 0) +
                        (m.treasuryStock || 0);
                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                            fontSize: "14px",
                          }}
                        >
                          {fmtMoney(calculatedTotalEquity)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Total Liabilities & Equity Check */}
                  <tr
                    style={{
                      borderBottom: "4px double #475569",
                      background: "#e2e8f0",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 10px",
                        fontWeight: "700",
                        fontSize: "15px",
                        position: "sticky",
                        left: 0,
                        background: "#e2e8f0",
                        zIndex: 1,
                      }}
                    >
                      {getFieldDisplayName('totalLiabilitiesAndEquity')}
                    </td>
                    {monthly.slice(-36).map((m: any, idx: number) => {
                      const calculatedTotalEquity =
                        (m.ownersCapital || 0) +
                        (m.ownersDraw || 0) +
                        (m.commonStock || 0) +
                        (m.preferredStock || 0) +
                        (m.retainedEarnings || 0) +
                        (m.currentYearNetIncome || 0) +
                        (m.additionalPaidInCapital || 0) +
                        (m.treasuryStock || 0);
                      const totalLE =
                        (m.totalLiab || 0) + calculatedTotalEquity;
                      return (
                        <td
                          key={idx}
                          style={{
                            padding: "12px 10px",
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: "700",
                            fontSize: "15px",
                          }}
                        >
                          {fmtMoney(totalLE)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
