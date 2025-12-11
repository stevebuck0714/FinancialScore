import React from "react";
import type { MonthlyDataRow } from "../../types";

interface ImportFinancialsTabProps {
  selectedCompanyId: string | null;
  loadedMonthlyData: MonthlyDataRow[] | null;
  qbRawData: any;
  csvTrialBalanceData: any;
  setCsvTrialBalanceData: (data: any) => void;
  error: string | null;
  setError: (error: string | null) => void;
  file: File | null;
  columns: string[];
  handleFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  parseTrialBalanceCSV: (text: string, companyId: string | null) => any;
  renderColumnSelector: (label: string, field: string) => JSX.Element;
  setAdminDashboardTab: (tab: string) => void;
}

const ImportFinancialsTab: React.FC<ImportFinancialsTabProps> = ({
  selectedCompanyId,
  loadedMonthlyData,
  qbRawData,
  csvTrialBalanceData,
  setCsvTrialBalanceData,
  error,
  setError,
  file,
  columns,
  handleFile,
  parseTrialBalanceCSV,
  renderColumnSelector,
  setAdminDashboardTab,
}) => {
  return (
    <>
      {/* QuickBooks Data Verification Section */}
      {loadedMonthlyData &&
        loadedMonthlyData.length > 0 &&
        qbRawData && (
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              border: "2px solid #10b981",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#1e293b",
                marginBottom: "8px",
              }}
            >
              ? QuickBooks Data Verification
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#64748b",
                marginBottom: "12px",
              }}
            >
              ✅ Imported from QuickBooks -{" "}
              {loadedMonthlyData.length} months of data
              verified
            </p>

            {/* Summary Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  background: "#f0fdf4",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #86efac",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#065f46",
                    marginBottom: "4px",
                  }}
                >
                  MONTHS IMPORTED
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: "700",
                    color: "#10b981",
                  }}
                >
                  {loadedMonthlyData.length}
                </div>
              </div>
              <div
                style={{
                  background: "#ede9fe",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #c4b5fd",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#5b21b6",
                    marginBottom: "4px",
                  }}
                >
                  DATE RANGE
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#7c3aed",
                  }}
                >
                  {new Date(
                    loadedMonthlyData[0].date,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(
                    loadedMonthlyData[
                      loadedMonthlyData.length - 1
                    ].date,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div
                style={{
                  background: "#dbeafe",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #93c5fd",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#1e40af",
                    marginBottom: "4px",
                  }}
                >
                  TOTAL REVENUE
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#2563eb",
                  }}
                >
                  $
                  {(
                    loadedMonthlyData.reduce(
                      (sum, m) => sum + (m.revenue || 0),
                      0,
                    ) / 1000
                  ).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                  K
                </div>
              </div>
              <div
                style={{
                  background: "#fef3c7",
                  borderRadius: "8px",
                  padding: "16px",
                  border: "1px solid #fcd34d",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#92400e",
                    marginBottom: "4px",
                  }}
                >
                  NET INCOME
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#d97706",
                  }}
                >
                  $
                  {(
                    loadedMonthlyData.reduce(
                      (sum, m) => sum + (m.netIncome || 0),
                      0,
                    ) / 1000
                  ).toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                  K
                </div>
              </div>
            </div>

            {/* Recent Data Table */}
            <div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#475569",
                  marginBottom: "12px",
                }}
              >
                Recent 6 Months Summary
              </h3>
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
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
                          padding: "8px",
                          textAlign: "left",
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        Period
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          textAlign: "right",
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        Revenue
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          textAlign: "right",
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        Expense
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          textAlign: "right",
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        COGS Total
                      </th>
                      <th
                        style={{
                          padding: "8px",
                          textAlign: "right",
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        Net Income
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadedMonthlyData
                      .slice(-6)
                      .map((m, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom:
                              "1px solid #f1f5f9",
                          }}
                        >
                          <td
                            style={{
                              padding: "8px",
                              color: "#1e293b",
                            }}
                          >
                            {new Date(
                              m.date,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td
                            style={{
                              padding: "8px",
                              textAlign: "right",
                              color: "#10b981",
                              fontWeight: "600",
                            }}
                          >
                            $
                            {m.revenue.toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              },
                            )}
                          </td>
                          <td
                            style={{
                              padding: "8px",
                              textAlign: "right",
                              color: "#ef4444",
                              fontWeight: "600",
                            }}
                          >
                            $
                            {m.expense.toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              },
                            )}
                          </td>
                          <td
                            style={{
                              padding: "8px",
                              textAlign: "right",
                              color: "#f59e0b",
                            }}
                          >
                            $
                            {(
                              (m.cogs || 0) +
                              (m.contractors || 0) +
                              (m.materials || 0)
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td
                            style={{
                              padding: "8px",
                              textAlign: "right",
                              color: "#10b981",
                              fontWeight: "600",
                            }}
                          >
                            $
                            {m.netIncome.toLocaleString(
                              "en-US",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              },
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: "8px",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: "#065f46",
                  margin: 0,
                  fontWeight: "500",
                }}
              >
                ✅ Data successfully imported and processed. You can now
                view detailed financial reports and analytics.
              </p>
            </div>
          </div>
        )}

      {/* Excel Import Section */}
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
            fontSize: "20px",
            fontWeight: "600",
            color: "#1e293b",
            marginBottom: "16px",
          }}
        >
          📊 Excel Financial Data Import
        </h2>

        <div
          style={{
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#0c4a6e",
              lineHeight: "1.6",
              margin: 0,
            }}
          >
            <strong>Spreadsheet Format:</strong> Upload Excel files with
            financial data organized by month. The first column should be
            labeled "Date" and contain monthly dates. Subsequent columns
            contain financial metrics.{" "}
            <a
              href="mailto:support@corelytics.com"
              style={{
                color: "#0284c7",
                textDecoration: "underline",
              }}
            >
              Email Us
            </a>{" "}
            for a spreadsheet format. For best results include 36 months of
            historical data.
          </p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#475569",
              marginBottom: "12px",
            }}
          >
            Upload Financial Data
          </h3>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            style={{
              marginBottom: "16px",
              padding: "12px",
              border: "2px dashed #cbd5e1",
              borderRadius: "8px",
              width: "100%",
              cursor: "pointer",
            }}
          />
          {error && (
            <div
              style={{
                padding: "12px",
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}
          {file && (
            <div
              style={{
                fontSize: "14px",
                color: "#10b981",
                fontWeight: "600",
              }}
            >
              ? Loaded: {file.name}
            </div>
          )}
        </div>

        {file && columns.length > 0 && (
          <div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#475569",
                marginBottom: "12px",
              }}
            >
              Column Mapping
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#64748b",
                marginBottom: "20px",
              }}
            >
              Verify or adjust the column mappings below. Columns have been
              auto-detected.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px",
              }}
            >
              <div>
                <h4
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#475569",
                    marginBottom: "12px",
                    borderBottom: "2px solid #e2e8f0",
                    paddingBottom: "8px",
                  }}
                >
                  Profit & Loss
                </h4>
                {renderColumnSelector("Date", "date")}
                {renderColumnSelector("Total Revenue", "revenue")}
                {renderColumnSelector("Total Expenses", "expense")}
                {renderColumnSelector("Net Income", "netIncome")}
                {renderColumnSelector("COGS", "cogs")}
                {renderColumnSelector("Contractors", "contractors")}
                {renderColumnSelector("Materials", "materials")}
                {renderColumnSelector("Payroll", "payroll")}
                {renderColumnSelector("Operating Expenses", "opEx")}
              </div>

              <div>
                <h4
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#475569",
                    marginBottom: "12px",
                    borderBottom: "2px solid #e2e8f0",
                    paddingBottom: "8px",
                  }}
                >
                  Balance Sheet Assets
                </h4>
                {renderColumnSelector("Total Assets", "assets")}
                {renderColumnSelector("Cash", "cash")}
                {renderColumnSelector("Accounts Receivable", "ar")}
                {renderColumnSelector("Inventory", "inventory")}
                {renderColumnSelector("Other Current Assets", "otherCA")}
                {renderColumnSelector("Total Current Assets", "tca")}
                {renderColumnSelector("Fixed Assets", "fixedAssets")}
                {renderColumnSelector("Other Assets", "otherAssets")}
              </div>

              <div>
                <h4
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#475569",
                    marginBottom: "12px",
                    borderBottom: "2px solid #e2e8f0",
                    paddingBottom: "8px",
                  }}
                >
                  Liabilities & Other
                </h4>
                {renderColumnSelector("Accounts Payable", "ap")}
                {renderColumnSelector("Other Current Liabilities", "otherCL")}
                {renderColumnSelector("Total Current Liabilities", "tcl")}
                {renderColumnSelector("Long Term Debt", "ltd")}
                {renderColumnSelector("Total Liabilities & Equity", "totalLAndE")}
              </div>
            </div>

            <div
              style={{
                marginTop: "20px",
                padding: "12px",
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "8px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "#0c4a6e",
                  margin: 0,
                }}
              >
                <strong>Tip:</strong> At minimum, map Date, Total Revenue,
                Total Expenses, Total Assets, and Total Liabilities for basic
                analysis. Map detailed P&L and balance sheet items for
                comprehensive analysis and reporting.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Trial Balance Import Section */}
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
            fontSize: "20px",
            fontWeight: "600",
            color: "#1e293b",
            marginBottom: "16px",
          }}
        >
          📊 Trial Balance Import
        </h2>

        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#065f46",
              lineHeight: "1.6",
              margin: 0,
            }}
          >
            <strong>Trial Balance Format:</strong> Upload a CSV with columns:
            Acct Type, Acct ID, Description, then date columns (e.g.,
            12/31/2022, 1/31/2023, ...). This format supports
            QuickBooks-style account types and routes through Data Mapping
            for precise account classification.
          </p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#475569",
              marginBottom: "12px",
            }}
          >
            Upload Trial Balance CSV
          </h3>
          <input
            type="file"
            accept=".csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              try {
                const text = await file.text();
                const parsed = parseTrialBalanceCSV(
                  text,
                  selectedCompanyId,
                );
                const csvData = {
                  ...parsed,
                  _companyId: selectedCompanyId,
                  fileName: file.name,
                };
                setCsvTrialBalanceData(csvData);
                // Save to localStorage for persistence across sessions
                localStorage.setItem(
                  `csvTrialBalance_${selectedCompanyId}`,
                  JSON.stringify(csvData),
                );
                setError(null);
                alert(
                  `? Parsed ${parsed.accounts.length} accounts across ${parsed.dates.length} periods. Go to Account Mapping tab to map accounts.`,
                );
              } catch (err: any) {
                setError(
                  `Failed to parse Trial Balance CSV: ${err.message}`,
                );
                setCsvTrialBalanceData(null);
              }
            }}
            style={{
              marginBottom: "16px",
              padding: "12px",
              border: "2px dashed #10b981",
              borderRadius: "8px",
              width: "100%",
              cursor: "pointer",
              background: "#f0fdf4",
            }}
          />
          {error && error.includes("Trial Balance") && (
            <div
              style={{
                padding: "12px",
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {csvTrialBalanceData &&
          csvTrialBalanceData._companyId === selectedCompanyId && (
            <div
              style={{
                background: "#f0fdf4",
                border: "2px solid #10b981",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#065f46",
                  marginBottom: "12px",
                }}
              >
                ? Trial Balance Loaded: {csvTrialBalanceData.fileName}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    background: "white",
                    padding: "12px",
                    borderRadius: "6px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#10b981",
                    }}
                  >
                    {csvTrialBalanceData.accounts?.length || 0}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#065f46",
                    }}
                  >
                    Total Accounts
                  </div>
                </div>
                <div
                  style={{
                    background: "white",
                    padding: "12px",
                    borderRadius: "6px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#f59e0b",
                    }}
                  >
                    {
                      Object.keys(
                        csvTrialBalanceData.accountsByType || {},
                      ).length
                    }
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#92400e",
                    }}
                  >
                    Account Types
                  </div>
                </div>
              </div>

              {/* Account Types Summary */}
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#065f46",
                    marginBottom: "8px",
                  }}
                >
                  Account Types Found:
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                  }}
                >
                  {Object.entries(
                    csvTrialBalanceData.accountsByType || {},
                  ).map(([type, accounts]: [string, any]) => (
                    <span
                      key={type}
                      style={{
                        padding: "4px 10px",
                        background: "white",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "#065f46",
                        border: "1px solid #86efac",
                      }}
                    >
                      {type}: {accounts.length}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setAdminDashboardTab("data-mapping")}
                  style={{
                    padding: "12px 24px",
                    background: "#667eea",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(102, 126, 234, 0.3)",
                  }}
                >
                  ? Go to Account Mapping
                </button>
                <button
                  onClick={() => {
                    setCsvTrialBalanceData(null);
                    localStorage.removeItem(
                      `csvTrialBalance_${selectedCompanyId}`,
                    );
                  }}
                  style={{
                    padding: "12px 24px",
                    background: "white",
                    color: "#64748b",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
      </div>
    </>
  );
};

export default ImportFinancialsTab;
