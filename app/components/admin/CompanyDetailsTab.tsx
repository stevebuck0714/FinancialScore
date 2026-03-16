"use client";

import React from "react";
import { INDUSTRY_SECTORS } from "@/data/industrySectors";
import { formatPhoneNumber } from "@/app/utils/phone";
import PasswordInput from "@/app/components/common/PasswordInput";

interface User {
  id: string;
  name: string | null;
  email: string;
  phone?: string | null;
  title?: string | null;
  companyId?: string;
  userType?: string;
}

interface Company {
  id: string;
  name: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  industrySector?: string | null;
  consultantId?: string;
}

interface AssessmentRecord {
  user?: {
    email: string;
  };
  companyId: string;
}

interface CompanyDetailsTabProps {
  currentUser: {
    consultantType?: string;
    consultantId?: string;
  };
  selectedCompanyId: string;
  companies: Company[];
  users: User[];
  assessmentRecords: AssessmentRecord[];
  isLoading: boolean;
  newCompanyName: string;
  selectedAffiliateCodeForNewCompany?: string;
  setSelectedAffiliateCodeForNewCompany?: (code: string) => void;
  setNewCompanyName: (name: string) => void;
  addCompany: () => void;
  setEditingCompanyId: (id: string) => void;
  setCompanyAddressStreet: (street: string) => void;
  setCompanyAddressCity: (city: string) => void;
  setCompanyAddressState: (state: string) => void;
  setCompanyAddressZip: (zip: string) => void;
  setCompanyAddressCountry: (country: string) => void;
  setCompanyIndustrySector: (sector: string) => void;
  setShowCompanyDetailsModal: (show: boolean) => void;
  deleteUser: (id: string, companyId?: string) => void;
  newCompanyUserName: string;
  setNewCompanyUserName: (name: string) => void;
  newCompanyUserTitle: string;
  setNewCompanyUserTitle: (title: string) => void;
  newCompanyUserEmail: string;
  setNewCompanyUserEmail: (email: string) => void;
  newCompanyUserPhone: string;
  setNewCompanyUserPhone: (phone: string) => void;
  newCompanyUserPassword: string;
  setNewCompanyUserPassword: (password: string) => void;
  addUser: (companyId: string, userType: "company" | "assessment") => void;
  existingCompanyUserName: string;
  setExistingCompanyUserName: (name: string) => void;
  existingCompanyUserEmail: string;
  setExistingCompanyUserEmail: (email: string) => void;
  newAssessmentUserName: string;
  setNewAssessmentUserName: (name: string) => void;
  newAssessmentUserTitle: string;
  setNewAssessmentUserTitle: (title: string) => void;
  newAssessmentUserEmail: string;
  setNewAssessmentUserEmail: (email: string) => void;
  newAssessmentUserPassword: string;
  setNewAssessmentUserPassword: (password: string) => void;
  existingAssessmentUserName: string;
  setExistingAssessmentUserName: (name: string) => void;
  existingAssessmentUserEmail: string;
  setExistingAssessmentUserEmail: (email: string) => void;
  grantExistingUserAccess: (
    companyId: string,
    userType: "company" | "assessment",
  ) => void;
  setSelectedCompanyId: (id: string) => void;
}

export default function CompanyDetailsTab({
  currentUser,
  selectedCompanyId,
  companies,
  users,
  assessmentRecords,
  isLoading,
  newCompanyName,
  selectedAffiliateCodeForNewCompany,
  setSelectedAffiliateCodeForNewCompany,
  setNewCompanyName,
  addCompany,
  setEditingCompanyId,
  setCompanyAddressStreet,
  setCompanyAddressCity,
  setCompanyAddressState,
  setCompanyAddressZip,
  setCompanyAddressCountry,
  setCompanyIndustrySector,
  setShowCompanyDetailsModal,
  deleteUser,
  newCompanyUserName,
  setNewCompanyUserName,
  newCompanyUserTitle,
  setNewCompanyUserTitle,
  newCompanyUserEmail,
  setNewCompanyUserEmail,
  newCompanyUserPhone,
  setNewCompanyUserPhone,
  newCompanyUserPassword,
  setNewCompanyUserPassword,
  addUser,
  existingCompanyUserName,
  setExistingCompanyUserName,
  existingCompanyUserEmail,
  setExistingCompanyUserEmail,
  newAssessmentUserName,
  setNewAssessmentUserName,
  newAssessmentUserTitle,
  setNewAssessmentUserTitle,
  newAssessmentUserEmail,
  setNewAssessmentUserEmail,
  newAssessmentUserPassword,
  setNewAssessmentUserPassword,
  existingAssessmentUserName,
  setExistingAssessmentUserName,
  existingAssessmentUserEmail,
  setExistingAssessmentUserEmail,
  grantExistingUserAccess,
  setSelectedCompanyId,
}: CompanyDetailsTabProps) {
  const ACCESSIBLE_SECTIONS: { id: string; label: string }[] = [
    { id: "ask-corelytics", label: "Ask Corelytics" },
    { id: "business-pulse", label: "Business Pulse" },
    { id: "operational-dashboard", label: "Operational Dashboard" },
    { id: "company-dashboard", label: "Company Dashboard" },
    { id: "financial-reports", label: "Financial Reports" },
    { id: "financial-statements", label: "Financial Statements" },
    { id: "valuation", label: "Valuation" },
    { id: "expert-analysis", label: "Expert Analysis" },
    { id: "mda", label: "MD&A" },
    { id: "management-assessment", label: "Team Assessment" },
    { id: "dataroom", label: "Corelytics DataRoom" },
  ];
  const DATAROOM_CAPABILITIES: Array<{
    id: "view" | "download" | "upload" | "share" | "manage";
    label: string;
  }> = [
    { id: "view", label: "View" },
    { id: "download", label: "Download" },
    { id: "upload", label: "Upload" },
    { id: "share", label: "Share" },
    { id: "manage", label: "Manage" },
  ];
  const DEFAULT_DATAROOM_CAPS = {
    view: true,
    download: true,
    upload: true,
    share: true,
    manage: true,
  };
  type DataRoomCaps = typeof DEFAULT_DATAROOM_CAPS;
  type DataRoomPermissionRule = {
    default: DataRoomCaps;
    folders: Record<string, DataRoomCaps>;
    documents: Record<string, DataRoomCaps>;
  };
  type DataRoomFolderRef = {
    id: string;
    name: string;
    documents: Array<{ id: string; name: string }>;
  };

  // Stored in DB as allowed/visible sections for a company user.
  const DEFAULT_ALLOWED_SECTIONS = ACCESSIBLE_SECTIONS.map((s) => s.id);

  // State for user permissions
  const [userPermissions, setUserPermissions] = React.useState<{
    [userId: string]: {
      role: "user" | "admin";
      sidebarAccess: string[];
    };
  }>({});
  const [expandedCompanyUsers, setExpandedCompanyUsers] = React.useState<
    Record<string, boolean>
  >({});
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null);
  const [dataRoomPermissionsByUser, setDataRoomPermissionsByUser] =
    React.useState<Record<string, DataRoomPermissionRule>>({});
  const [dataRoomFolders, setDataRoomFolders] = React.useState<
    DataRoomFolderRef[]
  >([]);
  const [loadingDataRoomPermissions, setLoadingDataRoomPermissions] =
    React.useState(false);
  const [savingDataRoomPermissionsUserId, setSavingDataRoomPermissionsUserId] =
    React.useState<string | null>(null);
  const [dataRoomPermissionsError, setDataRoomPermissionsError] =
    React.useState<string | null>(null);
  const [expandedDataRoomOverridesByUser, setExpandedDataRoomOverridesByUser] =
    React.useState<Record<string, boolean>>({});

  // Initialize permissions from users
  React.useEffect(() => {
    const permissions: typeof userPermissions = {};
    users
      .filter((u) => u.companyId === selectedCompanyId && u.userType === "company")
      .forEach((u) => {
        permissions[u.id] = {
          role: (u as any).companyRole || "user",
          sidebarAccess: (u as any).sidebarAccess || DEFAULT_ALLOWED_SECTIONS,
        };
      });
    setUserPermissions(permissions);
  }, [users, selectedCompanyId]);

  React.useEffect(() => {
    if (!selectedCompanyId) {
      setDataRoomPermissionsByUser({});
      setDataRoomFolders([]);
      setDataRoomPermissionsError(null);
      return;
    }

    const loadDataRoomPermissionContext = async () => {
      setLoadingDataRoomPermissions(true);
      setDataRoomPermissionsError(null);
      try {
        const [permissionsRes, overviewRes] = await Promise.all([
          fetch(
            `/api/dataroom/permissions?companyId=${encodeURIComponent(
              selectedCompanyId,
            )}`,
          ),
          fetch(
            `/api/dataroom/overview?companyId=${encodeURIComponent(
              selectedCompanyId,
            )}`,
          ),
        ]);

        if (permissionsRes.ok) {
          const permissionsData = await permissionsRes.json();
          const usersRules = Array.isArray(permissionsData?.permissions?.users)
            ? permissionsData.permissions.users
            : [];
          const byUser: Record<string, DataRoomPermissionRule> = {};
          usersRules.forEach((rule: any) => {
            const userId = String(rule?.userId || "");
            if (!userId) return;
            byUser[userId] = {
              default: {
                view:
                  typeof rule?.default?.view === "boolean"
                    ? rule.default.view
                    : DEFAULT_DATAROOM_CAPS.view,
                download:
                  typeof rule?.default?.download === "boolean"
                    ? rule.default.download
                    : DEFAULT_DATAROOM_CAPS.download,
                upload:
                  typeof rule?.default?.upload === "boolean"
                    ? rule.default.upload
                    : DEFAULT_DATAROOM_CAPS.upload,
                share:
                  typeof rule?.default?.share === "boolean"
                    ? rule.default.share
                    : DEFAULT_DATAROOM_CAPS.share,
                manage:
                  typeof rule?.default?.manage === "boolean"
                    ? rule.default.manage
                    : DEFAULT_DATAROOM_CAPS.manage,
              },
              folders: Object.fromEntries(
                Object.entries(rule?.folders || {}).map(([id, caps]: any) => [
                  String(id),
                  {
                    view:
                      typeof caps?.view === "boolean"
                        ? caps.view
                        : DEFAULT_DATAROOM_CAPS.view,
                    download:
                      typeof caps?.download === "boolean"
                        ? caps.download
                        : DEFAULT_DATAROOM_CAPS.download,
                    upload:
                      typeof caps?.upload === "boolean"
                        ? caps.upload
                        : DEFAULT_DATAROOM_CAPS.upload,
                    share:
                      typeof caps?.share === "boolean"
                        ? caps.share
                        : DEFAULT_DATAROOM_CAPS.share,
                    manage:
                      typeof caps?.manage === "boolean"
                        ? caps.manage
                        : DEFAULT_DATAROOM_CAPS.manage,
                  },
                ]),
              ),
              documents: Object.fromEntries(
                Object.entries(rule?.documents || {}).map(([id, caps]: any) => [
                  String(id),
                  {
                    view:
                      typeof caps?.view === "boolean"
                        ? caps.view
                        : DEFAULT_DATAROOM_CAPS.view,
                    download:
                      typeof caps?.download === "boolean"
                        ? caps.download
                        : DEFAULT_DATAROOM_CAPS.download,
                    upload:
                      typeof caps?.upload === "boolean"
                        ? caps.upload
                        : DEFAULT_DATAROOM_CAPS.upload,
                    share:
                      typeof caps?.share === "boolean"
                        ? caps.share
                        : DEFAULT_DATAROOM_CAPS.share,
                    manage:
                      typeof caps?.manage === "boolean"
                        ? caps.manage
                        : DEFAULT_DATAROOM_CAPS.manage,
                  },
                ]),
              ),
            };
          });
          setDataRoomPermissionsByUser(byUser);
        } else if (permissionsRes.status === 403) {
          setDataRoomPermissionsError(
            "You do not have DataRoom manage rights to edit DataRoom permissions.",
          );
        } else {
          setDataRoomPermissionsError("Failed to load DataRoom permissions.");
        }

        if (overviewRes.ok) {
          const overviewData = await overviewRes.json();
          const foldersFromApi = Array.isArray(overviewData?.folders)
            ? overviewData.folders
            : [];
          const normalizedFolders = foldersFromApi.map((folder: any) => ({
            id: String(folder?.id || ""),
            name: String(folder?.name || "Folder"),
            documents: Array.isArray(folder?.documents)
              ? folder.documents.map((doc: any) => ({
                  id: String(doc?.id || ""),
                  name: String(doc?.originalFileName || "Document"),
                }))
              : [],
          }));
          setDataRoomFolders(normalizedFolders.filter((f) => f.id));
        } else {
          setDataRoomFolders([]);
        }
      } catch {
        setDataRoomPermissionsError("Failed to load DataRoom permissions.");
      } finally {
        setLoadingDataRoomPermissions(false);
      }
    };

    loadDataRoomPermissionContext();
  }, [selectedCompanyId]);

  const saveUserPermissions = async (userId: string) => {
    setSavingUserId(userId);
    try {
      const response = await fetch("/api/users/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          companyId: selectedCompanyId,
          companyRole: userPermissions[userId].role,
          sidebarAccess: userPermissions[userId].sidebarAccess,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save permissions");
      }

      alert("User permissions updated successfully!");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update user permissions"
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const toggleAllowedSection = (userId: string, section: string) => {
    setUserPermissions((prev) => {
      const currentAllowed = prev[userId]?.sidebarAccess || DEFAULT_ALLOWED_SECTIONS;
      const updatedAllowed = currentAllowed.includes(section)
        ? currentAllowed.filter((s) => s !== section)
        : [...currentAllowed, section];

      return {
        ...prev,
        [userId]: {
          ...prev[userId],
          sidebarAccess: updatedAllowed,
        },
      };
    });
  };

  const setUserRole = (userId: string, role: "user" | "admin") => {
    setUserPermissions((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        role,
      },
    }));
  };

  const toggleCompanyUserExpanded = (userId: string) => {
    setExpandedCompanyUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const toggleDataRoomOverrideExpanded = (userId: string) => {
    setExpandedDataRoomOverridesByUser((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const getDataRoomRule = (
    userId: string,
    source?: Record<string, DataRoomPermissionRule>,
  ): DataRoomPermissionRule =>
    (source || dataRoomPermissionsByUser)[userId] || {
      default: { ...DEFAULT_DATAROOM_CAPS },
      folders: {},
      documents: {},
    };

  const toggleDataRoomCapability = (
    userId: string,
    scope: "default" | "folder" | "document",
    scopeId: string | null,
    capability: keyof DataRoomCaps,
  ) => {
    setDataRoomPermissionsByUser((prev) => {
      const current = getDataRoomRule(userId, prev);
      if (scope === "default") {
        return {
          ...prev,
          [userId]: {
            ...current,
            default: {
              ...current.default,
              [capability]: !current.default[capability],
            },
          },
        };
      }

      const container =
        scope === "folder" ? { ...current.folders } : { ...current.documents };
      const key = String(scopeId || "");
      const currentCaps = container[key]
        ? { ...container[key] }
        : { ...current.default };
      container[key] = {
        ...currentCaps,
        [capability]: !currentCaps[capability],
      };

      return {
        ...prev,
        [userId]: {
          ...current,
          folders: scope === "folder" ? container : current.folders,
          documents: scope === "document" ? container : current.documents,
        },
      };
    });
  };

  const saveDataRoomPermissions = async (userId: string) => {
    setSavingDataRoomPermissionsUserId(userId);
    try {
      const rule = getDataRoomRule(userId);
      const response = await fetch("/api/dataroom/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          userId,
          default: rule.default,
          folders: rule.folders,
          documents: rule.documents,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save DataRoom permissions");
      }
      alert("DataRoom permissions updated successfully!");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update DataRoom permissions",
      );
    } finally {
      setSavingDataRoomPermissionsUserId(null);
    }
  };
  // For business users, auto-select their company if not already selected
  React.useEffect(() => {
    if (
      currentUser.consultantType === "business" &&
      !selectedCompanyId &&
      Array.isArray(companies) &&
      companies.length > 0
    ) {
      const businessCompany = Array.isArray(companies)
        ? companies.find((c) => c.consultantId === currentUser.consultantId)
        : undefined;
      if (businessCompany) {
        setTimeout(() => setSelectedCompanyId(businessCompany.id), 0);
      }
    }
  }, [
    currentUser.consultantType,
    currentUser.consultantId,
    selectedCompanyId,
    companies,
    setSelectedCompanyId,
  ]);

  if (!selectedCompanyId) {
    return (
      <>
        {/* Only show Add Company for regular consultants */}
        {currentUser.consultantType !== "business" && (
          <>
            <p
              style={{
                fontSize: "14px",
                color: "#64748b",
                marginBottom: "16px",
              }}
            >
              Select a company from the sidebar or create a new one:
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <input
                type="text"
                placeholder="Company Name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isLoading && addCompany()
                }
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                }}
              />

              {/* Affiliate Code Input */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#475569",
                  }}
                >
                  Affiliate Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter affiliate code (optional)"
                  value={selectedAffiliateCodeForNewCompany || ""}
                  onChange={(e) =>
                    setSelectedAffiliateCodeForNewCompany &&
                    setSelectedAffiliateCodeForNewCompany(
                      e.target.value.toUpperCase(),
                    )
                  }
                  disabled={isLoading}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "14px",
                    textTransform: "uppercase",
                  }}
                />
                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                  If provided, the code will be validated and applied to
                  determine pricing
                </p>
              </div>

              <button
                onClick={addCompany}
                disabled={isLoading || !newCompanyName.trim()}
                style={{
                  padding: "12px 24px",
                  background:
                    isLoading || !newCompanyName.trim() ? "#94a3b8" : "#667eea",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor:
                    isLoading || !newCompanyName.trim()
                      ? "not-allowed"
                      : "pointer",
                  opacity: isLoading ? 0.7 : 1,
                  alignSelf: "flex-start",
                }}
              >
                {isLoading ? "Adding..." : "Add Company"}
              </button>
            </div>
          </>
        )}
        {/* For business users with no company selected, show loading message */}
        {currentUser.consultantType === "business" && (
          <div
            style={{ textAlign: "center", padding: "40px", color: "#64748b" }}
          >
            <p>Loading your company information...</p>
          </div>
        )}
      </>
    );
  }

  // Show the selected company
  return (
    <>
      {Array.isArray(companies) &&
        companies
          .filter((c) => c.id === selectedCompanyId)
          .map((comp) => (
            <div
              key={comp.id}
              style={{
                background: "#f8fafc",
                borderRadius: "8px",
                padding: "24px",
                border: "2px solid #667eea",
              }}
            >
              {/* Users Section - Side by Side */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  borderTop: "2px solid #cbd5e1",
                  paddingTop: "16px",
                }}
              >
                {/* Company Users (Management Team) */}
                <div
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "2px solid #10b981",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#475569",
                      marginBottom: "4px",
                    }}
                  >
                    Company Users
                  </h4>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginBottom: "12px",
                    }}
                  >
                    Management team - can view all company pages
                  </p>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#10b981",
                      marginBottom: "12px",
                    }}
                  >
                    {
                      users.filter(
                        (u) =>
                          u.companyId === comp.id && u.userType === "company",
                      ).length
                    }
                  </div>

                  {users
                    .filter(
                      (u) =>
                        u.companyId === comp.id && u.userType === "company",
                    )
                    .map((u) => {
                      const userPerm = userPermissions[u.id] || {
                        role: "user",
                        sidebarAccess: DEFAULT_ALLOWED_SECTIONS,
                      };
                      const isAdmin = userPerm.role === "admin";
                      const allowedSections = userPerm.sidebarAccess?.length
                        ? userPerm.sidebarAccess
                        : DEFAULT_ALLOWED_SECTIONS;
                      const isExpanded = Boolean(expandedCompanyUsers[u.id]);
                      const dataRoomRule = getDataRoomRule(u.id);
                      const showDataRoomOverrides = Boolean(
                        expandedDataRoomOverridesByUser[u.id],
                      );

                      return (
                        <div
                          key={u.id}
                          style={{
                            background: "#f0fdf4",
                            borderRadius: "8px",
                            padding: "12px",
                            marginBottom: "8px",
                            border: "1px solid #86efac",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "start",
                              marginBottom: "12px",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "600",
                                  color: "#1e293b",
                                  marginBottom: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>{u.name}</span>
                                {u.title && (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "500",
                                      color: "#059669",
                                      background: "#d1fae5",
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {u.title}
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#64748b",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <div>
                                  <span style={{ fontWeight: "600" }}>
                                    Email:
                                  </span>{" "}
                                  {u.email}
                                </div>
                                {u.phone && (
                                  <div>
                                    <span style={{ fontWeight: "600" }}>
                                      Phone:
                                    </span>{" "}
                                    {u.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <button
                                onClick={() => toggleCompanyUserExpanded(u.id)}
                                style={{
                                  padding: "4px 8px",
                                  background: "white",
                                  color: "#1e293b",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  fontWeight: "700",
                                }}
                              >
                                {isExpanded ? "Collapse" : "Expand"}
                              </button>
                              <button
                                onClick={() => deleteUser(u.id, comp.id)}
                                style={{
                                  padding: "4px 8px",
                                  background: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  fontWeight: "600",
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Role Selection */}
                          {isExpanded && (
                            <div
                              style={{
                                borderTop: "1px solid #d1fae5",
                                paddingTop: "12px",
                              }}
                            >
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#475569",
                                marginBottom: "8px",
                              }}
                            >
                              User Role:
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "16px",
                                marginBottom: "12px",
                              }}
                            >
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`role-${u.id}`}
                                  checked={userPerm.role === "user"}
                                  onChange={() => setUserRole(u.id, "user")}
                                  style={{ cursor: "pointer" }}
                                />
                                <span>User</span>
                              </label>
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`role-${u.id}`}
                                  checked={userPerm.role === "admin"}
                                  onChange={() => setUserRole(u.id, "admin")}
                                  style={{ cursor: "pointer" }}
                                />
                                <span>Company Admin</span>
                              </label>
                            </div>

                            {/* Sidebar Access - Only show for non-admin users */}
                            {isAdmin ? (
                              <div
                                style={{
                                  padding: "8px 12px",
                                  background: "#d1fae5",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  color: "#059669",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span>🔓</span>
                                <span>
                                  Full Access - Can access all sidebar sections
                                </span>
                              </div>
                            ) : (
                              <>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    color: "#475569",
                                    marginBottom: "6px",
                                  }}
                                >
                                  Access Rights (check sections to allow):
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "6px",
                                    fontSize: "11px",
                                  }}
                                >
                                  {ACCESSIBLE_SECTIONS.map((section) => {
                                    const isAllowed = allowedSections.includes(section.id);
                                    return (
                                    <label
                                      key={section.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isAllowed}
                                        onChange={() =>
                                          toggleAllowedSection(u.id, section.id)
                                        }
                                        style={{ cursor: "pointer" }}
                                      />
                                      <span>{section.label}</span>
                                    </label>
                                  );
                                  })}
                                </div>
                              </>
                            )}

                            <div
                              style={{
                                marginTop: "12px",
                                borderTop: "1px solid #d1fae5",
                                paddingTop: "12px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  color: "#0f766e",
                                  marginBottom: "8px",
                                }}
                              >
                                DataRoom Permissions
                              </div>
                              {loadingDataRoomPermissions ? (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#64748b",
                                    marginBottom: "8px",
                                  }}
                                >
                                  Loading DataRoom permissions...
                                </div>
                              ) : dataRoomPermissionsError ? (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#b91c1c",
                                    marginBottom: "8px",
                                  }}
                                >
                                  {dataRoomPermissionsError}
                                </div>
                              ) : (
                                <>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#64748b",
                                      marginBottom: "6px",
                                    }}
                                  >
                                    Default capabilities (applies across DataRoom):
                                  </div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                                      gap: "6px",
                                      fontSize: "11px",
                                    }}
                                  >
                                    {DATAROOM_CAPABILITIES.map((capability) => (
                                      <label
                                        key={`${u.id}-dataroom-default-${capability.id}`}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={Boolean(
                                            dataRoomRule.default[capability.id],
                                          )}
                                          onChange={() =>
                                            toggleDataRoomCapability(
                                              u.id,
                                              "default",
                                              null,
                                              capability.id,
                                            )
                                          }
                                        />
                                        <span>{capability.label}</span>
                                      </label>
                                    ))}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleDataRoomOverrideExpanded(u.id)}
                                    style={{
                                      marginTop: "8px",
                                      padding: "6px 10px",
                                      background: "white",
                                      color: "#0f766e",
                                      border: "1px solid #99f6e4",
                                      borderRadius: "6px",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {showDataRoomOverrides
                                      ? "Hide Folder/Document Overrides"
                                      : "Show Folder/Document Overrides"}
                                  </button>

                                  {showDataRoomOverrides && (
                                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                                      {dataRoomFolders.length === 0 ? (
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            color: "#64748b",
                                          }}
                                        >
                                          No DataRoom folders available yet. Enable DataRoom and add documents to configure overrides.
                                        </div>
                                      ) : (
                                        dataRoomFolders.map((folder) => (
                                          <div
                                            key={`${u.id}-folder-override-${folder.id}`}
                                            style={{
                                              border: "1px solid #d1fae5",
                                              borderRadius: "6px",
                                              padding: "8px",
                                              background: "#f8fffc",
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: "11px",
                                                fontWeight: "700",
                                                color: "#166534",
                                                marginBottom: "6px",
                                              }}
                                            >
                                              Folder: {folder.name}
                                            </div>
                                            <div
                                              style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                  "repeat(5, minmax(0, 1fr))",
                                                gap: "6px",
                                                fontSize: "11px",
                                              }}
                                            >
                                              {DATAROOM_CAPABILITIES.map((capability) => {
                                                const currentCaps =
                                                  dataRoomRule.folders[folder.id] ||
                                                  dataRoomRule.default;
                                                return (
                                                  <label
                                                    key={`${u.id}-folder-${folder.id}-${capability.id}`}
                                                    style={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "6px",
                                                      cursor: "pointer",
                                                    }}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={Boolean(
                                                        currentCaps[capability.id],
                                                      )}
                                                      onChange={() =>
                                                        toggleDataRoomCapability(
                                                          u.id,
                                                          "folder",
                                                          folder.id,
                                                          capability.id,
                                                        )
                                                      }
                                                    />
                                                    <span>{capability.label}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>

                                            {folder.documents.length > 0 && (
                                              <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
                                                {folder.documents.map((doc) => {
                                                  const docCaps =
                                                    dataRoomRule.documents[doc.id] ||
                                                    dataRoomRule.folders[folder.id] ||
                                                    dataRoomRule.default;
                                                  return (
                                                    <div
                                                      key={`${u.id}-document-${doc.id}`}
                                                      style={{
                                                        borderTop: "1px dashed #bbf7d0",
                                                        paddingTop: "6px",
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          fontSize: "11px",
                                                          color: "#166534",
                                                          marginBottom: "4px",
                                                        }}
                                                      >
                                                        Document: {doc.name}
                                                      </div>
                                                      <div
                                                        style={{
                                                          display: "grid",
                                                          gridTemplateColumns:
                                                            "repeat(5, minmax(0, 1fr))",
                                                          gap: "6px",
                                                          fontSize: "11px",
                                                        }}
                                                      >
                                                        {DATAROOM_CAPABILITIES.map(
                                                          (capability) => (
                                                            <label
                                                              key={`${u.id}-document-${doc.id}-${capability.id}`}
                                                              style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "6px",
                                                                cursor: "pointer",
                                                              }}
                                                            >
                                                              <input
                                                                type="checkbox"
                                                                checked={Boolean(
                                                                  docCaps[
                                                                    capability.id
                                                                  ],
                                                                )}
                                                                onChange={() =>
                                                                  toggleDataRoomCapability(
                                                                    u.id,
                                                                    "document",
                                                                    doc.id,
                                                                    capability.id,
                                                                  )
                                                                }
                                                              />
                                                              <span>
                                                                {capability.label}
                                                              </span>
                                                            </label>
                                                          ),
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Save Button */}
                            <button
                              onClick={() => saveUserPermissions(u.id)}
                              disabled={savingUserId === u.id}
                              style={{
                                marginTop: "12px",
                                padding: "6px 12px",
                                background:
                                  savingUserId === u.id ? "#94a3b8" : "#10b981",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: "600",
                                cursor:
                                  savingUserId === u.id
                                    ? "not-allowed"
                                    : "pointer",
                                width: "100%",
                              }}
                            >
                              {savingUserId === u.id
                                ? "Saving..."
                                : "Save Access Rights"}
                            </button>
                            <button
                              onClick={() => saveDataRoomPermissions(u.id)}
                              disabled={
                                savingDataRoomPermissionsUserId === u.id ||
                                Boolean(dataRoomPermissionsError)
                              }
                              style={{
                                marginTop: "8px",
                                padding: "6px 12px",
                                background:
                                  savingDataRoomPermissionsUserId === u.id
                                    ? "#94a3b8"
                                    : "#0f766e",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: "600",
                                cursor:
                                  savingDataRoomPermissionsUserId === u.id ||
                                  Boolean(dataRoomPermissionsError)
                                    ? "not-allowed"
                                    : "pointer",
                                width: "100%",
                                opacity: dataRoomPermissionsError ? 0.6 : 1,
                              }}
                            >
                              {savingDataRoomPermissionsUserId === u.id
                                ? "Saving..."
                                : "Save DataRoom Permissions"}
                            </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  <div
                    style={{
                      borderTop: "1px solid #d1fae5",
                      paddingTop: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <h5
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#475569",
                        marginBottom: "8px",
                      }}
                    >
                      Create New Company User
                    </h5>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "6px",
                        }}
                      >
                        <input
                          type="text"
                          name={`company_user_name_${Date.now()}`}
                          placeholder="Name"
                          value={newCompanyUserName}
                          onChange={(e) =>
                            setNewCompanyUserName(e.target.value)
                          }
                          autoComplete="off"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                        <input
                          type="text"
                          name={`company_user_title_${Date.now()}`}
                          placeholder="Title"
                          value={newCompanyUserTitle}
                          onChange={(e) =>
                            setNewCompanyUserTitle(e.target.value)
                          }
                          autoComplete="off"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "6px",
                        }}
                      >
                        <input
                          type="text"
                          name={`company_user_email_${Date.now()}`}
                          placeholder="Email"
                          value={newCompanyUserEmail}
                          onChange={(e) =>
                            setNewCompanyUserEmail(e.target.value)
                          }
                          autoComplete="off"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                        <input
                          type="tel"
                          name={`company_user_phone_${Date.now()}`}
                          placeholder="(555) 777-1212"
                          value={newCompanyUserPhone}
                          onChange={(e) =>
                            setNewCompanyUserPhone(
                              formatPhoneNumber(e.target.value),
                            )
                          }
                          autoComplete="off"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <PasswordInput
                          name={`company_user_password_${Date.now()}`}
                          placeholder="Password"
                          value={newCompanyUserPassword}
                          onChange={setNewCompanyUserPassword}
                          autoComplete="new-password"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#64748b",
                            marginTop: "2px",
                            lineHeight: "1.3",
                          }}
                        >
                          Password is required for new users. 8+ chars with
                          uppercase, lowercase, number, and special character.
                        </div>
                      </div>
                      <button
                        onClick={() => addUser(comp.id, "company")}
                        style={{
                          padding: "8px",
                          background: "#10b981",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Add Company User
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid #d1fae5",
                      paddingTop: "12px",
                      marginTop: "12px",
                    }}
                  >
                    <h5
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#475569",
                        marginBottom: "8px",
                      }}
                    >
                      Invite External User
                    </h5>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#64748b",
                        marginBottom: "8px",
                      }}
                    >
                      Invite an outside user to this company. If the email
                      already exists, access is granted. If not, create the
                      user first and they will authenticate via normal login
                      (including MFA in production).
                    </div>
                    <div style={{ display: "grid", gap: "6px" }}>
                      <input
                        type="text"
                        name="existing_company_user_name"
                        placeholder="External user name"
                        value={existingCompanyUserName}
                        onChange={(e) =>
                          setExistingCompanyUserName(e.target.value)
                        }
                        autoComplete="off"
                        style={{
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12px",
                        }}
                      />
                      <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        name="existing_company_user_email"
                        placeholder="External user email"
                        value={existingCompanyUserEmail}
                        onChange={(e) =>
                          setExistingCompanyUserEmail(e.target.value)
                        }
                        autoComplete="off"
                        style={{
                          flex: 1,
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "12px",
                        }}
                      />
                      <button
                        onClick={() => grantExistingUserAccess(comp.id, "company")}
                        style={{
                          padding: "8px 12px",
                          background: "#0f766e",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Invite User
                      </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Assessment Users */}
                <div
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "2px solid #8b5cf6",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#475569",
                      marginBottom: "4px",
                    }}
                  >
                    Team Assessment Users
                  </h4>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#64748b",
                      marginBottom: "12px",
                    }}
                  >
                    Enter employee information (max 5) at a time.
                  </p>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#8b5cf6",
                      marginBottom: "12px",
                    }}
                  >
                    {
                      users.filter(
                        (u) =>
                          u.companyId === comp.id &&
                          u.userType === "assessment",
                      ).length
                    }{" "}
                    / 5
                  </div>

                  {users
                    .filter(
                      (u) =>
                        u.companyId === comp.id && u.userType === "assessment",
                    )
                    .map((u) => {
                      const hasCompleted = assessmentRecords.some(
                        (r) =>
                          r.user?.email === u.email && r.companyId === comp.id,
                      );
                      console.log(
                        `🔍 Checking user: ${u.email}, Company: ${comp.id}, Assessment Records for this user:`,
                        assessmentRecords
                          .filter((r) => r.user?.email === u.email)
                          .map((r) => ({
                            userEmail: r.user?.email,
                            companyId: r.companyId,
                          })),
                        "hasCompleted:",
                        hasCompleted,
                      );
                      return (
                        <div
                          key={u.id}
                          style={{
                            background: "#faf5ff",
                            borderRadius: "6px",
                            padding: "8px 12px",
                            marginBottom: "6px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            border: "1px solid #ddd6fe",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "#1e293b",
                              }}
                            >
                              {u.name}
                              {u.title && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "500",
                                    color: "#64748b",
                                    marginLeft: "6px",
                                  }}
                                >
                                  ({u.title})
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>
                              {u.email}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: "600",
                                color: hasCompleted ? "#065f46" : "#991b1b",
                                background: hasCompleted
                                  ? "#d1fae5"
                                  : "#fee2e2",
                                padding: "3px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {hasCompleted ? "✓ Done" : "⚠ Not Started"}
                            </div>
                            <button
                              onClick={() => deleteUser(u.id, comp.id)}
                              style={{
                                padding: "4px 8px",
                                background: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "10px",
                                cursor: "pointer",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  {users.filter(
                    (u) =>
                      u.companyId === comp.id && u.userType === "assessment",
                  ).length < 5 ? (
                    <div
                      style={{
                        borderTop: "1px solid #ede9fe",
                        paddingTop: "12px",
                        marginTop: "12px",
                      }}
                    >
                      <h5
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "#475569",
                          marginBottom: "8px",
                        }}
                      >
                        Create New Assessment User
                      </h5>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "6px",
                          }}
                        >
                          <input
                            type="text"
                            name={`assessment_user_name_${Date.now()}`}
                            placeholder="Name"
                            value={newAssessmentUserName}
                            onChange={(e) =>
                              setNewAssessmentUserName(e.target.value)
                            }
                            autoComplete="off"
                            style={{
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                            }}
                          />
                          <input
                            type="text"
                            name={`assessment_user_title_${Date.now()}`}
                            placeholder="Title"
                            value={newAssessmentUserTitle}
                            onChange={(e) =>
                              setNewAssessmentUserTitle(e.target.value)
                            }
                            autoComplete="off"
                            style={{
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                            }}
                          />
                        </div>
                        <input
                          type="text"
                          name={`assessment_user_email_${Date.now()}`}
                          placeholder="Email"
                          value={newAssessmentUserEmail}
                          onChange={(e) =>
                            setNewAssessmentUserEmail(e.target.value)
                          }
                          autoComplete="off"
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "12px",
                          }}
                        />
                        <div style={{ gridColumn: "span 2" }}>
                          <PasswordInput
                            name={`assessment_user_password_${Date.now()}`}
                            placeholder="Password"
                            value={newAssessmentUserPassword}
                            onChange={setNewAssessmentUserPassword}
                            autoComplete="new-password"
                            style={{
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                            }}
                          />
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#64748b",
                              marginTop: "2px",
                              lineHeight: "1.3",
                            }}
                          >
                            Password is required for new users. 8+ chars with
                            uppercase, lowercase, number, and special character.
                          </div>
                        </div>
                        <button
                          onClick={() => addUser(comp.id, "assessment")}
                          style={{
                            padding: "8px",
                            background: "#8b5cf6",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                          }}
                        >
                          Add Assessment User
                        </button>
                      </div>

                      <div
                        style={{
                          borderTop: "1px solid #ede9fe",
                          paddingTop: "12px",
                          marginTop: "12px",
                        }}
                      >
                        <h5
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#475569",
                            marginBottom: "8px",
                          }}
                        >
                          Invite External User
                        </h5>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#64748b",
                            marginBottom: "8px",
                          }}
                        >
                          Invite an outside assessment user to this company.
                          If the email already exists, access is granted. If
                          not, create the user first and they will authenticate
                          via normal login (including MFA in production).
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          <input
                            type="text"
                            name="existing_assessment_user_name"
                            placeholder="External user name"
                            value={existingAssessmentUserName}
                            onChange={(e) =>
                              setExistingAssessmentUserName(e.target.value)
                            }
                            autoComplete="off"
                            style={{
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                            }}
                          />
                          <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            type="text"
                            name="existing_assessment_user_email"
                            placeholder="External user email"
                            value={existingAssessmentUserEmail}
                            onChange={(e) =>
                              setExistingAssessmentUserEmail(e.target.value)
                            }
                            autoComplete="off"
                            style={{
                              flex: 1,
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              fontSize: "12px",
                            }}
                          />
                          <button
                            onClick={() =>
                              grantExistingUserAccess(comp.id, "assessment")
                            }
                            style={{
                              padding: "8px 12px",
                              background: "#6d28d9",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Invite User
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "8px",
                        background: "#fef3c7",
                        border: "1px solid #fbbf24",
                        borderRadius: "6px",
                        fontSize: "11px",
                        color: "#92400e",
                        marginTop: "8px",
                      }}
                    >
                      ⚠ Maximum 5 assessment users reached
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
    </>
  );
}
