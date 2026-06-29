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
  homeCompanyId?: string | null;
  isExternalCompanyUser?: boolean;
  consultantId?: string | null;
  role?: string;
  userType?: string;
  companyRole?: "user" | "admin" | null;
  sidebarAccess?: string[] | null;
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

const ACCESSIBLE_SECTIONS: { id: string; label: string }[] = [
  { id: "ask-corelytics", label: "Ask Corelytics" },
  { id: "business-pulse", label: "Daily Alerts" },
  { id: "operational-dashboard", label: "Operational Dashboard" },
  { id: "company-dashboard", label: "Company Dashboard" },
  { id: "financial-reports", label: "Financial Reporting" },
  { id: "standard-reports", label: "Standard Reports" },
  { id: "valuation", label: "Valuation" },
  { id: "valuation-reports", label: "Valuation Report (CIM)" },
  { id: "expert-analysis", label: "Expert Analysis" },
  { id: "management-assessment", label: "Team Assessment" },
  { id: "dataroom", label: "Data Room" },
  { id: "digital-presence", label: "Digital Presence" },
  { id: "custom-reports", label: "Custom Reports" },
];

const DEFAULT_ALLOWED_SECTIONS = ACCESSIBLE_SECTIONS.map((s) => s.id);

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
  onUserPermissionsUpdated?: (user: User) => void;
  setSelectedCompanyId: (id: string) => void;
  userSection?: "company-users" | "team-assessment" | "all";
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
  onUserPermissionsUpdated,
  setSelectedCompanyId,
  userSection = "all",
}: CompanyDetailsTabProps) {
  // State for user permissions
  const [userPermissions, setUserPermissions] = React.useState<{
    [userId: string]: {
      role: "user" | "admin";
      sidebarAccess: string[];
    };
  }>({});
  const [selectedCompanyUsers, setSelectedCompanyUsers] = React.useState<
    Record<string, string>
  >({});
  const [expandedUserSections, setExpandedUserSections] = React.useState({
    company: true,
    external: true,
  });
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

  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" "),
    };
  };

  const updateCombinedName = (
    currentName: string,
    field: "first" | "last",
    value: string,
    setter: (name: string) => void,
  ) => {
    const { firstName, lastName } = splitName(currentName);
    const nextFirst = field === "first" ? value : firstName;
    const nextLast = field === "last" ? value : lastName;
    setter([nextFirst.trim(), nextLast.trim()].filter(Boolean).join(" "));
  };

  // Initialize permissions from users
  React.useEffect(() => {
    const permissions: typeof userPermissions = {};
    users
      .filter((u) =>
        u.companyId === selectedCompanyId &&
        (u.userType === "company" ||
          (String(u.role || "").toUpperCase() === "CONSULTANT" &&
            Boolean(
              companies.find((c) => c.id === selectedCompanyId)?.consultantId &&
                String(u.consultantId || "") ===
                  String(
                    companies.find((c) => c.id === selectedCompanyId)?.consultantId ||
                      "",
                  ),
            ))),
      )
      .forEach((u) => {
        const isConsultantTeamMember =
          String(u.role || "").toUpperCase() === "CONSULTANT";
        permissions[u.id] = {
          role: isConsultantTeamMember
            ? "admin"
            : (u as any).companyRole || "user",
          sidebarAccess: (u as any).sidebarAccess || DEFAULT_ALLOWED_SECTIONS,
        };
      });
    setUserPermissions(permissions);
  }, [users, selectedCompanyId, companies]);

  React.useEffect(() => {
    if (!selectedCompanyId) return;

    const company = companies.find((c) => c.id === selectedCompanyId);
    const companyUsers = users.filter(
      (u) =>
        u.companyId === selectedCompanyId &&
        (u.userType === "company" ||
          (String(u.role || "").toUpperCase() === "CONSULTANT" &&
            Boolean(company?.consultantId) &&
            String(u.consultantId || "") === String(company?.consultantId || ""))),
    );

    setSelectedCompanyUsers((prev) => {
      const currentUserId = prev[selectedCompanyId];
      if (currentUserId && companyUsers.some((u) => u.id === currentUserId)) {
        return prev;
      }
      if (!currentUserId) return prev;
      const next = { ...prev };
      delete next[selectedCompanyId];
      return next;
    });
  }, [users, selectedCompanyId, companies]);

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
    setSavingDataRoomPermissionsUserId(userId);
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save permissions");
      }

      if (data?.user) {
        onUserPermissionsUpdated?.(data.user);
      }

      if (!dataRoomPermissionsError) {
        const rule = getDataRoomRule(userId);
        const dataRoomResponse = await fetch("/api/dataroom/permissions", {
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
        const dataRoomData = await dataRoomResponse.json();
        if (!dataRoomResponse.ok) {
          throw new Error(
            dataRoomData?.error || "Failed to save DataRoom permissions",
          );
        }
      }

      setSelectedCompanyUsers((prev) => {
        const next = { ...prev };
        delete next[selectedCompanyId];
        return next;
      });
      alert("User permissions updated successfully!");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update user permissions"
      );
    } finally {
      setSavingUserId(null);
      setSavingDataRoomPermissionsUserId(null);
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
            <React.Fragment key={comp.id}>
              {/* Users Section */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: userSection === "all" ? "1fr 1fr" : "1fr",
                  gap: "16px",
                }}
              >
                {/* Company Users (Management Team) */}
                {userSection !== "team-assessment" && (
                <div
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    padding: "10px",
                    border: "2px solid #10b981",
                  }}
                >
                  {(() => {
                    const companyUsers = users.filter(
                      (u) =>
                        u.companyId === comp.id &&
                        (u.userType === "company" ||
                          (String(u.role || "").toUpperCase() ===
                            "CONSULTANT" &&
                            Boolean(comp.consultantId) &&
                            String(u.consultantId || "") ===
                              String(comp.consultantId || ""))),
                    );
                    const selectedUserId = selectedCompanyUsers[comp.id] || "";
                    const selectedUser =
                      companyUsers.find((u) => u.id === selectedUserId) || null;
                    const selectedUserPerm = selectedUser
                      ? userPermissions[selectedUser.id] || {
                          role: "user" as const,
                          sidebarAccess: DEFAULT_ALLOWED_SECTIONS,
                        }
                      : null;
                    const selectedAllowedSections = Array.isArray(
                      selectedUserPerm?.sidebarAccess,
                    )
                      ? selectedUserPerm.sidebarAccess
                      : DEFAULT_ALLOWED_SECTIONS;
                    const selectedDataRoomRule = selectedUser
                      ? getDataRoomRule(selectedUser.id)
                      : null;
                    const showDataRoomOverrides = selectedUser
                      ? Boolean(expandedDataRoomOverridesByUser[selectedUser.id])
                      : false;
                    const selectedUserIsConsultant =
                      String(selectedUser?.role || "").toUpperCase() ===
                      "CONSULTANT";
                    const isExternalUser = (user: User) =>
                      Boolean(user.isExternalCompanyUser) ||
                      (Boolean(user.homeCompanyId) &&
                        String(user.homeCompanyId) !== String(comp.id));
                    const directCompanyUsers = companyUsers.filter(
                      (user) => !isExternalUser(user),
                    );
                    const externalCompanyUsers = companyUsers.filter(isExternalUser);
                    const userGroups = [
                      {
                        id: "company" as const,
                        label: "Company Users",
                        users: directCompanyUsers,
                      },
                      {
                        id: "external" as const,
                        label: "External Users",
                        users: externalCompanyUsers,
                      },
                    ];

                    return (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 1.5fr",
                            gap: "10px",
                            marginBottom: "12px",
                            alignItems: "start",
                          }}
                        >
                          <div
                            style={{
                              background: "white",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              padding: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                marginBottom: "8px",
                              }}
                            >
                              <h5
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#475569",
                                  margin: 0,
                                }}
                              >
                                Create New Company User
                              </h5>
                              <div
                                style={{
                                  fontSize: "10px",
                                  color: "#1e293b",
                                  fontWeight: "600",
                                  lineHeight: "1.3",
                                  textAlign: "right",
                                }}
                              >
                                Password is required for new users. 8+ chars with uppercase, lowercase, number, and special character.
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(3, minmax(0, 1fr))",
                                gap: "6px",
                              }}
                            >
                              <input
                                type="text"
                                name={`company_user_first_name_${Date.now()}`}
                                placeholder="First Name"
                                value={splitName(newCompanyUserName).firstName}
                                onChange={(e) =>
                                  updateCombinedName(
                                    newCompanyUserName,
                                    "first",
                                    e.target.value,
                                    setNewCompanyUserName,
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
                              <input
                                type="text"
                                name={`company_user_last_name_${Date.now()}`}
                                placeholder="Last Name"
                                value={splitName(newCompanyUserName).lastName}
                                onChange={(e) =>
                                  updateCombinedName(
                                    newCompanyUserName,
                                    "last",
                                    e.target.value,
                                    setNewCompanyUserName,
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
                                gridTemplateColumns:
                                  "repeat(3, minmax(0, 1fr))",
                                gap: "6px",
                                marginTop: "6px",
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
                            </div>
                            <button
                              onClick={() => addUser(comp.id, "company")}
                              style={{
                                marginTop: "6px",
                                padding: "8px 10px",
                                background: "#0f766e",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "700",
                                cursor: "pointer",
                                minWidth: "150px",
                                width: "150px",
                                height: "34px",
                              }}
                            >
                              Add Company User
                            </button>
                          </div>

                          <div
                            style={{
                              background: "white",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              padding: "10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                marginBottom: "8px",
                              }}
                            >
                              <h5
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#475569",
                                  margin: 0,
                                }}
                              >
                                Invite External User
                              </h5>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#1e293b",
                                  fontWeight: "600",
                                  textAlign: "right",
                                }}
                              >
                                New users receive an invite link.
                              </div>
                            </div>
                            <div style={{ display: "grid", gap: "6px" }}>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                  gap: "6px",
                                }}
                              >
                                <input
                                  type="text"
                                  name="existing_company_user_first_name"
                                  placeholder="First Name"
                                  value={
                                    splitName(existingCompanyUserName).firstName
                                  }
                                  onChange={(e) =>
                                    updateCombinedName(
                                      existingCompanyUserName,
                                      "first",
                                      e.target.value,
                                      setExistingCompanyUserName,
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
                                <input
                                  type="text"
                                  name="existing_company_user_last_name"
                                  placeholder="Last Name"
                                  value={
                                    splitName(existingCompanyUserName).lastName
                                  }
                                  onChange={(e) =>
                                    updateCombinedName(
                                      existingCompanyUserName,
                                      "last",
                                      e.target.value,
                                      setExistingCompanyUserName,
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
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(2, minmax(0, 1fr))",
                                  gap: "6px",
                                }}
                              >
                                <input
                                  type="text"
                                  name="existing_company_user_email"
                                  placeholder="Email Address"
                                  value={existingCompanyUserEmail}
                                  onChange={(e) =>
                                    setExistingCompanyUserEmail(e.target.value)
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
                                  name="existing_company_user_company"
                                  placeholder="Company Name"
                                  value=""
                                  readOnly
                                  autoComplete="off"
                                  style={{
                                    padding: "8px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "12px",
                                    background: "#f8fafc",
                                    color: "#475569",
                                  }}
                                />
                              </div>
                              <button
                                onClick={() =>
                                  grantExistingUserAccess(comp.id, "company")
                                }
                                style={{
                                  padding: "8px 10px",
                                  background: "#0f766e",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                  minWidth: "150px",
                                  width: "150px",
                                  height: "34px",
                                  justifySelf: "start",
                                }}
                              >
                                Invite User
                              </button>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            overflow: "visible",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "minmax(140px, 0.7fr) minmax(150px, 0.8fr) minmax(220px, 0.9fr) minmax(340px, 1.8fr)",
                              gap: "0",
                              background: "#f8fafc",
                              borderBottom: "1px solid #e2e8f0",
                              fontSize: "11px",
                              fontWeight: "700",
                              color: "#1e293b",
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            <div style={{ padding: "8px" }}>User Name</div>
                            <div style={{ padding: "8px" }}>User Email</div>
                            <div style={{ padding: "8px" }}>Company</div>
                            <div
                              style={{
                                padding: "8px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                              }}
                            >
                              <span>Role & Access</span>
                              {selectedUser && (
                                <button
                                  onClick={() =>
                                    saveUserPermissions(selectedUser.id)
                                  }
                                  disabled={
                                    savingUserId === selectedUser.id ||
                                    savingDataRoomPermissionsUserId ===
                                      selectedUser.id
                                  }
                                  style={{
                                    padding: "8px 10px",
                                    background:
                                      savingUserId === selectedUser.id ||
                                      savingDataRoomPermissionsUserId ===
                                        selectedUser.id
                                        ? "#94a3b8"
                                        : "#0f766e",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    cursor:
                                      savingUserId === selectedUser.id ||
                                      savingDataRoomPermissionsUserId ===
                                        selectedUser.id
                                        ? "not-allowed"
                                        : "pointer",
                                    whiteSpace: "nowrap",
                                    minWidth: "150px",
                                    height: "34px",
                                  }}
                                >
                                  {savingUserId === selectedUser.id ||
                                  savingDataRoomPermissionsUserId ===
                                    selectedUser.id
                                    ? "Saving..."
                                    : "Save Access Rights"}
                                </button>
                              )}
                            </div>
                          </div>

                          {companyUsers.length === 0 ? (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#64748b",
                                padding: "14px",
                              }}
                            >
                              No company users yet.
                            </div>
                          ) : (
                            userGroups.map((group) => (
                              <React.Fragment key={group.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedUserSections((prev) => ({
                                      ...prev,
                                      [group.id]: !prev[group.id],
                                    }))
                                  }
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "9px 10px",
                                    background: "#f8fafc",
                                    border: "none",
                                    borderBottom: "1px solid #e2e8f0",
                                    color: "#1e293b",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    textAlign: "left",
                                  }}
                                >
                                  <span>
                                    {expandedUserSections[group.id] ? "v" : ">"}{" "}
                                    {group.label}
                                  </span>
                                  <span style={{ color: "#334155" }}>
                                    {group.users.length}
                                  </span>
                                </button>
                                {expandedUserSections[group.id] &&
                                  (group.users.length === 0 ? (
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#334155",
                                        padding: "12px",
                                        borderBottom: "1px solid #e2e8f0",
                                      }}
                                    >
                                      No {group.label.toLowerCase()} yet.
                                    </div>
                                  ) : (
                                    group.users.map((u) => {
                              const isSelected = selectedUser?.id === u.id;
                              const isConsultant =
                                String(u.role || "").toUpperCase() ===
                                "CONSULTANT";

                              return (
                                <div
                                  key={u.id}
                                  onClick={() =>
                                    setSelectedCompanyUsers((prev) => ({
                                      ...prev,
                                      [comp.id]: u.id,
                                    }))
                                  }
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(140px, 0.7fr) minmax(150px, 0.8fr) minmax(220px, 0.9fr) minmax(340px, 1.8fr)",
                                    alignItems: "center",
                                    borderBottom: "1px solid #e2e8f0",
                                    background: isSelected ? "#ecfeff" : "white",
                                    boxShadow: isSelected
                                      ? "inset 0 0 0 2px #0f766e"
                                      : "none",
                                    cursor: "pointer",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: "4px 8px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: "700",
                                        color: "#1e293b",
                                      }}
                                    >
                                      {u.name || u.email}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: "#1e293b",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {u.email}
                                  </div>
                                  <div
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: "12px",
                                      fontWeight: "600",
                                      color: "#1e293b",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "8px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <span>{comp.name || "Selected Company"}</span>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        deleteUser(u.id, comp.id);
                                      }}
                                      disabled={isConsultant}
                                      style={{
                                        padding: "3px 7px",
                                        background: "#dc2626",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        fontSize: "10px",
                                        cursor: isConsultant
                                          ? "not-allowed"
                                          : "pointer",
                                        fontWeight: "800",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                  <div
                                    style={{
                                      padding: "4px 8px",
                                      borderLeft: "1px solid #e2e8f0",
                                      color: "#1e293b",
                                      position: "relative",
                                      minHeight: "28px",
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {!isSelected ||
                                    !selectedUser ||
                                    !selectedUserPerm ||
                                    !selectedDataRoomRule ? (
                                      null
                                    ) : (
                                      <div
                                        style={{
                                          position: "absolute",
                                          top: "8px",
                                          left: "8px",
                                          right: "8px",
                                          zIndex: 5,
                                          background: "white",
                                          border: "1px solid #e2e8f0",
                                          borderRadius: "8px",
                                          boxShadow:
                                            "0 8px 24px rgba(15, 23, 42, 0.12)",
                                          padding: "10px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            gap: "12px",
                                            marginBottom: "10px",
                                          }}
                                        >
                                          <label
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "6px",
                                              cursor: selectedUserIsConsultant
                                                ? "not-allowed"
                                                : "pointer",
                                              fontSize: "12px",
                                              color: "#1e293b",
                                              fontWeight: "700",
                                            }}
                                          >
                                            <input
                                              type="radio"
                                              name={`role-${selectedUser.id}`}
                                              checked={
                                                selectedUserPerm.role === "user"
                                              }
                                              disabled={selectedUserIsConsultant}
                                              onChange={() =>
                                                setUserRole(selectedUser.id, "user")
                                              }
                                            />
                                            <span>User</span>
                                          </label>
                                          <label
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "6px",
                                              cursor: selectedUserIsConsultant
                                                ? "not-allowed"
                                                : "pointer",
                                              fontSize: "12px",
                                              color: "#1e293b",
                                              fontWeight: "700",
                                            }}
                                          >
                                            <input
                                              type="radio"
                                              name={`role-${selectedUser.id}`}
                                              checked={
                                                selectedUserPerm.role === "admin"
                                              }
                                              disabled={selectedUserIsConsultant}
                                              onChange={() =>
                                                setUserRole(selectedUser.id, "admin")
                                              }
                                            />
                                            <span>Company Admin</span>
                                          </label>
                                        </div>

                                        {selectedUserPerm.role === "admin" && (
                                          <div
                                            style={{
                                              fontSize: "11px",
                                              color: "#047857",
                                              fontWeight: "700",
                                              marginBottom: "8px",
                                            }}
                                          >
                                            Full access is granted for company admins.
                                          </div>
                                        )}

                                        <div
                                          style={{
                                            display: "grid",
                                            gap: "6px",
                                            fontSize: "11px",
                                          }}
                                        >
                                          {ACCESSIBLE_SECTIONS.map((section) => {
                                            const isAdmin =
                                              selectedUserPerm.role === "admin";
                                            const isAllowed =
                                              isAdmin ||
                                              selectedAllowedSections.includes(
                                                section.id,
                                              );
                                            const isDataRoom =
                                              section.id === "dataroom";
                                            return (
                                              <div key={section.id}>
                                                <label
                                                  style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "6px",
                                                    color: "#1e293b",
                                                    fontWeight: "700",
                                                    fontSize: "12px",
                                                    cursor: isAdmin
                                                      ? "not-allowed"
                                                      : "pointer",
                                                  }}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={isAllowed}
                                                    disabled={isAdmin}
                                                    onChange={() =>
                                                      toggleAllowedSection(
                                                        selectedUser.id,
                                                        section.id,
                                                      )
                                                    }
                                                  />
                                                  <span>{section.label}</span>
                                                </label>

                                                {isDataRoom && isAllowed && (
                                                  <div
                                                    style={{
                                                      margin: "6px 0 0 20px",
                                                      paddingLeft: "10px",
                                                      borderLeft:
                                                        "2px solid #e2e8f0",
                                                      display: "grid",
                                                      gap: "6px",
                                                    }}
                                                  >
                                                    {loadingDataRoomPermissions ? (
                                                      <div
                                                        style={{
                                                          color: "#334155",
                                                        }}
                                                      >
                                                        Loading DataRoom permissions...
                                                      </div>
                                                    ) : dataRoomPermissionsError ? (
                                                      <div
                                                        style={{
                                                          color: "#b91c1c",
                                                        }}
                                                      >
                                                        {dataRoomPermissionsError}
                                                      </div>
                                                    ) : (
                                                      <>
                                                        <div
                                                          style={{
                                                            color: "#1e293b",
                                                            fontWeight: "700",
                                                          }}
                                                        >
                                                          DataRoom Permissions
                                                        </div>
                                                        <div
                                                          style={{
                                                            display: "grid",
                                                            gridTemplateColumns:
                                                              "repeat(5, minmax(0, 1fr))",
                                                            gap: "6px",
                                                          }}
                                                        >
                                                          {DATAROOM_CAPABILITIES.map(
                                                            (capability) => (
                                                              <label
                                                                key={`${selectedUser.id}-dataroom-default-${capability.id}`}
                                                                style={{
                                                                  display: "flex",
                                                                  alignItems:
                                                                    "center",
                                                                  gap: "6px",
                                                                  color:
                                                                    "#1e293b",
                                                                  fontWeight:
                                                                    "700",
                                                                  fontSize:
                                                                    "12px",
                                                                  cursor:
                                                                    "pointer",
                                                                }}
                                                              >
                                                                <input
                                                                  type="checkbox"
                                                                  checked={Boolean(
                                                                    selectedDataRoomRule
                                                                      .default[
                                                                      capability
                                                                        .id
                                                                    ],
                                                                  )}
                                                                  onChange={() =>
                                                                    toggleDataRoomCapability(
                                                                      selectedUser.id,
                                                                      "default",
                                                                      null,
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

                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            toggleDataRoomOverrideExpanded(
                                                              selectedUser.id,
                                                            )
                                                          }
                                                          style={{
                                                            justifySelf: "start",
                                                            padding: "4px 7px",
                                                            background: "white",
                                                            color: "#0f172a",
                                                            border:
                                                              "1px solid #0f766e",
                                                            borderRadius: "6px",
                                                            fontSize: "11px",
                                                            fontWeight: "800",
                                                            cursor: "pointer",
                                                          }}
                                                        >
                                                          {showDataRoomOverrides
                                                            ? "Hide Folder/Document Overrides"
                                                            : "Show Folder/Document Overrides"}
                                                        </button>

                                                        {showDataRoomOverrides && (
                                                          <div
                                                            style={{
                                                              display: "grid",
                                                              gap: "6px",
                                                            }}
                                                          >
                                                            {dataRoomFolders.length ===
                                                            0 ? (
                                                              <div
                                                                style={{
                                                                  color: "#334155",
                                                                }}
                                                              >
                                                                No DataRoom folders available yet.
                                                              </div>
                                                            ) : (
                                                              dataRoomFolders.map(
                                                                (folder) => (
                                                                  <div
                                                                    key={`${selectedUser.id}-folder-override-${folder.id}`}
                                                                    style={{
                                                                      border:
                                                                        "1px solid #e2e8f0",
                                                                      borderRadius:
                                                                        "6px",
                                                                      padding: "6px",
                                                                    }}
                                                                  >
                                                                    <div
                                                                      style={{
                                                                        fontWeight:
                                                                          "700",
                                                                        color:
                                                                          "#1e293b",
                                                                        marginBottom:
                                                                          "6px",
                                                                      }}
                                                                    >
                                                                      Folder: {folder.name}
                                                                    </div>
                                                                    <div
                                                                      style={{
                                                                        display:
                                                                          "grid",
                                                                        gridTemplateColumns:
                                                                          "repeat(5, minmax(0, 1fr))",
                                                                        gap: "6px",
                                                                      }}
                                                                    >
                                                                      {DATAROOM_CAPABILITIES.map(
                                                                        (
                                                                          capability,
                                                                        ) => {
                                                                          const currentCaps =
                                                                            selectedDataRoomRule
                                                                              .folders[
                                                                              folder
                                                                                .id
                                                                            ] ||
                                                                            selectedDataRoomRule.default;
                                                                          return (
                                                                            <label
                                                                              key={`${selectedUser.id}-folder-${folder.id}-${capability.id}`}
                                                                              style={{
                                                                                display:
                                                                                  "flex",
                                                                                alignItems:
                                                                                  "center",
                                                                                gap: "6px",
                                                                                color:
                                                                                  "#1e293b",
                                                                                fontWeight:
                                                                                  "700",
                                                                                fontSize:
                                                                                  "12px",
                                                                                cursor:
                                                                                  "pointer",
                                                                              }}
                                                                            >
                                                                              <input
                                                                                type="checkbox"
                                                                                checked={Boolean(
                                                                                  currentCaps[
                                                                                    capability
                                                                                      .id
                                                                                  ],
                                                                                )}
                                                                                onChange={() =>
                                                                                  toggleDataRoomCapability(
                                                                                    selectedUser.id,
                                                                                    "folder",
                                                                                    folder.id,
                                                                                    capability.id,
                                                                                  )
                                                                                }
                                                                              />
                                                                              <span>
                                                                                {
                                                                                  capability.label
                                                                                }
                                                                              </span>
                                                                            </label>
                                                                          );
                                                                        },
                                                                      )}
                                                                    </div>
                                                                    {folder.documents
                                                                      .length >
                                                                      0 && (
                                                                      <div
                                                                        style={{
                                                                          marginTop:
                                                                            "8px",
                                                                          display:
                                                                            "grid",
                                                                          gap: "6px",
                                                                        }}
                                                                      >
                                                                        {folder.documents.map(
                                                                          (
                                                                            doc,
                                                                          ) => {
                                                                            const docCaps =
                                                                              selectedDataRoomRule
                                                                                .documents[
                                                                                doc
                                                                                  .id
                                                                              ] ||
                                                                              selectedDataRoomRule
                                                                                .folders[
                                                                                folder
                                                                                  .id
                                                                              ] ||
                                                                              selectedDataRoomRule.default;
                                                                            return (
                                                                              <div
                                                                                key={`${selectedUser.id}-document-${doc.id}`}
                                                                                style={{
                                                                                  borderTop:
                                                                                    "1px dashed #e2e8f0",
                                                                                  paddingTop:
                                                                                    "6px",
                                                                                }}
                                                                              >
                                                                                <div
                                                                                  style={{
                                                                                    color:
                                                                                      "#1e293b",
                                                                                    marginBottom:
                                                                                      "4px",
                                                                                  }}
                                                                                >
                                                                                  Document: {doc.name}
                                                                                </div>
                                                                                <div
                                                                                  style={{
                                                                                    display:
                                                                                      "grid",
                                                                                    gridTemplateColumns:
                                                                                      "repeat(5, minmax(0, 1fr))",
                                                                                    gap: "6px",
                                                                                  }}
                                                                                >
                                                                                  {DATAROOM_CAPABILITIES.map(
                                                                                    (
                                                                                      capability,
                                                                                    ) => (
                                                                                      <label
                                                                                        key={`${selectedUser.id}-document-${doc.id}-${capability.id}`}
                                                                                        style={{
                                                                                          display:
                                                                                            "flex",
                                                                                          alignItems:
                                                                                            "center",
                                                                                          gap: "6px",
                                                                                         color:
                                                                                           "#1e293b",
                                                                                         fontWeight:
                                                                                           "700",
                                                                                         fontSize:
                                                                                           "12px",
                                                                                          cursor:
                                                                                            "pointer",
                                                                                        }}
                                                                                      >
                                                                                        <input
                                                                                          type="checkbox"
                                                                                          checked={Boolean(
                                                                                            docCaps[
                                                                                              capability
                                                                                                .id
                                                                                            ],
                                                                                          )}
                                                                                          onChange={() =>
                                                                                            toggleDataRoomCapability(
                                                                                              selectedUser.id,
                                                                                              "document",
                                                                                              doc.id,
                                                                                              capability.id,
                                                                                            )
                                                                                          }
                                                                                        />
                                                                                        <span>
                                                                                          {
                                                                                            capability.label
                                                                                          }
                                                                                        </span>
                                                                                      </label>
                                                                                    ),
                                                                                  )}
                                                                                </div>
                                                                              </div>
                                                                            );
                                                                          },
                                                                        )}
                                                                      </div>
                                                                    )}
                                                                  </div>
                                                                ),
                                                              )
                                                            )}
                                                          </div>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                                    })
                                  ))}
                              </React.Fragment>
                            ))
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
                )}

                {/* Team Assessment Users */}
                {userSection !== "company-users" && (
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
                      margin: "0 0 6px 0",
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
                )}
              </div>
            </React.Fragment>
          ))}
    </>
  );
}
