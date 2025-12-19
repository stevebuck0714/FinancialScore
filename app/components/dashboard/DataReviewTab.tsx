"use client";

import React from "react";
import { exportDataReviewToExcel } from "../../utils/excel-export";
import type { MonthlyDataRow, Mappings } from "../../types";
import { useMasterData } from "@/lib/master-data-store";
import { getFieldDisplayName } from "@/lib/constants/field-display-names";

interface DataReviewTabProps {
  selectedCompanyId: string;
  companyName: string;
  accountMappings: Mappings[];
}

export default function DataReviewTab({ selectedCompanyId, companyName, accountMappings }: DataReviewTabProps) {
  // Use master data store instead of receiving monthly data as prop
  const { monthlyData, loading: masterDataLoading, error: masterDataError } = useMasterData(selectedCompanyId);

  // Check if master data exists
  if (masterDataLoading) {
    return (
      <div style={{ maxWidth: "100%", padding: "32px", overflowX: "auto" }}>
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
      <div style={{ maxWidth: "100%", padding: "32px", overflowX: "auto" }}>
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

  // Use master data as monthly data
  const monthly = monthlyData;

  // Format month as MM-YYYY
  const formatMonth = (monthValue: any): string => {
    if (!monthValue) return '';
    
    const date = monthValue instanceof Date ? monthValue : new Date(monthValue);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return String(monthValue);
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}-${year}`;
  };

  return (
    <div style={{ maxWidth: "100%", padding: "32px", overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <div>
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
          {companyName && (
            <div
              style={{
                fontSize: "24px",
                fontWeight: "600",
                color: "#64748b",
                marginTop: "4px",
              }}
            >
              {companyName}
            </div>
          )}
        </div>
        {monthly && monthly.length > 0 && (
          <button
            onClick={() => exportDataReviewToExcel(monthly, companyName)}
            style={{
              background: "#10b981",
              color: "white",
              border: "none",
              padding: "12px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#059669")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#10b981")}
          >
            📥 Export to Excel
          </button>
        )}
      </div>
      <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "32px" }}>
        Review all imported financial data for {companyName || "this company"}
      </p>

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
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "12px",
              color: "#166534",
            }}
          >
            <strong>✅ Financial data loaded</strong>
            <p style={{ marginTop: "8px", marginBottom: 0 }}>
              Total months: {monthly.length} | Displaying: Last{" "}
              {Math.min(36, monthly.length)} months
            </p>
          </div>

          {/* Income Statement - Last 36 months */}
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "600",
                color: "#1e293b",
                marginBottom: "16px",
                borderBottom: "3px solid #10b981",
                paddingBottom: "8px",
              }}
            >
              Income Statement (Last 36 Months)
            </h2>
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
                        $
                        {(m.revenue || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>

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
                      {getFieldDisplayName('cogsPayroll')}
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
                        $
                        {(m.cogsPayroll || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                      {getFieldDisplayName('cogsOwnerPay')}
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
                        $
                        {(m.cogsOwnerPay || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                      {getFieldDisplayName('cogsContractors')}
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
                        $
                        {(m.cogsContractors || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                      {getFieldDisplayName('cogsMaterials')}
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
                        $
                        {(m.cogsMaterials || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                      {getFieldDisplayName('cogsCommissions')}
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
                        $
                        {(m.cogsCommissions || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                      {getFieldDisplayName('cogsOther')}
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
                        $
                        {(m.cogsOther || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>
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
                        $
                        {(m.cogsTotal || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                    {monthly.slice(-36).map((m: any, idx: number) => {
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
                          $
                          {grossProfit.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
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
                        $
                        {(m.payroll || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ownerBasePay || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.benefits || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.insurance || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.professionalFees || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.subcontractors || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.rent || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.taxLicense || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.phoneComm || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.infrastructure || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.autoTravel || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.salesExpense || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.marketing || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.trainingCert || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.mealsEntertainment || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.interestExpense || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.depreciationAmortization || 0).toLocaleString(
                          "en-US",
                          {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          },
                        )}
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
                        $
                        {(m.otherExpense || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                          $
                          {totalOpex.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
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
                        (m.revenue || 0) - (m.cogsTotal || 0) - totalOpex;

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
                          $
                          {incomeBeforeTax.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
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
                          $
                          {(m.stateIncomeTaxes || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
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
                          $
                          {(m.federalIncomeTaxes || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      ))}
                    </tr>
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
                        (m.revenue || 0) - (m.cogsTotal || 0) - totalOpex;
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
                          $
                          {netIncome.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Balance Sheet - Last 36 months */}
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "600",
                color: "#1e293b",
                marginBottom: "16px",
                borderBottom: "3px solid #3b82f6",
                paddingBottom: "8px",
              }}
            >
              Balance Sheet (Last 36 Months)
            </h2>
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
                        $
                        {(m.cash || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ar || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.inventory || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.otherCA || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.tca || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.fixedAssets || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.otherAssets || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.totalAssets || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ap || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.otherCL || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.tcl || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ltd || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.totalLiab || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ownersCapital || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.ownersDraw || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.commonStock || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.preferredStock || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.retainedEarnings || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                        $
                        {(m.additionalPaidInCapital || 0).toLocaleString(
                          "en-US",
                          {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          },
                        )}
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
                        $
                        {(m.treasuryStock || 0).toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
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
                          $
                          {calculatedTotalEquity.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
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
                          $
                          {totalLE.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
