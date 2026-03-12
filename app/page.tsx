'use client';

import { useState, useMemo, useEffect, useCallback, ChangeEvent } from 'react';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import { Upload, AlertCircle, TrendingUp, DollarSign, FileSpreadsheet, ArrowLeft, CreditCard, MapPin, Lock } from 'lucide-react';
import { INDUSTRY_SECTORS, SECTOR_CATEGORIES } from '../data/industrySectors';
import { assessmentData } from '../data/assessmentData';
import { authApi, companiesApi, usersApi, consultantsApi, financialsApi, assessmentsApi, profilesApi, benchmarksApi, ApiError } from '@/lib/api-client';
// Dynamic imports to prevent SSR issues with browser API dependent components
const InactivityLogout = dynamic(() => import('./components/InactivityLogout'), { ssr: false });
import { parseDateLike, monthKey, sum, pctChange, getAssetSizeCategory } from './utils/financial';
import { clamp, revenueGrowthScore_24mo, rgsAdjustmentFrom6mo } from './utils/scoring';
import { getBenchmarkValue, sixMonthGrowthFromMonthly, normalizeRows, ltmVsPrior } from './utils/data-processing';
import { exportDataReviewToExcel, exportMonthlyRatiosToExcel } from './utils/excel-export';
import type { Mappings, NormalRow, MonthlyDataRow, Company, CompanyProfile, AssessmentResponses, AssessmentNotes, AssessmentRecord, Consultant, User, FinancialDataRecord, LOBData } from './types';
import { US_STATES, KPI_TO_BENCHMARK_MAP } from './constants';
import { KPI_FORMULAS } from './constants/kpi-formulas';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';
const LoginView = dynamic(() => import('./components/auth/LoginView'), { ssr: false });
const MFAEnrollmentModal = dynamic(() => import('./components/auth/MFAEnrollmentModal'), { ssr: false });
const MFAVerificationModal = dynamic(() => import('./components/auth/MFAVerificationModal'), { ssr: false });
// Dynamic chart components
const LineChart = dynamic(() => import('./components/charts/Charts').then(mod => mod.LineChart), { ssr: false });
const ProjectionChart = dynamic(() => import('./components/charts/Charts').then(mod => mod.ProjectionChart), { ssr: false });
const CompanyDetailsModal = dynamic(() => import('./components/modals/CompanyDetailsModal'), { ssr: false });
const AddCompanyModal = dynamic(() => import('./components/modals/AddCompanyModal'), { ssr: false });
const DataReviewTab = dynamic(() => import('./components/dashboard/DataReviewTab'), { ssr: false });
const TeamManagementTab = dynamic(() => import('./components/dashboard/TeamManagementTab'), { ssr: false });
const ProfileTab = dynamic(() => import('./components/dashboard/ProfileTab'), { ssr: false });
const LOBReportingTab = dynamic(() => import('./components/dashboard/LOBReportingTab'), { ssr: false });
const DocumentsTab = dynamic(() => import('./components/dashboard/DocumentsTab'), { ssr: false });
const ConsultantDashboard = dynamic(() => import('./components/consultant/ConsultantDashboard'), { ssr: false });
const CompanyManagementTab = dynamic(() => import('./components/admin/CompanyManagementTab'), { ssr: false });
const CompanySettingsTab = dynamic(() => import('./components/admin/CompanySettingsTab'), { ssr: false });

// Feature flag for covenants module
const COVENANTS_ENABLED = process.env.NEXT_PUBLIC_COVENANTS_ENABLED === 'true' || true; // Default to enabled for development

const CovenantsTab = dynamic(() => import('./covenants/components/CovenantsTab'), { ssr: false });
const OperationsTab = dynamic(() => import('./components/operations/OperationsTab'), { ssr: false });
const DailyAlertsView = dynamic(() => import('./components/operations/DailyAlertsView'), { ssr: false });

const Header = dynamic(() => import('./components/layout/Header'), { ssr: false });
const SiteAdminDashboard = dynamic(() => import('./components/siteadmin/SiteAdminDashboard'), { ssr: false });
import { renderColumnSelector as renderColumnSelectorUtil } from './utils/import-helpers';
import { saveProjectionDefaults as saveProjectionDefaultsUtil } from './utils/projection-helpers';
const MAWelcomeView = dynamic(() => import('./components/assessment/MAWelcomeView'), { ssr: false });
const MAScoringGuideView = dynamic(() => import('./components/assessment/MAScoringGuideView'), { ssr: false });
const MAScoresSummaryView = dynamic(() => import('./components/assessment/MAScoresSummaryView'), { ssr: false });
const MAYourResultsView = dynamic(() => import('./components/assessment/MAYourResultsView'), { ssr: false });
const TextToSpeech = dynamic(() => import('./components/common/TextToSpeech'), { ssr: false });
import { parseTrialBalanceCSV, getAccountsForMapping, processTrialBalanceToMonthly, processTrialBalanceToDailySnapshotsAndLines, ACCOUNT_TYPE_CLASSIFICATIONS, type ParsedTrialBalance } from '@/lib/trial-balance-parser';
import { getTargetFieldOptions } from '@/lib/constants/sector-target-fields';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';
const AccountMappingTable = dynamic(() => import('./components/dashboard/AccountMappingTable'), { ssr: false });
const AggregatedFinancialsTab = dynamic(() => import('./components/AggregatedFinancialsTab'), { ssr: false });
const RatiosTab = dynamic(() => import('./components/RatiosTab'), { ssr: false });
const CashFlowTab = dynamic(() => import('./components/CashFlowTab'), { ssr: false });
const WorkingCapitalTab = dynamic(() => import('./components/WorkingCapitalTab'), { ssr: false });
const ProjectionsTab = dynamic(() => import('./components/ProjectionsTab'), { ssr: false });
const FinancialForecastTab = dynamic(() => import('./components/FinancialForecastTab'), { ssr: false });
const MDAView = dynamic(() => import('./components/MDAView'), { ssr: false });
const AIAnalysisView = dynamic(() => import('./components/AIAnalysisView'), { ssr: false });
const PerformanceAnalyticsOverview = dynamic(() => import('./components/performance-analytics/PerformanceAnalyticsOverview'), { ssr: false });
const FocusBoard = dynamic(() => import('./components/performance-analytics/FocusBoard'), { ssr: false });
const TrendExplorer = dynamic(() => import('./components/performance-analytics/TrendExplorer'), { ssr: false });
const AnomalyInbox = dynamic(() => import('./components/performance-analytics/AnomalyInbox'), { ssr: false });
const OpportunityWorkspace = dynamic(() => import('./components/performance-analytics/OpportunityWorkspace'), { ssr: false });
const DashboardView = dynamic(() => import('./components/DashboardView'), { ssr: false });
const FinancialScoreView = dynamic(() => import('./components/FinancialScoreView'), { ssr: false });
import GoalsView from './components/GoalsView';
import TrendAnalysisView from './components/TrendAnalysisView';
import SimpleChart from './components/SimpleChart';
import toast, { Toaster } from 'react-hot-toast';

// Constants (now imported from ./constants)

// Types
// Type definitions (now imported from ./types)

// Helper functions (now imported from ./utils/*)

// Format currency as $1,234,567 (no decimals, with commas)
const formatDollar = (value: number): string => {
  return '$' + Math.round(Math.abs(value)).toLocaleString('en-US');
};

function FinancialScorePage() {
  // State - Authentication
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginCompanyName, setLoginCompanyName] = useState('');
  const [loginCompanyAddress1, setLoginCompanyAddress1] = useState('');
  const [loginCompanyAddress2, setLoginCompanyAddress2] = useState('');
  const [loginCompanyCity, setLoginCompanyCity] = useState('');
  const [loginCompanyState, setLoginCompanyState] = useState('');
  const [loginCompanyZip, setLoginCompanyZip] = useState('');
  const [loginCompanyWebsite, setLoginCompanyWebsite] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  
  // State - MFA
  const [showMFAEnrollment, setShowMFAEnrollment] = useState(false);
  const [showMFAVerification, setShowMFAVerification] = useState(false);
  const [mfaUserId, setMfaUserId] = useState('');
  const [mfaUserEmail, setMfaUserEmail] = useState('');
  const [trustDurationDays, setTrustDurationDays] = useState<number | null>(null);
  
  // State - Consultants
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [newConsultantType, setNewConsultantType] = useState('');
  const [newConsultantFullName, setNewConsultantFullName] = useState('');
  const [newConsultantAddress, setNewConsultantAddress] = useState('');
  const [newConsultantEmail, setNewConsultantEmail] = useState('');
  const [newConsultantPhone, setNewConsultantPhone] = useState('');
  const [newConsultantPassword, setNewConsultantPassword] = useState('');
  const [newConsultantCompanyName, setNewConsultantCompanyName] = useState('');
  const [newConsultantCompanyAddress1, setNewConsultantCompanyAddress1] = useState('');
  const [newConsultantCompanyAddress2, setNewConsultantCompanyAddress2] = useState('');
  const [newConsultantCompanyCity, setNewConsultantCompanyCity] = useState('');
  const [newConsultantCompanyState, setNewConsultantCompanyState] = useState('');
  const [newConsultantCompanyZip, setNewConsultantCompanyZip] = useState('');
  const [newConsultantCompanyWebsite, setNewConsultantCompanyWebsite] = useState('');
  
  // State - Site Administrators
  const [siteAdmins, setSiteAdmins] = useState<any[]>([]);
  const [newSiteAdminFirstName, setNewSiteAdminFirstName] = useState('');
  const [newSiteAdminLastName, setNewSiteAdminLastName] = useState('');
  const [newSiteAdminEmail, setNewSiteAdminEmail] = useState('');
  const [newSiteAdminPassword, setNewSiteAdminPassword] = useState('');
  const [showAddSiteAdminForm, setShowAddSiteAdminForm] = useState(false);
  const [selectedConsultantId, setSelectedConsultantId] = useState('');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);
  
  // State - Companies & Users
  const [companies, setCompanies] = useState<Company[]>([]);

  // Safeguard to ensure companies is always an array
  const safeSetCompanies = (value: any) => {
    if (Array.isArray(value)) {
      setCompanies(value);
    } else if (value && typeof value === 'object' && value.companies && Array.isArray(value.companies)) {
      setCompanies(value.companies);
    } else {
      console.warn('Attempted to set companies to invalid value:', value);
      setCompanies([]);
    }
  };
  const [users, setUsers] = useState<User[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [selectedAffiliateCodeForNewCompany, setSelectedAffiliateCodeForNewCompany] = useState('');
  
  // State - Subscription Selection
  const [selectedSubscriptionPlan, setSelectedSubscriptionPlan] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  
  // State - Active Subscription Management
  const [activeSubscription, setActiveSubscription] = useState<any>(null);

  // Master data for dynamic categories
  const masterData = useMasterData(selectedCompanyId);
  const cogsCategories = masterData.data?.cogsCategories || [];
  const expenseCategories = masterData.data?.expenseCategories || [];

  // Clear master data cache when company changes
  useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);
  
  // Load user from localStorage and verify NextAuth session on mount
  useEffect(() => {
    if (typeof window === 'undefined' || currentUser) return;
    
    const restoreSession = async () => {
      const storedUser = localStorage.getItem('fs_currentUser');
      console.log('?? Checking localStorage for currentUser:', !!storedUser);
      
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          console.log('? User loaded from localStorage:', user.email);
          
          // Check if NextAuth session exists
          const { getSession } = await import('next-auth/react');
          const session = await getSession();
          
          if (!session) {
            console.log('?? No NextAuth session found - user will need to re-login');
            // Clear localStorage since session expired
            localStorage.removeItem('fs_currentUser');
            setIsLoggedIn(false);
            return;
          }
          
          console.log('? NextAuth session valid');
          setCurrentUser(user);
          setIsLoggedIn(true);
          
          // Load company data for company users
          if (user.userType === 'company' && user.companyId) {
            console.log('📦 Loading company data for restored session:', user.companyId);
            try {
              const response = await fetch(`/api/companies?companyId=${user.companyId}`);
              const data = await response.json();
              if (data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
                safeSetCompanies(data.companies);
                setSelectedCompanyId(user.companyId);
                console.log('✅ Loaded company for restored session:', data.companies[0].name);
              } else {
                console.error('❌ No company data returned for:', user.companyId);
              }
            } catch (loadError) {
              console.error('❌ Error loading company for restored session:', loadError);
            }
          }
        } catch (error) {
          console.error('? Failed to restore session:', error);
          localStorage.removeItem('fs_currentUser');
          setIsLoggedIn(false);
        }
      } else {
        console.log('?? No user found in localStorage');
      }
    };
    
    restoreSession();
  }, [currentUser]);
  
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [showUpdatePaymentModal, setShowUpdatePaymentModal] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [updatePaymentData, setUpdatePaymentData] = useState({
    cardNumber: '',
    cardholderName: '',
    expirationMonth: '',
    expirationYear: '',
    cvv: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
  });
  const [newUserPassword, setNewUserPassword] = useState('');
  // Separate state for Company Users
  const [newCompanyUserName, setNewCompanyUserName] = useState('');
  const [newCompanyUserTitle, setNewCompanyUserTitle] = useState('');
  const [newCompanyUserEmail, setNewCompanyUserEmail] = useState('');
  const [newCompanyUserPhone, setNewCompanyUserPhone] = useState('');
  const [newCompanyUserPassword, setNewCompanyUserPassword] = useState('');
  const [existingCompanyUserName, setExistingCompanyUserName] = useState('');
  const [existingCompanyUserEmail, setExistingCompanyUserEmail] = useState('');
  // Separate state for Assessment Users (no phone field)
  const [newAssessmentUserName, setNewAssessmentUserName] = useState('');
  const [newAssessmentUserTitle, setNewAssessmentUserTitle] = useState('');
  const [newAssessmentUserEmail, setNewAssessmentUserEmail] = useState('');
  const [newAssessmentUserPassword, setNewAssessmentUserPassword] = useState('');
  const [existingAssessmentUserName, setExistingAssessmentUserName] = useState('');
  const [existingAssessmentUserEmail, setExistingAssessmentUserEmail] = useState('');
  
  // State - Company Details
  const [showCompanyDetailsModal, setShowCompanyDetailsModal] = useState(false);
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [companyAddressStreet, setCompanyAddressStreet] = useState('');
  const [companyAddressCity, setCompanyAddressCity] = useState('');
  const [companyAddressState, setCompanyAddressState] = useState('');
  const [companyAddressZip, setCompanyAddressZip] = useState('');
  const [companyAddressCountry, setCompanyAddressCountry] = useState('USA');
  const [companyIndustrySector, setCompanyIndustrySector] = useState<number | ''>('');
  const [accountingSystem, setAccountingSystem] = useState('');
  const [companySizeCategory, setCompanySizeCategory] = useState('DEFAULT');
  const [industrySectorCategory, setIndustrySectorCategory] = useState('01');
  const [expandedCompanyInfoId, setExpandedCompanyInfoId] = useState('');
  const [isManagementAssessmentExpanded, setIsManagementAssessmentExpanded] = useState(false);
  // const [isFinancialScoreExpanded, setIsFinancialScoreExpanded] = useState(false); // Financial Score section removed from sidebar
  
  // State - Default Pricing
  const [defaultBusinessMonthlyPrice, setDefaultBusinessMonthlyPrice] = useState(195);
  const [defaultBusinessQuarterlyPrice, setDefaultBusinessQuarterlyPrice] = useState(500);
  const [defaultBusinessAnnualPrice, setDefaultBusinessAnnualPrice] = useState(1750);
  const [defaultBusinessSetupFee, setDefaultBusinessSetupFee] = useState(0);
  const [defaultConsultantMonthlyPrice, setDefaultConsultantMonthlyPrice] = useState(195);
  const [defaultConsultantQuarterlyPrice, setDefaultConsultantQuarterlyPrice] = useState(500);
  const [defaultConsultantAnnualPrice, setDefaultConsultantAnnualPrice] = useState(1750);
  const [defaultConsultantSetupFee, setDefaultConsultantSetupFee] = useState(0);
  
  // State - Projections
  const [defaultBestCaseRevMult, setDefaultBestCaseRevMult] = useState(1.5);
  const [defaultBestCaseExpMult, setDefaultBestCaseExpMult] = useState(0.7);
  const [defaultWorstCaseRevMult, setDefaultWorstCaseRevMult] = useState(0.5);
  const [defaultWorstCaseExpMult, setDefaultWorstCaseExpMult] = useState(1.3);
  const [bestCaseRevMultiplier, setBestCaseRevMultiplier] = useState(1.5);
  const [bestCaseExpMultiplier, setBestCaseExpMultiplier] = useState(0.7);
  const [worstCaseRevMultiplier, setWorstCaseRevMultiplier] = useState(0.5);
  const [worstCaseExpMultiplier, setWorstCaseExpMultiplier] = useState(1.3);
  const [showDefaultSettings, setShowDefaultSettings] = useState(false);
  
  // State - Financial Data
  const [financialDataRecords, setFinancialDataRecords] = useState<FinancialDataRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mappings>({ date: '' });
  const [error, setError] = useState<string | null>(null);
  const [isFreshUpload, setIsFreshUpload] = useState<boolean>(false);
  const [loadedMonthlyData, setLoadedMonthlyData] = useState<MonthlyDataRow[]>([]);
  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'consultant-dashboard' | 'siteadmin' | 'upload' | 'results' | 'kpis' | 'mda' | 'ai-analysis' | 'daily-alerts' | 'financial-forecast' | 'projections' | 'working-capital' | 'valuation' | 'cash-flow' | 'financial-statements' | 'trend-analysis' | 'profile' | 'goals' | 'fs-intro' | 'fs-score' | 'ma-welcome' | 'ma-questionnaire' | 'ma-your-results' | 'ma-scores-summary' | 'ma-scoring-guide' | 'ma-charts' | 'custom-print' | 'dashboard' | 'covenants' | 'operations' | 'pa-overview' | 'pa-critical-issues' | 'pa-focus-board' | 'pa-trend-explorer' | 'pa-anomaly-inbox' | 'pa-opportunity-workspace'>('login');
  
  // State - Dashboard Customization
  const [selectedDashboardWidgets, setSelectedDashboardWidgets] = useState<string[]>([]);
  const [showDashboardCustomizer, setShowDashboardCustomizer] = useState(false);


  // Check if current view is allowed for assessment users
  const isAssessmentUserViewAllowed = (view: string) => {
    if (currentUser?.userType !== 'assessment') return true;
    const allowedViews = ['ma-welcome', 'ma-questionnaire', 'ma-your-results', 'ma-scores-summary', 'ma-scoring-guide', 'ma-charts'];
    return allowedViews.includes(view);
  };

  // Company user access control (non-admin company users only).
  const COMPANY_USER_SECTIONS = ['company-dashboard', 'performance-analytics', 'valuation', 'financial-statements', 'management-assessment'] as const;
  const isCompanyUser = currentUser?.role === 'user' && currentUser?.userType === 'company';
  const isCompanyAdmin = isCompanyUser && (currentUser as any)?.companyRole === 'admin';
  const allowedSectionsForCompanyUser = useMemo(() => {
    const raw = (currentUser as any)?.sidebarAccess;
    if (!isCompanyUser || isCompanyAdmin) return null;
    // If missing, default to full access to avoid locking out users due to legacy data.
    if (!Array.isArray(raw)) return COMPANY_USER_SECTIONS as unknown as string[];
    return raw as string[];
  }, [currentUser, isCompanyUser, isCompanyAdmin]);

  const viewToCompanySection = (view: string): string | null => {
    if (view === 'dashboard') return 'company-dashboard';
    if (view === 'valuation') return 'valuation';
    if (view === 'financial-statements') return 'financial-statements';
    if (view === 'daily-alerts') return 'performance-analytics';
    if (view.startsWith('pa-')) return 'performance-analytics';
    if (view.startsWith('ma-')) return 'management-assessment';
    return null;
  };

  // Handle navigation with payment gate
  const handleNavigation = (view: string) => {
    const section = viewToCompanySection(view);
    if (section && isCompanyUser && !isCompanyAdmin) {
      const allowed = allowedSectionsForCompanyUser || (COMPANY_USER_SECTIONS as unknown as string[]);
      if (!allowed.includes(section)) {
        alert('Access Restricted\n\nYour account does not have access to this section.');
        return;
      }
    }

    if (isPaymentRequired()) {
      alert('Payment Required\n\nPlease complete your subscription payment before accessing other features.');
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('payments');
      setCurrentView('admin');
      return;
    }
    setCurrentView(view as any);
  };

  // Handle admin dashboard tab navigation with payment gate
  const handleAdminTabNavigation = (tab: 'company-management' | 'company-settings' | 'payments' | 'import-financials' | 'api-connections' | 'data-review' | 'documents' | 'data-mapping') => {
    // Payments is now a sub-tab under Company Management
    if (tab === 'payments') {
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('payments');
      return;
    }

    // Block other tabs if payment is required
    if (isPaymentRequired()) {
      alert('Payment Required\n\nPlease complete your subscription payment in Company Management > Payments before accessing other features.');
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('payments');
      return;
    }
    
    // Reset company management sub-tab when switching to company-management
    if (tab === 'company-management') {
      setCompanyManagementSubTab('profile');
    }
    
    setAdminDashboardTab(tab);
  };

  // Redirect assessment users if they try to access unauthorized views - but not during login
  // Handle pending login after business registration redirect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pendingLoginStr = sessionStorage.getItem('pendingLogin');
    if (pendingLoginStr && !isLoggedIn) {
      try {
        const { user, timestamp } = JSON.parse(pendingLoginStr);
        // Only process if less than 10 seconds old
        if (Date.now() - timestamp < 10000) {
          // Normalize role and userType to lowercase
          const normalizedUser = {
            ...user,
            role: user.role?.toLowerCase() || 'user',
            userType: user.userType?.toLowerCase(),
            consultantType: user.consultantType, // Preserve consultantType
            consultantCompanyName: user.consultantCompanyName, // Preserve consultant company name
            consultantId: user.consultantId, // Preserve consultant ID
            sidebarAccess: user.sidebarAccess ?? null,
          };
          
          setCurrentUser(normalizedUser);
          setIsLoggedIn(true);
          
          // Set appropriate view for business users (consultants)
          if (normalizedUser.role === 'consultant') {
            setCurrentView('consultant-dashboard');
            // Load companies for the consultant
            if (user.consultantId) {
              companiesApi.getAll(user.consultantId).then(({ companies: loadedCompanies }) => {
                safeSetCompanies(Array.isArray(loadedCompanies) ? loadedCompanies : []);

                let needsPayment = false;
                
                if (user.companyId && loadedCompanies && loadedCompanies.length > 0) {
                  // Business user - check their company's payment
                  const newCompany = loadedCompanies.find((c: any) => c.id === user.companyId);
                  if (newCompany) {
                    setSelectedCompanyId(newCompany.id);
                    setExpandedCompanyInfoId(newCompany.id);
                    needsPayment = !newCompany.selectedSubscriptionPlan;
                  } else {
                    // Fallback: try to select company with master data for testing
                    const companyWithMasterData = loadedCompanies.find((c: any) => c.id === 'cmgmttbfh0004qhgwm6vd9oa5');
                    if (companyWithMasterData) {
                      setSelectedCompanyId(companyWithMasterData.id);
                      setExpandedCompanyInfoId(companyWithMasterData.id);
                      needsPayment = !companyWithMasterData.selectedSubscriptionPlan;
                    }
                  }
                } else if (loadedCompanies && loadedCompanies.length > 0) {
                  // Consultant with companies
                  const firstCompany = loadedCompanies[0];
                  setSelectedCompanyId(firstCompany.id);
                  setExpandedCompanyInfoId(firstCompany.id);
                  needsPayment = !firstCompany.selectedSubscriptionPlan;
                }
                
                // Always direct to company management on login
                setAdminDashboardTab('company-management');
              }).catch(error => {
                console.error('Error loading companies:', error);
                safeSetCompanies([]); // Set empty array on error
              });
            }
          } else if (normalizedUser.role === 'siteadmin') {
            setCurrentView('siteadmin');
          } else if (normalizedUser.userType === 'assessment') {
            setCurrentView('ma-welcome');
          } else if (normalizedUser.userType === 'company') {
            // Company users land on Daily Alerts.
            setCurrentView('daily-alerts');
            // Load the company data for this user
            if (user.companyId) {
              setSelectedCompanyId(user.companyId);
              fetch(`/api/companies?companyId=${user.companyId}`)
                .then(res => res.json())
                .then(data => {
                  if (data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
                    safeSetCompanies(data.companies);
                    setSelectedCompanyId(user.companyId);
                    console.log('✅ Loaded company after registration:', data.companies[0].name);
                  } else {
                    safeSetCompanies([]);
                    console.warn('⚠️ No company found after registration');
                  }
                })
                .catch(err => {
                  console.error('Error loading company:', err);
                  safeSetCompanies([]);
                });
            }
          } else {
            setCurrentView('upload');
            // For business users without userType set, try to load their company
            if (user.companyId) {
              setSelectedCompanyId(user.companyId);
              fetch(`/api/companies?companyId=${user.companyId}`)
                .then(res => res.json())
                .then(data => {
                  if (data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
                    safeSetCompanies(data.companies);
                    setSelectedCompanyId(user.companyId);
                    console.log('✅ Loaded company for user without userType:', data.companies[0].name);
                  } else {
                    safeSetCompanies([]);
                  }
                })
                .catch(err => {
                  console.error('Error loading company:', err);
                  safeSetCompanies([]);
                });
            }
          }
        }
        // Clear the pending login data
        sessionStorage.removeItem('pendingLogin');
      } catch (error) {
        console.error('Error processing pending login:', error);
        sessionStorage.removeItem('pendingLogin');
      }
    }
  }, []);

  // Handle MFA enrollment after registration
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pendingMFAStr = sessionStorage.getItem('pendingMFAEnrollment');
    if (pendingMFAStr && !isLoggedIn) {
      try {
        const { email, password, userId, timestamp } = JSON.parse(pendingMFAStr);
        // Only process if less than 30 seconds old
        if (Date.now() - timestamp < 30000) {
          console.log('📝 Processing MFA enrollment for new user:', email);
          // Auto-login to trigger MFA enrollment
          setLoginEmail(email);
          setLoginPassword(password);
          // Clear the pending data
          sessionStorage.removeItem('pendingMFAEnrollment');
          // Trigger login which will show MFA enrollment
          handleLogin();
        } else {
          sessionStorage.removeItem('pendingMFAEnrollment');
        }
      } catch (error) {
        console.error('Error processing pending MFA enrollment:', error);
        sessionStorage.removeItem('pendingMFAEnrollment');
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser?.userType === 'assessment' && isLoggedIn && currentView !== 'login' && !isAssessmentUserViewAllowed(currentView)) {
      console.log('?? useEffect redirecting from', currentView, 'to ma-welcome');
      setCurrentView('ma-welcome');
    }
  }, [currentView, currentUser, isLoggedIn]);

  // Helper function to handle view changes for assessment users
  const handleViewChange = (newView: string) => {
    console.log('?? handleViewChange called - newView:', newView, 'userType:', currentUser?.userType, 'isAllowed:', isAssessmentUserViewAllowed(newView));
    if (currentUser?.userType === 'assessment' && !isAssessmentUserViewAllowed(newView)) {
      console.log('?? View not allowed, redirecting to ma-welcome');
      setCurrentView('ma-welcome');
    } else {
      console.log('?? Setting view to:', newView);
      setCurrentView(newView as any);
    }
  };
  const [adminDashboardTab, setAdminDashboardTab] = useState<'company-management' | 'company-settings' | 'import-financials' | 'api-connections' | 'data-review' | 'documents' | 'data-mapping' | 'goals' | 'payments'>('company-management');

  // Master data for dynamic goals
  const [masterDataCategories, setMasterDataCategories] = useState<any[]>([]);
  const [companyManagementSubTab, setCompanyManagementSubTab] = useState<'details' | 'profile' | 'payments' | 'documentation'>('profile');
  const [consultantDashboardTab, setConsultantDashboardTab] = useState<'team-management' | 'company-list' | 'documentation'>('company-list');
  const [siteAdminTab, setSiteAdminTab] = useState<'consultants' | 'businesses' | 'affiliates' | 'default-pricing' | 'billing' | 'siteadmins'>('consultants');
  const [siteAdminBusinessesLoading, setSiteAdminBusinessesLoading] = useState(false);

  // Back-compat: if something sets the legacy top-level 'payments' tab,
  // redirect it into Company Management > Payments.
  useEffect(() => {
    if (adminDashboardTab === 'payments') {
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('payments');
    }
  }, [adminDashboardTab]);
  const [expandedBusinessIds, setExpandedBusinessIds] = useState<Set<string>>(new Set());
  const [editingPricing, setEditingPricing] = useState<{[key: string]: any}>({});
  const [editingConsultantInfo, setEditingConsultantInfo] = useState<{[key: string]: any}>({});
  const [expandedConsultantInfo, setExpandedConsultantInfo] = useState<Set<string>>(new Set());
  const [companyToDelete, setCompanyToDelete] = useState<{companyId: string, businessId: string, companyName: string} | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [siteAdminViewingAs, setSiteAdminViewingAs] = useState<any>(null);
  const [showAddConsultantForm, setShowAddConsultantForm] = useState(false);
  
  // Affiliate management state
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [editingAffiliate, setEditingAffiliate] = useState<any>(null);
  const [showAddAffiliateForm, setShowAddAffiliateForm] = useState(false);
  const [expandedAffiliateId, setExpandedAffiliateId] = useState<string | null>(null);
  const [newAffiliateCode, setNewAffiliateCode] = useState({code: '', description: '', maxUses: '', expiresAt: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', setupFee: ''});
  const [editingAffiliateCode, setEditingAffiliateCode] = useState<any>(null);
  
  // Team management state
  const [consultantTeamMembers, setConsultantTeamMembers] = useState<any[]>([]);
  const [showAddTeamMemberForm, setShowAddTeamMemberForm] = useState(false);
  const [newTeamMember, setNewTeamMember] = useState({name: '', email: '', phone: '', title: '', password: ''});
  
  const [kpiDashboardTab, setKpiDashboardTab] = useState<'all-ratios' | 'priority-ratios' | 'monthly-ratios'>('all-ratios');
  const [priorityRatios, setPriorityRatios] = useState<string[]>([
    'Current Ratio', 'Quick Ratio', 'ROE', 'ROA', 'Interest Coverage', 'Debt/Net Worth'
  ]);

  // Available ratios by category for Priority Ratios tab
  const ratioCategories = {
    'Liquidity': ['Current Ratio', 'Quick Ratio'],
    'Activity': ['Inventory Turnover', 'Receivables Turnover', 'Payables Turnover', 'Days Inventory', 'Days Receivables', 'Days Payables', 'Sales/Working Capital'],
    'Coverage': ['Interest Coverage', 'Debt Service Coverage', 'Cash Flow to Debt'],
    'Leverage': ['Debt/Net Worth', 'Fixed Assets/Net Worth', 'Leverage Ratio'],
    'Operating': ['Total Asset Turnover', 'ROE', 'ROA', 'EBITDA Margin', 'EBIT Margin']
  };

  const allAvailableRatios = Object.values(ratioCategories).flat();

  // Helper function to get ratio value key for LineChart
  const getRatioValueKey = (ratioName: string): string => {
    const ratioMap: Record<string, string> = {
      'Current Ratio': 'currentRatio',
      'Quick Ratio': 'quickRatio',
      'Inventory Turnover': 'invTurnover',
      'Receivables Turnover': 'arTurnover',
      'Payables Turnover': 'apTurnover',
      'Days Inventory': 'daysInv',
      'Days Receivables': 'daysAR',
      'Days Payables': 'daysAP',
      'Sales/Working Capital': 'salesWC',
      'Interest Coverage': 'interestCov',
      'Debt Service Coverage': 'debtSvcCov',
      'Cash Flow to Debt': 'cfToDebt',
      'Debt/Net Worth': 'debtToNW',
      'Fixed Assets/Net Worth': 'fixedToNW',
      'Leverage Ratio': 'leverage',
      'Total Asset Turnover': 'totalAssetTO',
      'ROE': 'roe',
      'ROA': 'roa',
      'EBITDA Margin': 'ebitdaMargin',
      'EBIT Margin': 'ebitMargin'
    };
    return ratioMap[ratioName] || '';
  };

  // Helper function to get ratio color
  const getRatioColor = (ratioName: string): string => {
    const colorMap: Record<string, string> = {
      'Current Ratio': '#10b981',
      'Quick Ratio': '#14b8a6',
      'Inventory Turnover': '#f59e0b',
      'Receivables Turnover': '#f97316',
      'Payables Turnover': '#ef4444',
      'Days Inventory': '#fbbf24',
      'Days Receivables': '#fb923c',
      'Days Payables': '#f87171',
      'Sales/Working Capital': '#06b6d4',
      'Interest Coverage': '#8b5cf6',
      'Debt Service Coverage': '#a78bfa',
      'Cash Flow to Debt': '#c4b5fd',
      'Debt/Net Worth': '#ec4899',
      'Fixed Assets/Net Worth': '#f472b6',
      'Leverage Ratio': '#f9a8d4',
      'Total Asset Turnover': '#3b82f6',
      'ROE': '#60a5fa',
      'ROA': '#93c5fd',
      'EBITDA Margin': '#2563eb',
      'EBIT Margin': '#1e40af'
    };
    return colorMap[ratioName] || '#64748b';
  };

  // Helper function to get ratio formatter
  const getRatioFormatter = (ratioName: string): ((v: number) => string) => {
    if (ratioName.includes('Days')) {
      return (v: number) => v.toFixed(0);
    }
    return (v: number) => v.toFixed(1);
  };

  // Function to save priority ratios
  const savePriorityRatios = () => {
    localStorage.setItem('fs_priorityRatios', JSON.stringify(priorityRatios));
    alert('Priority ratios saved successfully!');
  };
  
  // State - Subscription Pricing
  const [subscriptionMonthlyPrice, setSubscriptionMonthlyPrice] = useState<number | undefined>();
  const [subscriptionQuarterlyPrice, setSubscriptionQuarterlyPrice] = useState<number | undefined>();
  const [subscriptionAnnualPrice, setSubscriptionAnnualPrice] = useState<number | undefined>();
  const [subscriptionSetupFee, setSubscriptionSetupFee] = useState<number | undefined>();

  // Affiliate pricing cache removed - pricing now stored permanently in database

  // Payments tab (now under Company Management) uses these derived values.
  const paymentsSelectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return Array.isArray(companies) ? (companies.find(c => c.id === selectedCompanyId) || null) : null;
  }, [companies, selectedCompanyId]);

  const paymentsPricing = useMemo(() => {
    const isBusinessUser =
      currentUser?.userType === 'company' ||
      currentUser?.userType === 'COMPANY' ||
      (currentUser?.role === 'user' && !currentUser?.consultantId);

    const defaultMonthly = isBusinessUser ? (defaultBusinessMonthlyPrice ?? 195) : (defaultConsultantMonthlyPrice ?? 195);
    const defaultQuarterly = isBusinessUser ? (defaultBusinessQuarterlyPrice ?? 500) : (defaultConsultantQuarterlyPrice ?? 500);
    const defaultAnnual = isBusinessUser ? (defaultBusinessAnnualPrice ?? 1750) : (defaultConsultantAnnualPrice ?? 1750);
    const defaultSetupFee = isBusinessUser ? (defaultBusinessSetupFee ?? 0) : (defaultConsultantSetupFee ?? 0);

    return {
      monthly: subscriptionMonthlyPrice ?? defaultMonthly,
      quarterly: subscriptionQuarterlyPrice ?? defaultQuarterly,
      annual: subscriptionAnnualPrice ?? defaultAnnual,
      setupFee: subscriptionSetupFee ?? defaultSetupFee,
    };
  }, [
    subscriptionMonthlyPrice,
    subscriptionQuarterlyPrice,
    subscriptionAnnualPrice,
    subscriptionSetupFee,
    defaultBusinessMonthlyPrice,
    defaultBusinessQuarterlyPrice,
    defaultBusinessAnnualPrice,
    defaultBusinessSetupFee,
    defaultConsultantMonthlyPrice,
    defaultConsultantQuarterlyPrice,
    defaultConsultantAnnualPrice,
    defaultConsultantSetupFee,
    currentUser?.userType,
    currentUser?.role,
    currentUser?.consultantId,
  ]);

  // Check if payment is required for the current company
  // Payment is required if ANY of the 3 subscription prices are > $0
  // Payment is NOT required only if ALL 3 prices are exactly $0
  const isPaymentRequired = useCallback(() => {
    if (!selectedCompanyId || !currentUser) return false;

    // If companies is not an array, assume payment is not required (avoid errors)
    if (!Array.isArray(companies)) return false;

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);
    if (!selectedCompany) {
      console.log('?? No company found - allowing access temporarily');
      return false; // Don't block if company not loaded yet
    }

    // Check dedicated pricing fields
    let monthly = selectedCompany.subscriptionMonthlyPrice;
    let quarterly = selectedCompany.subscriptionQuarterlyPrice;
    let annual = selectedCompany.subscriptionAnnualPrice;
    let setupFee = (selectedCompany as any).subscriptionSetupFee;

    // Fall back to userDefinedAllocations if dedicated fields are null/undefined
    if ((monthly === null || monthly === undefined) &&
        selectedCompany.userDefinedAllocations?.subscriptionPricing) {
      monthly = selectedCompany.userDefinedAllocations.subscriptionPricing.monthly;
      quarterly = selectedCompany.userDefinedAllocations.subscriptionPricing.quarterly;
      annual = selectedCompany.userDefinedAllocations.subscriptionPricing.annual;
    }

    // Check userDefinedAllocations for explicit free pricing flag
    const userDefinedPricing = (selectedCompany as any).userDefinedAllocations?.subscriptionPricing;
    const isExplicitlyFree = userDefinedPricing?.isFree === true;

    // If pricing is null/undefined and no userDefinedAllocations, treat as "needs default pricing" = payment required
    // Only treat as free if:
    // 1. All prices are explicitly $0, OR
    // 2. userDefinedAllocations has isFree: true (from affiliate code)
    if (monthly === null && quarterly === null && annual === null && !userDefinedPricing) {
      console.log('?? Pricing is null and no userDefinedAllocations - payment required (will use defaults)', { monthly, quarterly, annual });
      return true; // Payment required - will use default pricing
    }

    // Check if explicitly free (all prices are exactly $0 OR isFree flag is true)
    const effectiveSetupFee = setupFee ?? subscriptionSetupFee ?? 0;
    if (isExplicitlyFree || (monthly === 0 && quarterly === 0 && annual === 0 && effectiveSetupFee === 0)) {
      console.log('?? Company has $0 pricing - no payment required', { monthly, quarterly, annual, setupFee: effectiveSetupFee, isExplicitlyFree });
      return false;
    }

    // If ANY price is > $0, payment is required
    if ((monthly ?? 0) > 0 || (quarterly ?? 0) > 0 || (annual ?? 0) > 0 || effectiveSetupFee > 0) {
      console.log('?? Payment required - non-zero pricing detected', { monthly, quarterly, annual, setupFee: effectiveSetupFee });
      return true;
    }

    // If we have pricing data but it's not explicitly $0, payment required
    if (monthly !== null || quarterly !== null || annual !== null) {
      console.log('?? Payment required - has pricing data that is not free', { monthly, quarterly, annual });
      return true;
    }

    // Default: no payment required (shouldn't reach here, but safe fallback)
    return false;
  }, [selectedCompanyId, currentUser, companies, subscriptionSetupFee]);

  // State - Team Assessment
  const [assessmentResponses, setAssessmentResponses] = useState<AssessmentResponses>({});
  const [assessmentNotes, setAssessmentNotes] = useState<AssessmentNotes>({});
  const [assessmentRecords, setAssessmentRecords] = useState<AssessmentRecord[]>([]);
  const [unansweredQuestions, setUnansweredQuestions] = useState<string[]>([]);
  
  // State - Trend Analysis
  const [selectedTrendItem, setSelectedTrendItem] = useState<string>('revenue');
  const [selectedTrendItems, setSelectedTrendItems] = useState<string[]>(['Revenue', 'Gross Profit', 'Total Operating Expenses', 'Net Income']);
  const [trendAnalysisTab, setTrendAnalysisTab] = useState<'item-trends' | 'expense-analysis'>('item-trends');

  // State - Expense Analysis
  const [selectedExpenseItem, setSelectedExpenseItem] = useState<string>('total-expenses');
  const [selectedExpenseItems, setSelectedExpenseItems] = useState<string[]>(['total-expenses', 'cogs-total', 'payroll', 'rent', 'total-operating-expenses-pct']);
  
  // Helper function to get full display name for trend items
  const getTrendItemDisplayName = (item: string): string => {
    // Use centralized mapping, with fallbacks for items not in the mapping
    const centralizedName = getFieldDisplayName(item);
    if (centralizedName !== item) {
      return centralizedName;
    }
    
    // Fallback for items not in centralized mapping
    const fallbackNames: { [key: string]: string } = {
      'expense': 'Total Expenses',
      'netProfit': 'Net Profit',
      'grossProfit': 'Gross Profit',
      'ebitda': 'EBITDA',
      'ebit': 'EBIT',
      'operatingExpenseTotal': 'Operating Expense Total',
      'nonOperatingIncome': 'Non-Operating Income',
      'extraordinaryItems': 'Extraordinary Items',
    };
    
    return fallbackNames[item] || item.charAt(0).toUpperCase() + item.slice(1).replace(/([A-Z])/g, ' $1');
  };

  // Helper function to get display name for expense analysis items
  const getExpenseFieldDisplayName = (item: string): string => {
    // Convert kebab-case to camelCase for centralized mapping
    const camelCaseItem = item.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    const centralizedName = getFieldDisplayName(camelCaseItem);
    if (centralizedName !== camelCaseItem) {
      return centralizedName;
    }
    
    // Fallback for items not in centralized mapping
    const fallbackNames: { [key: string]: string } = {
      'total-expenses': 'Total Expenses',
      'total-operating-expenses-pct': 'Total Operating Expenses (%)',
      'cogs-total': getFieldDisplayName('cogsTotal'),
      'cogs-payroll': getFieldDisplayName('cogsPayroll'),
      'cogs-owner-pay': getFieldDisplayName('cogsOwnerPay'),
      'cogs-contractors': getFieldDisplayName('cogsContractors'),
      'cogs-materials': getFieldDisplayName('cogsMaterials'),
      'cogs-commissions': getFieldDisplayName('cogsCommissions'),
      'cogs-other': getFieldDisplayName('cogsOther'),
      'sales-expense': getFieldDisplayName('salesExpense'),
    };

    return fallbackNames[item] || item.charAt(0).toUpperCase() + item.slice(1).replace(/-/g, ' ');
  };

  // State - Valuation
  const [sdeMultiplier, setSdeMultiplier] = useState(2.5);
  const [ebitdaMultiplier, setEbitdaMultiplier] = useState(5.0);
  const [dcfDiscountRate, setDcfDiscountRate] = useState(10.0);
  const [dcfTerminalGrowth, setDcfTerminalGrowth] = useState(2.0);
  const [valuationSaveStatus, setValuationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [valuationMethodTab, setValuationMethodTab] = useState<'sde' | 'ebitda' | 'dcf'>('sde');
  const [sdeManualInputs, setSdeManualInputs] = useState<{
    ownerCompOther?: number;
    personalTravel?: number;
    familyPayroll?: number;
    autoLeases?: number;
    mealsEntertainment?: number;
    clubDues?: number;
    personalOther?: number;
    legalSettlements?: number;
    majorRepairs?: number;
    consulting?: number;
    erpInstall?: number;
    relocation?: number;
    covidCosts?: number;
    nonRecurringOther?: number;
    assetSales?: number;
    insuranceProceeds?: number;
    oneTimeContract?: number;
    oneTimeRevenueOther?: number;
    marketReplacementSalary?: number;
  }>({});

  // State - Goals
  const [expenseGoals, setExpenseGoals] = useState<{[key: string]: number}>({});
  const [goalsSaveStatus, setGoalsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // State - Industry Benchmarks
  const [benchmarks, setBenchmarks] = useState<any[]>([]);

  // State - Company Profiles
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfile[]>([]);
  
  // State - QuickBooks Raw Data
  const [qbRawData, setQbRawData] = useState<any>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  
  // State - CSV Trial Balance Data
  const [csvTrialBalanceData, setCsvTrialBalanceData] = useState<any>(null);
  const [latestFinancialSource, setLatestFinancialSource] = useState<string | null>(null);
  const [hasSavedCsvInLocalStorage, setHasSavedCsvInLocalStorage] = useState(false);

  const handleTrialBalanceCsvSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('?? CSV File selected');
    const file = e.target.files?.[0];
    if (!file) {
      console.log('? No file selected');
      return;
    }

    console.log('? File:', file.name, 'Size:', file.size, 'Company:', selectedCompanyId);
    console.log('?? Current User:', currentUser?.email || 'NOT SET');

    try {
      console.log('?? Reading file text...');
      const text = await file.text();
      console.log('? File read, length:', text.length);

      console.log('?? Parsing Trial Balance CSV...');
      const parsed = parseTrialBalanceCSV(text, selectedCompanyId);
      console.log('? Parsed successfully:', parsed);

      const csvData = {
        ...parsed,
        _companyId: selectedCompanyId,
        fileName: file.name,
      };

      console.log('?? Setting csvTrialBalanceData state...');
      setCsvTrialBalanceData(csvData);

      console.log('?? Saving to localStorage...');
      localStorage.setItem(`csvTrialBalance_${selectedCompanyId}`, JSON.stringify(csvData));
      setHasSavedCsvInLocalStorage(true);

      setError(null);
      console.log('? CSV upload complete!');
    } catch (err: any) {
      console.error('? Error parsing CSV:', err);
      setError(`Failed to parse Trial Balance CSV: ${err.message}`);
      setCsvTrialBalanceData(null);
    } finally {
      // allow re-selecting the same file
      e.target.value = '';
    }
  };

  // State - QuickBooks Connection
  const [qbConnected, setQbConnected] = useState(false);

  // State - Xero Connection
  const [xeroConnected, setXeroConnected] = useState(false);
  const [xeroStatus, setXeroStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ERROR' | 'EXPIRED' | 'NOT_CONNECTED'>('NOT_CONNECTED');
  const [xeroLastSync, setXeroLastSync] = useState<Date | null>(null);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [xeroError, setXeroError] = useState<string | null>(null);
  
  // State - Infor M3 Connection
  const [inforConnected, setInforConnected] = useState(false);
  const [inforStatus, setInforStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ERROR' | 'EXPIRED' | 'NOT_CONNECTED'>('NOT_CONNECTED');
  const [inforLastSync, setInforLastSync] = useState<Date | null>(null);
  const [inforError, setInforError] = useState<string | null>(null);
  const [inforBusy, setInforBusy] = useState(false);
  const [inforCredentials, setInforCredentials] = useState({
    tenantId: '',
    clientName: '',
    clientId: '',
    clientSecret: '',
    ionApiBaseUrl: '',
    ssoBaseUrl: '',
    oauthAuthPath: '',
    oauthTokenPath: '',
    oauthRevokePath: '',
    serviceAccountAccessKey: '',
    serviceAccountSecretKey: '',
  });
  const [inforProbePath, setInforProbePath] = useState('/APR_PRD/M3/m3api-rest/execute/MNS150MI/GetUserData');
  const [inforProbeSummary, setInforProbeSummary] = useState<string | null>(null);
  const [inforCaoPulling, setInforCaoPulling] = useState(false);
  const [inforCaoMessage, setInforCaoMessage] = useState<string | null>(null);
  const [inforLastCaoPullAt, setInforLastCaoPullAt] = useState<Date | null>(null);
  const [inforLastCaoPulledBy, setInforLastCaoPulledBy] = useState<string | null>(null);
  // State - Financial Statements
  const [statementType, setStatementType] = useState<'income-statement' | 'balance-sheet' | 'income-statement-percent'>('income-statement');
  const [statementPeriod, setStatementPeriod] = useState<'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years'>('current-month');
  const [financialStatementsTab, setFinancialStatementsTab] = useState<'aggregated' | 'line-of-business'>('aggregated');
  const [selectedLineOfBusiness, setSelectedLineOfBusiness] = useState<string>('all');
  const [statementDisplay, setStatementDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [cashFlowDisplay, setCashFlowDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');

  // State - MD&A Tabs
  const [mdaTab, setMdaTab] = useState<'executive-summary' | 'strengths-insights' | 'key-metrics'>('executive-summary');
  
  // State - Formula Popup
  const [showFormulaPopup, setShowFormulaPopup] = useState<string | null>(null);

  // State - AI Mapping
  const [aiMappings, setAiMappings] = useState<any[]>([]);
  const [isGeneratingMappings, setIsGeneratingMappings] = useState(false);
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [showOnlyActionableMappings, setShowOnlyActionableMappings] = useState(true);
  const [mappingSourceSummary, setMappingSourceSummary] = useState<{
    total: number;
    new: number;
    changed: number;
    inactive: number;
    unmapped: number;
    lastSeedAt: string | null;
  } | null>(null);
  
  // State - Lines of Business
  const [linesOfBusiness, setLinesOfBusiness] = useState<LOBData[]>([]);
  const [userDefinedAllocations, setUserDefinedAllocations] = useState<{ lobName: string; percentage: number }[]>([]);
  const [showMappingSection, setShowMappingSection] = useState(false);
  const [isProcessingMonthlyData, setIsProcessingMonthlyData] = useState(false);
  const [isPublishingMonthlyData, setIsPublishingMonthlyData] = useState(false);
  const [publishMonthInput, setPublishMonthInput] = useState<string>(() => {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    return `${year}-${String(month).padStart(2, '0')}`;
  });
  const [apiFinancialTargetMonth, setApiFinancialTargetMonth] = useState<string>(() => {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    return `${year}-${String(month).padStart(2, '0')}`;
  });
  const [apiFinancialImportMode, setApiFinancialImportMode] = useState<'through' | 'only'>('through');
  const [erpCaoThroughMonth, setErpCaoThroughMonth] = useState<string>(() => {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();
    return `${year}-${String(month).padStart(2, '0')}`;
  });
  const [erpCaoLoading, setErpCaoLoading] = useState(false);
  const [erpCaoUploadFile, setErpCaoUploadFile] = useState<File | null>(null);
  const [openTargetFieldDropdown, setOpenTargetFieldDropdown] = useState<number | null>(null);
  const [qbStatus, setQbStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ERROR' | 'EXPIRED' | 'NOT_CONNECTED'>('NOT_CONNECTED');
  const [qbLastSync, setQbLastSync] = useState<Date | null>(null);
  const [qbSyncing, setQbSyncing] = useState(false);
  const [qbError, setQbError] = useState<string | null>(null);
  

  // State - API Loading & Errors
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // State - Custom Print Package
  const defaultPrintPackageSelections = {
    mda: false,
    priorityRatios: false,
    workingCapital: false,
    dashboard: false,
    cashFlow4Quarters: false,
    cashFlow3Years: false,
    incomeStatement12MonthsQuarterly: false,
    incomeStatement3YearsAnnual: false,
    balanceSheet12MonthsQuarterly: false,
    balanceSheet3YearsAnnual: false,
    profile: false,
    opsDashboard: false,
    opsCashForecast: false,
    opsCashBasisIncomeStatementForecast: false,
    opsCashBasisCashForecast: false,
    opsCashBasisGraphs: false,
    opsAccrualIncomeStatementForecast: false,
    opsAccrualCashForecast: false,
    opsAccrualGraphs: false,
    opsCustomers: false,
    opsARAging: false,
    opsAPAging: false,
    opsProducts: false,
    opsInventory: false,
    opsDailyFinancials: false
  };
  const [printPackageSelections, setPrintPackageSelections] = useState(defaultPrintPackageSelections);
  const defaultPrintPackageOrientations = {
    mda: 'portrait',
    priorityRatios: 'portrait',
    workingCapital: 'landscape',
    dashboard: 'landscape',
    cashFlow4Quarters: 'landscape',
    cashFlow3Years: 'landscape',
    incomeStatement12MonthsQuarterly: 'landscape',
    incomeStatement3YearsAnnual: 'landscape',
    balanceSheet12MonthsQuarterly: 'landscape',
    balanceSheet3YearsAnnual: 'landscape',
    profile: 'portrait',
    opsDashboard: 'landscape',
    opsCashForecast: 'landscape',
    opsCashBasisIncomeStatementForecast: 'landscape',
    opsCashBasisCashForecast: 'landscape',
    opsCashBasisGraphs: 'landscape',
    opsAccrualIncomeStatementForecast: 'landscape',
    opsAccrualCashForecast: 'landscape',
    opsAccrualGraphs: 'landscape',
    opsCustomers: 'landscape',
    opsARAging: 'landscape',
    opsAPAging: 'landscape',
    opsProducts: 'landscape',
    opsInventory: 'landscape',
    opsDailyFinancials: 'landscape'
  } as const;
  type PrintPackageKey = keyof typeof defaultPrintPackageSelections;
  const [printPackageOrientations, setPrintPackageOrientations] = useState<Record<PrintPackageKey, 'portrait' | 'landscape'>>(
    defaultPrintPackageOrientations
  );
  const [operationsPrintConfig, setOperationsPrintConfig] = useState<{
    tab: string;
    forecastBasisTab?: 'cash-basis' | 'accrual-basis';
    forecastSubTab?: 'income-statement-forecast' | 'cash-forecast' | 'graphs';
  } | null>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isPrintingPackage, setIsPrintingPackage] = useState(false);

  const updatePrintSelection = (key: PrintPackageKey, checked: boolean) => {
    setPrintPackageSelections(prev => ({ ...prev, [key]: checked }));
  };

  const updatePrintOrientation = (key: PrintPackageKey, orientation: 'portrait' | 'landscape') => {
    setPrintPackageOrientations(prev => ({ ...prev, [key]: orientation }));
  };

  const handleExportMdaToWord = async (executiveSummaryText: string, mdaAnalysis: { strengths: string[]; weaknesses: string[]; insights: string[] }) => {
    try {
      const response = await fetch('/api/mda/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          executiveSummary: executiveSummaryText,
          strengths: mdaAnalysis.strengths,
          weaknesses: mdaAnalysis.weaknesses,
          insights: mdaAnalysis.insights,
        }),
      });

      if (!response.ok) {
        console.error('Failed to export MD&A:', await response.text());
        alert('Unable to export MD&A to Word. Please try again.');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCompanyName =
        (companyName || 'Company').toString().replace(/[^a-zA-Z0-9 \-_.]/g, '').trim() || 'Company';
      link.download = `MDA - ${safeCompanyName}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting MD&A:', error);
      alert('An unexpected error occurred while exporting MD&A.');
    }
  };


  // Reload companies data when accessing payments tab to get fresh pricing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const consultantId = currentUser?.consultantId;
    const isPaymentsActive =
      (adminDashboardTab === 'company-management' && companyManagementSubTab === 'payments') ||
      adminDashboardTab === 'payments'; // Back-compat if any legacy state sets it
    if (isPaymentsActive && consultantId && selectedCompanyId) {
      const refreshCompanyData = async () => {
        try {
          const fetchedCompanies = await companiesApi.getAll(consultantId);
          safeSetCompanies(fetchedCompanies);
        } catch (error) {
          console.error('Error refreshing company data:', error);
        }
      };
      refreshCompanyData();
    }
  }, [adminDashboardTab, companyManagementSubTab, selectedCompanyId]);

  // Load subscription details when accessing payments tab
  useEffect(() => {
    const loadSubscriptionDetails = async () => {
      const isPaymentsActive =
        (adminDashboardTab === 'company-management' && companyManagementSubTab === 'payments') ||
        adminDashboardTab === 'payments'; // Back-compat if any legacy state sets it
      if (isPaymentsActive && selectedCompanyId) {
        setLoadingSubscription(true);
        try {
          const response = await fetch(`/api/subscriptions?companyId=${selectedCompanyId}`);
          const data = await response.json();
          
          if (data.subscription) {
            setActiveSubscription(data.subscription);
          } else {
            setActiveSubscription(null);
          }
        } catch (error) {
          console.error('Error loading subscription:', error);
          setActiveSubscription(null);
        } finally {
          setLoadingSubscription(false);
        }
      }
    };

    loadSubscriptionDetails();
  }, [adminDashboardTab, companyManagementSubTab, selectedCompanyId]);

  // Update payment method handler
  const handleUpdatePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
      alert('No company selected');
      return;
    }
    
    setUpdatingPayment(true);
    
    try {
      const response = await fetch('/api/subscriptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          cardNumber: updatePaymentData.cardNumber.replace(/\s/g, ''),
          cardholderName: updatePaymentData.cardholderName,
          expirationMonth: updatePaymentData.expirationMonth.padStart(2, '0'),
          expirationYear: updatePaymentData.expirationYear,
          cvv: updatePaymentData.cvv,
          billingAddress: {
            street: updatePaymentData.billingStreet,
            city: updatePaymentData.billingCity,
            state: updatePaymentData.billingState,
            zip: updatePaymentData.billingZip,
          },
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('Payment method updated successfully!');
        setShowUpdatePaymentModal(false);
        // Reset form
        setUpdatePaymentData({
          cardNumber: '',
          cardholderName: '',
          expirationMonth: '',
          expirationYear: '',
          cvv: '',
          billingStreet: '',
          billingCity: '',
          billingState: '',
          billingZip: '',
        });
        // Reload subscription details
        const subResponse = await fetch(`/api/subscriptions?companyId=${selectedCompanyId}`);
        const subData = await subResponse.json();
        if (subData.subscription) {
          setActiveSubscription(subData.subscription);
        }
      } else {
        alert(`Failed to update payment method\n\n${result.error || 'Please try again or contact support.'}`);
      }
    } catch (error) {
      console.error('Update payment method error:', error);
      alert('An error occurred while updating your payment method. Please try again.');
    } finally {
      setUpdatingPayment(false);
    }
  };

  // Delete company handler
  const handleDeleteCompany = async () => {
    if (!companyToDelete) return;

    const normalizedRole = String(currentUser?.role || '').toUpperCase();
    const canDeleteCompany = normalizedRole === 'CONSULTANT' || normalizedRole === 'SITEADMIN';
    if (!canDeleteCompany) {
      alert('Only consultants and site admins can delete companies.');
      setShowDeleteConfirmation(false);
      setCompanyToDelete(null);
      return;
    }

    console.log('Attempting to delete company:', companyToDelete);

    try {
      const response = await fetch(`/api/companies/${companyToDelete.companyId}`, {
        method: 'DELETE',
        headers: {
          'x-confirm-delete': 'true',
        },
      });

      console.log('Delete response status:', response.status);
      const result = await response.json();
      console.log('Delete result:', result);

      // Only update local UI after server confirms success.
      if (result.success || response.status === 404) {
        const message = result.hidden
          ? `Company "${companyToDelete.companyName}" has been removed from your dashboard.`
          : result.softDelete
          ? `Company "${companyToDelete.companyName}" has been marked as deleted.`
          : result.success
          ? `Company "${companyToDelete.companyName}" has been deleted successfully.`
          : `Company "${companyToDelete.companyName}" has been removed (already deleted from database).`;

        alert(message);

        console.log('Before delete - companies:', companies.length, 'consultants:', consultants.length);

        // Always remove the company from the UI, regardless of server response
        // This ensures the company disappears from the user's view immediately
        safeSetCompanies(Array.isArray(companies) ? companies.filter(c => c.id !== companyToDelete.companyId) : []);

        // Clear localStorage companies data to prevent reappearance on navigation
        if (typeof window !== 'undefined') {
          localStorage.removeItem('fs_companies');
          console.log('??ï¸ Cleared localStorage companies data after deletion');
        }

        // Force reload companies from API to ensure deletion took effect
        if (currentUser?.role === 'consultant' && currentUser?.consultantId) {
          console.log('?? Reloading companies from API after deletion');
          setTimeout(async () => {
            try {
              const { companies: freshCompanies } = await companiesApi.getAll(currentUser.consultantId);
              safeSetCompanies(freshCompanies || []);
              console.log('? Reloaded companies after deletion:', freshCompanies?.length || 0, 'companies');
            } catch (error) {
              console.error('? Failed to reload companies after deletion:', error);
            }
          }, 1000); // Small delay to ensure deletion is processed
        }

        // Remove the business/consultant from the consultants list
        setConsultants(Array.isArray(consultants) ? consultants.filter(c => c.id !== companyToDelete.businessId) : []);

        console.log('After delete - filtered companies:', Array.isArray(companies) ? companies.filter(c => c.id !== companyToDelete.companyId).length : 0);
        console.log('After delete - filtered consultants:', Array.isArray(consultants) ? consultants.filter(c => c.id !== companyToDelete.businessId).length : 0);

        // Close the confirmation dialog
        setShowDeleteConfirmation(false);
        setCompanyToDelete(null);
      } else {
        const errorMessage = result?.error || 'Delete request was rejected by the server.';
        alert(`Could not delete company "${companyToDelete.companyName}". ${errorMessage}`);
        setShowDeleteConfirmation(false);
        setCompanyToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('An error occurred while deleting the company');
    }
  };

  // Load from localStorage (DEPRECATED - will be removed)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = {
      consultants: localStorage.getItem('fs_consultants'),
      companies: localStorage.getItem('fs_companies'),
      users: localStorage.getItem('fs_users'),
      currentUser: localStorage.getItem('fs_currentUser'),
      records: localStorage.getItem('fs_financialDataRecords'),
      selectedCompany: localStorage.getItem('fs_selectedCompanyId'),
      defaults: localStorage.getItem('fs_projectionDefaults'),
      assessmentResponses: localStorage.getItem('fs_assessmentResponses'),
      assessmentNotes: localStorage.getItem('fs_assessmentNotes'),
      assessmentRecords: localStorage.getItem('fs_assessmentRecords'),
      companyProfiles: localStorage.getItem('fs_companyProfiles'),
      priorityRatios: localStorage.getItem('fs_priorityRatios')
    };
    
    // Check user type first to determine if we should load assessment data
    const savedUser = saved.currentUser ? JSON.parse(saved.currentUser) : null;
    const isAssessmentUser = savedUser?.userType === 'assessment';
    
    if (saved.consultants) setConsultants(JSON.parse(saved.consultants));
    if (saved.companies) {
      const parsed = JSON.parse(saved.companies);
      safeSetCompanies(Array.isArray(parsed) ? parsed : []);
    }
    if (saved.users) setUsers(JSON.parse(saved.users));
    if (saved.records) setFinancialDataRecords(JSON.parse(saved.records));
    if (saved.selectedCompany) setSelectedCompanyId(saved.selectedCompany);
    // Don't load assessment responses from localStorage for assessment users - they'll load from DB
    if (saved.assessmentResponses && !isAssessmentUser) setAssessmentResponses(JSON.parse(saved.assessmentResponses));
    if (saved.assessmentNotes && !isAssessmentUser) setAssessmentNotes(JSON.parse(saved.assessmentNotes));
    if (saved.assessmentRecords) setAssessmentRecords(JSON.parse(saved.assessmentRecords));
    if (saved.companyProfiles) setCompanyProfiles(JSON.parse(saved.companyProfiles));
    if (saved.priorityRatios) setPriorityRatios(JSON.parse(saved.priorityRatios));
    
    if (saved.defaults) {
      const d = JSON.parse(saved.defaults);
      setDefaultBestCaseRevMult(d.bestCaseRev || 1.5);
      setDefaultBestCaseExpMult(d.bestCaseExp || 0.7);
      setDefaultWorstCaseRevMult(d.worstCaseRev || 0.5);
      setDefaultWorstCaseExpMult(d.worstCaseExp || 1.3);
      setBestCaseRevMultiplier(d.bestCaseRev || 1.5);
      setBestCaseExpMultiplier(d.bestCaseExp || 0.7);
      setWorstCaseRevMultiplier(d.worstCaseRev || 0.5);
      setWorstCaseExpMultiplier(d.worstCaseExp || 1.3);
    }
    
    if (saved.currentUser) {
      const user = JSON.parse(saved.currentUser);
      
      // Don't auto-login assessment users from localStorage - they should login fresh each time
      if (user.userType === 'assessment') {
        localStorage.removeItem('fs_currentUser');
        return;
      }
      
      setCurrentUser(user);
      setIsLoggedIn(true);
      
      // Set appropriate default view based on user type
      if (user.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else if (user.role === 'consultant') {
        setCurrentView('consultant-dashboard');
      } else if ((user.userType || '').toLowerCase() === 'company') {
        setCurrentView('daily-alerts');
      } else {
        setCurrentView('upload');
      }
    }
  }, []);

  useEffect(() => { if (typeof window !== 'undefined' && consultants.length > 0) localStorage.setItem('fs_consultants', JSON.stringify(consultants)); }, [consultants]);
  useEffect(() => { if (typeof window !== 'undefined' && companies.length > 0) localStorage.setItem('fs_companies', JSON.stringify(companies)); }, [companies]);
  useEffect(() => { if (typeof window !== 'undefined' && users.length > 0) localStorage.setItem('fs_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { if (typeof window !== 'undefined' && currentUser) localStorage.setItem('fs_currentUser', JSON.stringify(currentUser)); }, [currentUser]);
  useEffect(() => { if (typeof window !== 'undefined' && financialDataRecords.length > 0) localStorage.setItem('fs_financialDataRecords', JSON.stringify(financialDataRecords)); }, [financialDataRecords]);

  useEffect(() => { if (typeof window !== 'undefined' && Object.keys(assessmentResponses).length > 0 && currentUser?.userType !== 'assessment') localStorage.setItem('fs_assessmentResponses', JSON.stringify(assessmentResponses)); }, [assessmentResponses, currentUser]);
  useEffect(() => { if (typeof window !== 'undefined' && Object.keys(assessmentNotes).length > 0 && currentUser?.userType !== 'assessment') localStorage.setItem('fs_assessmentNotes', JSON.stringify(assessmentNotes)); }, [assessmentNotes, currentUser]);
  useEffect(() => { if (typeof window !== 'undefined' && assessmentRecords.length > 0) localStorage.setItem('fs_assessmentRecords', JSON.stringify(assessmentRecords)); }, [assessmentRecords]);
  useEffect(() => { if (typeof window !== 'undefined' && companyProfiles.length > 0) localStorage.setItem('fs_companyProfiles', JSON.stringify(companyProfiles)); }, [companyProfiles]);
  useEffect(() => { if (typeof window !== 'undefined' && priorityRatios.length > 0) localStorage.setItem('fs_priorityRatios', JSON.stringify(priorityRatios)); }, [priorityRatios]);
  
  // Fetch team members when viewing team management tab
  useEffect(() => {
    if (currentUser?.role === 'consultant' && currentUser?.consultantId && currentView === 'consultant-dashboard') {
      fetchTeamMembers();
    }
  }, [currentUser, currentView]);

  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem('fs_selectedCompanyId', selectedCompanyId);
      const record = financialDataRecords.find(r => r.companyId === selectedCompanyId);
      if (record) {
        setIsFreshUpload(false);
        setRawRows(record.rawRows);
        setMapping(record.mapping);
        setFile({ name: record.fileName } as File);
        setColumns(record.rawRows.length > 0 ? Object.keys(record.rawRows[0]) : []);
      } else {
        setRawRows([]);
        setMapping({ date: '' });
        setFile(null);
        setColumns([]);
        setIsFreshUpload(false);
      }
    }
  }, [selectedCompanyId, financialDataRecords]);

  // Load expense goals when Goals, Trend Analysis, or MD&A view is accessed
  useEffect(() => {
    if (selectedCompanyId && (currentView === 'goals' || currentView === 'trend-analysis' || currentView === 'mda')) {
      console.log('?? Loading expense goals for company:', selectedCompanyId);
      // Reset to empty first, so fields are blank while loading
      setExpenseGoals({});
      
      fetch(`/api/expense-goals?companyId=${selectedCompanyId}`)
        .then(res => res.json())
        .then(data => {
          console.log('?? Expense goals loaded:', data);
          if (data.success && data.goals) {
            // Filter out any zero or invalid values so fields stay blank
            const filteredGoals: {[key: string]: number} = {};
            Object.entries(data.goals).forEach(([key, value]) => {
              if (typeof value === 'number' && value > 0) {
                filteredGoals[key] = value;
              }
            });
            setExpenseGoals(filteredGoals);
          } else {
            // Keep empty if no goals found for this company
            setExpenseGoals({});
          }
        })
        .catch(err => {
          console.error('? Error loading expense goals:', err);
          // Keep empty on error
          setExpenseGoals({});
        });
    }
  }, [selectedCompanyId, currentView]);

  // Load valuation settings when company changes
  useEffect(() => {
    if (selectedCompanyId) {
      setSdeManualInputs({});
      fetch(`/api/valuation-settings?companyId=${selectedCompanyId}`)
        .then(res => res.json())
        .then(data => {
          console.log('?? Valuation settings loaded:', data);
          setSdeMultiplier(data.sdeMultiplier || 2.5);
          setEbitdaMultiplier(data.ebitdaMultiplier || 5.0);
          setDcfDiscountRate(data.dcfDiscountRate || 10.0);
          setDcfTerminalGrowth(data.dcfTerminalGrowth || 2.0);
          setSdeManualInputs(
            data?.sdeManualInputs && typeof data.sdeManualInputs === 'object'
              ? data.sdeManualInputs
              : {}
          );
        })
        .catch(err => {
          console.error('? Error loading valuation settings:', err);
          // Keep defaults on error
          setSdeMultiplier(2.5);
          setEbitdaMultiplier(5.0);
          setDcfDiscountRate(10.0);
          setDcfTerminalGrowth(2.0);
          setSdeManualInputs({});
        });
    }
  }, [selectedCompanyId]);

  // Load dashboard widgets from database (with localStorage fallback) when company changes
  useEffect(() => {
    if (selectedCompanyId) {
      const loadDashboardPrefs = async () => {
        try {
          // Try to load from database first
          const response = await fetch(`/api/dashboard-prefs?companyId=${selectedCompanyId}`);
          
          if (response.ok) {
            const data = await response.json();
            if (data.widgets && Array.isArray(data.widgets) && data.widgets.length > 0) {
              // Filter out obsolete widget names
              const obsoleteWidgets = ['Revenue Trend', 'Expense Trend', 'Net Profit Trend', 'Gross Margin Trend'];
              const cleanedWidgets = data.widgets.filter((w: string) => !obsoleteWidgets.includes(w));
              setSelectedDashboardWidgets(cleanedWidgets);
              
              // Also update localStorage
              const storageKey = `dashboardWidgets_${selectedCompanyId}`;
              localStorage.setItem(storageKey, JSON.stringify(cleanedWidgets));
              return;
            }
          }
          
          // Fallback to localStorage if database load fails or returns empty
          const storageKey = `dashboardWidgets_${selectedCompanyId}`;
          const savedWidgets = localStorage.getItem(storageKey);
          if (savedWidgets) {
            const widgets = JSON.parse(savedWidgets);
            const obsoleteWidgets = ['Revenue Trend', 'Expense Trend', 'Net Profit Trend', 'Gross Margin Trend'];
            const cleanedWidgets = widgets.filter((w: string) => !obsoleteWidgets.includes(w));
            setSelectedDashboardWidgets(cleanedWidgets);
          } else {
            setSelectedDashboardWidgets([]);
          }
        } catch (err) {
          console.error('Error loading dashboard preferences:', err);
          // Fallback to localStorage on error
          const storageKey = `dashboardWidgets_${selectedCompanyId}`;
          const savedWidgets = localStorage.getItem(storageKey);
          if (savedWidgets) {
            try {
              const widgets = JSON.parse(savedWidgets);
              setSelectedDashboardWidgets(widgets);
            } catch (parseErr) {
              setSelectedDashboardWidgets([]);
            }
          } else {
            setSelectedDashboardWidgets([]);
          }
        }
      };
      
      loadDashboardPrefs();
    }
  }, [selectedCompanyId]);

  // Load saved account mappings and CSV data when company changes or data-mapping tab is visited
  useEffect(() => {
    if (selectedCompanyId && adminDashboardTab === 'data-mapping') {
      console.log('?? Loading saved data for company:', selectedCompanyId);
      
      // Load CSV Trial Balance data from localStorage
      const savedCsvData = localStorage.getItem(`csvTrialBalance_${selectedCompanyId}`);
      setHasSavedCsvInLocalStorage(!!savedCsvData);
      if (savedCsvData && !csvTrialBalanceData) {
        try {
          const parsed = JSON.parse(savedCsvData);
          if (parsed._companyId === selectedCompanyId) {
            console.log('? Loaded CSV Trial Balance from localStorage:', parsed.fileName);
            setCsvTrialBalanceData(parsed);
          }
        } catch (err) {
          console.error('? Error parsing saved CSV data:', err);
        }
      }
      
      // Load account mappings from database
      fetch(`/api/account-mappings?companyId=${selectedCompanyId}`)
        .then(res => res.json())
        .then(data => {
          if (data.invalidMappingsCount > 0) {
            alert(
              `We found ${data.invalidMappingsCount} saved mapping(s) that do not match this company's selected sector. ` +
              `Those mappings were set to Unmapped. Please review and remap Revenue/COGS fields before saving.`,
            );
          }
          if (data.mappings && data.mappings.length > 0) {
            console.log(`? Loaded ${data.mappings.length} saved account mappings`);
            // Convert to aiMappings format
            const loadedMappings = data.mappings.map((m: any) => ({
              qbAccount: m.qbAccount,
              qbAccountId: m.qbAccountId,
              qbAccountCode: m.qbAccountCode,
              qbAccountClassification: m.qbAccountClassification,
              targetField: m.targetField,
              confidence: m.confidence || 'medium',
              lobAllocations: m.lobAllocations,
              sourceStatus: m.sourceStatus || 'mapped',
            }));
            setAiMappings(loadedMappings);
            setShowMappingSection(true);
            setMappingSourceSummary(data.sourceSummary || null);
          } else {
            setMappingSourceSummary(data.sourceSummary || null);
          }
          if (data.linesOfBusiness && Array.isArray(data.linesOfBusiness) && data.linesOfBusiness.length > 0) {
            console.log('? Loaded saved Lines of Business:', data.linesOfBusiness);
            // Convert from stored format to LOBData format
            const lobData = data.linesOfBusiness.map((lob: any) => ({
              name: typeof lob === 'string' ? lob : (lob.name || ''),
              headcountPercentage: typeof lob === 'object' ? (lob.headcountPercentage || 0) : 0,
              customPercentage: typeof lob === 'object' ? (lob.customPercentage || 0) : 0
            })).filter((lob: LOBData) => lob.name.trim() !== '');
            setLinesOfBusiness(lobData);

            // Load user defined allocations
            if (data.userDefinedAllocations && Array.isArray(data.userDefinedAllocations)) {
              setUserDefinedAllocations(data.userDefinedAllocations);
            } else {
              setUserDefinedAllocations([]);
            }
          } else {
            setLinesOfBusiness([]);
            setUserDefinedAllocations([]);
          }
        })
        .catch(err => {
          console.error('? Error loading saved mappings:', err);
        });
    }
  }, [selectedCompanyId, adminDashboardTab]);

  // Restore first-pass mapping for API-imported financial data when no mappings exist yet.
  useEffect(() => {
    if (!selectedCompanyId || adminDashboardTab !== 'data-mapping' || aiMappings.length > 0) return;
    if (!qbRawData || (!qbRawData.profitAndLoss && !qbRawData.balanceSheet)) return;

    const classifyAccount = (statementType: 'profitAndLoss' | 'balanceSheet', sectionName: string): string => {
      const section = (sectionName || '').toLowerCase();
      if (statementType === 'profitAndLoss') {
        if (section.includes('revenue') || section.includes('income') || section.includes('sales')) return 'Income';
        if (section.includes('cost of goods') || section.includes('cogs') || section.includes('cost of sales')) return 'Cost of Goods Sold';
        return 'Expense';
      }
      if (section.includes('asset') || section.includes('cash') || section.includes('receivable') || section.includes('inventory')) return 'Asset';
      if (section.includes('liabil') || section.includes('payable') || section.includes('debt')) return 'Liability';
      if (section.includes('equity') || section.includes('retained') || section.includes('capital')) return 'Equity';
      return 'Other';
    };

    const collectAccounts = (statementData: any, statementType: 'profitAndLoss' | 'balanceSheet') => {
      const collected: Array<{ qbAccount: string; qbAccountId: string; qbAccountCode: string; qbAccountClassification: string; targetField: string; confidence: string }> = [];
      const seen = new Set<string>();

      const visitRows = (rows: any[], sectionName: string = '') => {
        for (const row of rows) {
          if (row?.type === 'Section') {
            const nextSection = row?.Header?.ColData?.[0]?.value || sectionName;
            const nestedRows = row?.Rows?.Row;
            if (nestedRows) {
              visitRows(Array.isArray(nestedRows) ? nestedRows : [nestedRows], nextSection);
            }
            continue;
          }

          if (row?.type === 'Data' && Array.isArray(row?.ColData)) {
            const accountName = (row.ColData[0]?.value || '').trim();
            if (!accountName || accountName.toLowerCase().includes('total')) continue;

            const accountId = (row.ColData[1]?.id || row.ColData[1]?.value || accountName).toString();
            const classification = classifyAccount(statementType, sectionName);
            const dedupeKey = `${statementType}:${classification}:${accountName.toLowerCase()}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            collected.push({
              qbAccount: accountName,
              qbAccountId: accountId,
              qbAccountCode: accountId,
              qbAccountClassification: classification,
              targetField: 'unmapped',
              confidence: 'low',
            });
          }
        }
      };

      const rootRows = statementData?.Rows?.Row;
      if (rootRows) visitRows(Array.isArray(rootRows) ? rootRows : [rootRows]);
      return collected;
    };

    const generatedMappings = [
      ...collectAccounts(qbRawData.profitAndLoss, 'profitAndLoss'),
      ...collectAccounts(qbRawData.balanceSheet, 'balanceSheet'),
    ];

    if (generatedMappings.length > 0) {
      setAiMappings(generatedMappings);
      setShowMappingSection(true);
    }
  }, [selectedCompanyId, adminDashboardTab, qbRawData, aiMappings.length]);

  // Save dashboard widgets to database
  const saveDashboardPreferences = async () => {
    if (!selectedCompanyId) {
      toast.error('No company selected');
      return;
    }

    try {
      const response = await fetch('/api/dashboard-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          widgets: selectedDashboardWidgets
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save dashboard preferences');
      }

      // Also save to localStorage as backup
      const storageKey = `dashboardWidgets_${selectedCompanyId}`;
      localStorage.setItem(storageKey, JSON.stringify(selectedDashboardWidgets));

      toast.success('Dashboard preferences saved successfully!');
    } catch (error) {
      console.error('Error saving dashboard preferences:', error);
      toast.error('Failed to save dashboard preferences');
      throw error;
    }
  };

  // Load affiliates when Affiliates tab is opened
  useEffect(() => {
    if (siteAdminTab === 'affiliates') {
      fetch('/api/affiliates')
        .then(res => res.json())
        .then(data => {
          if (data.affiliates) {
            setAffiliates(data.affiliates);
          }
        })
        .catch(err => console.error('Error loading affiliates:', err));
    }
  }, [siteAdminTab]);


  // Load site administrators when tab is opened
  useEffect(() => {
    if (siteAdminTab === 'siteadmins') {
      fetch('/api/siteadmins')
        .then(res => {
          if (!res.ok) {
            throw new Error('Failed to fetch site administrators');
          }
          return res.json();
        })
        .then(data => {
          setSiteAdmins(Array.isArray(data) ? data : []);
        })
        .catch(error => {
          console.error('Error loading site administrators:', error);
          setSiteAdmins([]);
        });
    }
  }, [siteAdminTab]);

  // Load all companies and users when Businesses tab is opened in site admin
  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const loadBusinessesData = async () => {
      if (cancelled) return;
      setSiteAdminBusinessesLoading(true);

      try {
        const loadWithRetry = async (url: string, maxAttempts = 5) => {
          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const res = await fetch(url, { cache: 'no-store' });
              if (!res.ok) {
                throw new Error(`Request failed (${res.status}) for ${url}`);
              }
              return await res.json();
            } catch (error: any) {
              lastError = error instanceof Error ? error : new Error(String(error));
              if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, Math.min(1500 * attempt, 4000)));
              }
            }
          }
          throw lastError || new Error(`Failed request for ${url}`);
        };

        const [companiesData, usersData] = await Promise.all([
          loadWithRetry('/api/companies'),
          loadWithRetry('/api/users'),
        ]);

        if (!Array.isArray(companiesData?.companies)) {
          throw new Error('Invalid companies response payload');
        }
        if (!Array.isArray(usersData?.users)) {
          throw new Error('Invalid users response payload');
        }

        if (cancelled) return;
        safeSetCompanies(companiesData.companies);
        setUsers(usersData.users);
        setSiteAdminBusinessesLoading(false);
      } catch (err) {
        console.error('? Error loading businesses tab data, retrying:', err);
        if (!cancelled) {
          // Keep previous data rendered and retry again shortly.
          setSiteAdminBusinessesLoading(true);
          retryTimeout = setTimeout(loadBusinessesData, 3000);
        }
      }
    };

    if (siteAdminTab === 'businesses' && currentView === 'siteadmin' && currentUser?.role === 'siteadmin') {
      console.log('?? Loading all companies and users for site admin businesses tab...');
      loadBusinessesData();
    }

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      setSiteAdminBusinessesLoading(false);
    };
  }, [siteAdminTab, currentView, currentUser?.role]);

  // Load default pricing on page load and when Default Pricing tab is opened
  useEffect(() => {
    // Load default pricing from SystemSettings (stored in database)
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setDefaultBusinessMonthlyPrice(data.settings.businessMonthlyPrice ?? 195);
          setDefaultBusinessQuarterlyPrice(data.settings.businessQuarterlyPrice ?? 500);
          setDefaultBusinessAnnualPrice(data.settings.businessAnnualPrice ?? 1750);
          setDefaultBusinessSetupFee(data.settings.businessSetupFee ?? 0);
          setDefaultConsultantMonthlyPrice(data.settings.consultantMonthlyPrice ?? 195);
          setDefaultConsultantQuarterlyPrice(data.settings.consultantQuarterlyPrice ?? 500);
          setDefaultConsultantAnnualPrice(data.settings.consultantAnnualPrice ?? 1750);
          setDefaultConsultantSetupFee(data.settings.consultantSetupFee ?? 0);
          console.log('? Loaded default pricing from SystemSettings:', {
            business: {
              monthly: data.settings.businessMonthlyPrice ?? 195,
              quarterly: data.settings.businessQuarterlyPrice ?? 500,
              annual: data.settings.businessAnnualPrice ?? 1750,
              setupFee: data.settings.businessSetupFee ?? 0,
            },
            consultant: {
              monthly: data.settings.consultantMonthlyPrice ?? 195,
              quarterly: data.settings.consultantQuarterlyPrice ?? 500,
              annual: data.settings.consultantAnnualPrice ?? 1750,
              setupFee: data.settings.consultantSetupFee ?? 0,
            }
          });
        }
      })
      .catch(err => {
        console.error('Error loading default pricing:', err);
        // Keep default values (195/500/1750) if API fails
      });
  }, []); // Load once on mount

  // Handle URL parameters for navigation and messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');
    const tab = urlParams.get('tab');
    const success = urlParams.get('success');
    const error = urlParams.get('error');

    // Set view if specified (e.g. from Support page Team Assessment link)
    if (view === 'admin') {
      setCurrentView('admin');
    }
    if (view === 'ma-welcome') {
      handleNavigation('ma-welcome');
    }

    // Set admin dashboard tab if specified
    if (tab === 'api-connections' || tab === 'import-financials' || tab === 'company-management' || tab === 'data-review') {
      setAdminDashboardTab(tab);
    }

    // Show success message
    if (success === 'quickbooks_connected') {
      alert('QuickBooks connected successfully! You can now sync your financial data.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + '?view=admin');
    }
    
    if (success === 'xero_connected') {
      alert('Xero connected successfully! You can now sync your financial data.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + '?view=admin');
    }

    // Show error message
    if (error === 'quickbooks_connection_failed') {
      alert('Failed to connect to QuickBooks. Please try again.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + '?view=admin');
    }
    
    if (error === 'xero_connection_failed') {
      alert('Failed to connect to Xero. Please try again.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + '?view=admin');
    }
    
    if (error === 'xero_auth_denied') {
      const details = searchParams.get('details');
      alert(`Xero authorization was denied or failed${details ? ': ' + details : ''}. Please try again.`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname + '?view=admin');
    }
  }, []);

  // Load company-specific data from API when company is selected
  useEffect(() => {
    const loadCompanyData = async () => {
      // Prevent execution during server-side rendering
      if (typeof window === 'undefined') return;

      if (!selectedCompanyId || !currentUser) return;
      
      try {
        // ALWAYS clear state at the start to prevent stale data
        console.log('?? Clearing all state before loading new company data');
        setQbRawData(null);
        setRawRows([]);
        setMapping({ date: '' });
        setFile(null);
        setColumns([]);
        
        // Load users for this company
        console.log('Loading users for company:', selectedCompanyId);
        const { users: companyUsers } = await usersApi.getByCompany(selectedCompanyId);
        console.log('Users loaded from API:', companyUsers);
        
        // Normalize role and userType to lowercase
        const normalizedUsers = companyUsers.map((u: any) => ({
          ...u,
          role: u.role.toLowerCase(),
          userType: u.userType?.toLowerCase()
        }));
        console.log('Normalized users:', normalizedUsers);
        
        setUsers((prevUsers) => {
          const otherUsers = prevUsers.filter(u => u.companyId !== selectedCompanyId);
          const newUsers = [...otherUsers, ...normalizedUsers];
          console.log('Setting users state:', newUsers);
          return newUsers;
        });
        
          // Load financial records
        const selectedCompany = Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : undefined;
        const companyName = selectedCompany?.name || 'Unknown';
        console.log(`?? LOADING DATA FOR: "${companyName}" (ID: ${selectedCompanyId})`);
        
        const { records } = await financialsApi.getByCompany(selectedCompanyId);
        console.log(`?? Found ${records.length} financial records for company "${companyName}"`);
        
        // If no records found, clear aiMappings as well
        if (!records || records.length === 0) {
          console.log(`?? No records found - clearing aiMappings too`);
          setAiMappings([]);
          setLatestFinancialSource(null);
        } else if (records && records.length > 0) {
          const latestRecord = records[0];
          console.log(`?? Latest record ID: ${latestRecord.id}, created: ${latestRecord.createdAt}`);
          // Track data source for UI branching (CSV vs API connections).
          // Prefer explicit columnMapping.source; fallback to heuristics for older records.
          const inferredCsv =
            latestRecord?.rawData &&
            typeof latestRecord.rawData === 'object' &&
            !Array.isArray(latestRecord.rawData) &&
            (latestRecord.rawData.accountsByType || latestRecord.rawData.accounts || latestRecord.rawData.dates);
          setLatestFinancialSource(latestRecord?.columnMapping?.source || (inferredCsv ? 'csv_trial_balance' : null));
          
          // Check if this is QuickBooks data and extract raw QB financial statements
          if (latestRecord.rawData && typeof latestRecord.rawData === 'object' && 
              !Array.isArray(latestRecord.rawData) &&
              (latestRecord.rawData.profitAndLoss || latestRecord.rawData.balanceSheet)) {
            // QuickBooks data - use monthlyData directly
            console.log(`?? Loading QB data for company: "${companyName}" (${selectedCompanyId})`);
            console.log(`?? Record belongs to company ID: ${latestRecord.companyId}`);
            console.log(`?? QB Data sync date:`, latestRecord.rawData.syncDate);
            console.log(`?? QB rawData object keys:`, Object.keys(latestRecord.rawData));
            console.log(`? SETTING qbRawData with sync date:`, latestRecord.rawData.syncDate);
            // Add companyId to the raw data so we can verify it matches
            setQbRawData({
              ...latestRecord.rawData,
              _companyId: selectedCompanyId,
              _recordId: latestRecord.id
            });
            setLatestFinancialSource(latestRecord?.columnMapping?.source || 'quickbooks');
            console.log(`?? Set qbRawData for company: ${selectedCompanyId}, record: ${latestRecord.id}`);
            // Force re-render of Financial Statements view
            setDataRefreshKey(prev => prev + 1);
            setRawRows([]); // Set empty array since rawRows is not used for QB data
            setMapping(latestRecord.columnMapping || { date: '' });
            setFile({ name: latestRecord.fileName } as File);
            setColumns([]);
            
            // Convert monthlyData to the format expected by the app
            const convertedMonthly = latestRecord.monthlyData.map((m: any) => ({
              date: new Date(m.monthDate),
              month: new Date(m.monthDate).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }),
              revenue: m.revenue || 0,
              expense: m.expense || 0,
              cogsPayroll: m.cogsPayroll || 0,
              cogsOwnerPay: m.cogsOwnerPay || 0,
              cogsContractors: m.cogsContractors || 0,
              cogsMaterials: m.cogsMaterials || 0,
              cogsCommissions: m.cogsCommissions || 0,
              cogsOther: m.cogsOther || 0,
              cogsTotal: m.cogsTotal || 0,
              payroll: m.payroll || 0,
              ownerBasePay: m.ownerBasePay || 0,
              benefits: m.benefits || 0,
              insurance: m.insurance || 0,
              professionalFees: m.professionalFees || 0,
              subcontractors: m.subcontractors || 0,
              rent: m.rent || 0,
              taxLicense: m.taxLicense || 0,
              stateIncomeTaxes: m.stateIncomeTaxes || 0,
              federalIncomeTaxes: m.federalIncomeTaxes || 0,
              phoneComm: m.phoneComm || 0,
              infrastructure: m.infrastructure || 0,
              autoTravel: m.autoTravel || 0,
              salesExpense: m.salesExpense || 0,
              marketing: m.marketing || 0,
              trainingCert: m.trainingCert || 0,
              mealsEntertainment: m.mealsEntertainment || 0,
              interestExpense: m.interestExpense || 0,
              depreciationAmortization: m.depreciationAmortization || 0,
              otherExpense: m.otherExpense || 0,
              nonOperatingIncome: m.nonOperatingIncome || 0,
              extraordinaryItems: m.extraordinaryItems || 0,
              netProfit: m.netProfit || 0,
              ownersRetirement: 0,
              operatingExpenseTotal: m.expense || 0,
              cash: m.cash || 0,
              ar: m.ar || 0,
              inventory: m.inventory || 0,
              otherCA: m.otherCA || 0,
              tca: m.tca || 0,
              fixedAssets: m.fixedAssets || 0,
              otherAssets: m.otherAssets || 0,
              totalAssets: m.totalAssets || 0,
              ap: m.ap || 0,
              loc: m.loc || 0,
              otherCL: m.otherCL || 0,
              tcl: m.tcl || 0,
              ltd: m.ltd || 0,
              totalLiab: m.totalLiab || 0,
              ownersCapital: m.ownersCapital || 0,
              ownersDraw: m.ownersDraw || 0,
              commonStock: m.commonStock || 0,
              preferredStock: m.preferredStock || 0,
              retainedEarnings: m.retainedEarnings || 0,
              additionalPaidInCapital: m.additionalPaidInCapital || 0,
              treasuryStock: m.treasuryStock || 0,
              totalEquity: m.totalEquity || 0,
              totalLAndE: m.totalLAndE || 0,
              // LOB Breakdown fields
              revenueBreakdown: m.revenueBreakdown || null,
              expenseBreakdown: m.expenseBreakdown || null,
              cogsBreakdown: m.cogsBreakdown || null,
              ...(m.revenueBreakdown && typeof m.revenueBreakdown === 'object' ? m.revenueBreakdown : {}),
              ...(m.cogsBreakdown && typeof m.cogsBreakdown === 'object' ? m.cogsBreakdown : {}),
              lobBreakdowns: m.lobBreakdowns || null
            }));
            setLoadedMonthlyData(convertedMonthly);
          } else {
            // CSV/Trial Balance data - check if it has processed monthly data
            setQbRawData(null);
            // Hydrate raw Trial Balance payload from latest DB record so Data Mapping
            // can still show "Process & Save Monthly Data" after page reloads.
            if (inferredCsv) {
              const restoredCsvPayload = {
                ...(latestRecord.rawData || {}),
                _companyId: selectedCompanyId,
                fileName:
                  latestRecord.fileName ||
                  (latestRecord.rawData && (latestRecord.rawData as any).fileName) ||
                  'CSV Trial Balance Upload',
              };
              setCsvTrialBalanceData(restoredCsvPayload);
              setHasSavedCsvInLocalStorage(true);
            }
            
            // If this record has monthlyData, it's a processed Trial Balance - load it like QB data
            if (latestRecord.monthlyData && latestRecord.monthlyData.length > 0) {
              console.log(`?? Loading processed Trial Balance data: ${latestRecord.monthlyData.length} months`);
              const convertedMonthly = latestRecord.monthlyData.map((m: any) => ({
                date: new Date(m.monthDate),
                month: new Date(m.monthDate).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }),
                revenue: m.revenue || 0,
                revenueBreakdown: m.revenueBreakdown || null,
                expense: m.expense || 0,
                expenseBreakdown: m.expenseBreakdown || null,
                cogsPayroll: m.cogsPayroll || 0,
                cogsOwnerPay: m.cogsOwnerPay || 0,
                cogsContractors: m.cogsContractors || 0,
                cogsMaterials: m.cogsMaterials || 0,
                cogsCommissions: m.cogsCommissions || 0,
                cogsOther: m.cogsOther || 0,
                cogsTotal: m.cogsTotal || 0,
                cogsBreakdown: m.cogsBreakdown || null,
                ...(m.revenueBreakdown && typeof m.revenueBreakdown === 'object' ? m.revenueBreakdown : {}),
                ...(m.cogsBreakdown && typeof m.cogsBreakdown === 'object' ? m.cogsBreakdown : {}),
                // Operating Expenses - map DB names to display names
                payroll: m.payroll || 0,
                ownerBasePay: m.ownerBasePay || 0,
                ownersRetirement: 0,
                benefits: m.benefits || 0,
                insurance: m.insurance || 0,
                professionalFees: m.professionalFees || 0,
                subcontractors: m.subcontractors || 0,
                rent: m.rent || 0,
                taxLicense: m.taxLicense || 0,
                stateIncomeTaxes: m.stateIncomeTaxes || 0,
                federalIncomeTaxes: m.federalIncomeTaxes || 0,
                phoneComm: m.phoneComm || 0,
                infrastructure: m.infrastructure || 0,
                autoTravel: m.autoTravel || 0,
                salesExpense: m.salesExpense || 0,
                marketing: m.marketing || 0,
                trainingCert: m.trainingCert || 0,
                mealsEntertainment: m.mealsEntertainment || 0,
                interestExpense: m.interestExpense || 0,
                depreciationAmortization: m.depreciationAmortization || 0,
                otherExpense: m.otherExpense || 0,
                operatingExpenseTotal: m.expense || 0,
                nonOperatingIncome: m.nonOperatingIncome || 0,
                extraordinaryItems: m.extraordinaryItems || 0,
                netProfit: m.netProfit || 0,
                // Balance Sheet
                cash: m.cash || 0,
                ar: m.ar || 0,
                inventory: m.inventory || 0,
                otherCA: m.otherCA || 0,
                tca: m.tca || 0,
                fixedAssets: m.fixedAssets || 0,
                otherAssets: m.otherAssets || 0,
                totalAssets: m.totalAssets || 0,
                ap: m.ap || 0,
                loc: m.loc || 0,
                otherCL: m.otherCL || 0,
                tcl: m.tcl || 0,
                ltd: m.ltd || 0,
                totalLiab: m.totalLiab || 0,
                // Equity
                ownersCapital: m.ownersCapital || 0,
                ownersDraw: m.ownersDraw || 0,
                commonStock: m.commonStock || 0,
                preferredStock: m.preferredStock || 0,
                retainedEarnings: m.retainedEarnings || 0,
                additionalPaidInCapital: m.additionalPaidInCapital || 0,
                treasuryStock: m.treasuryStock || 0,
                totalEquity: m.totalEquity || 0,
                totalLAndE: m.totalLAndE || 0,
                lobBreakdowns: m.lobBreakdowns || null
              }));
              setLoadedMonthlyData(convertedMonthly);
              console.log(`? Trial Balance monthly data loaded with ${convertedMonthly.length} months`);
            } else {
              // Legacy CSV upload - set rawRows for manual processing
              setRawRows(latestRecord.rawData);
              setMapping(latestRecord.columnMapping);
              setFile({ name: latestRecord.fileName } as File);
              setColumns(Object.keys(latestRecord.rawData[0] || {}));
              setLoadedMonthlyData([]); // Only clear for legacy CSV that needs processing
            }
          }
        }
        
        // Load assessment records
        console.log(`?? Loading assessment records for company: ${selectedCompanyId}`);
        const { records: assessments } = await assessmentsApi.getByCompany(selectedCompanyId);
        console.log(`?? Loaded ${assessments?.length || 0} assessment records:`, assessments);
        setAssessmentRecords(assessments || []);
        console.log(`? Assessment records set in state`);
        
        // Load company profile
        const { profile } = await profilesApi.get(selectedCompanyId);
        if (profile) {
          setCompanyProfiles((prev) => {
            const filtered = prev.filter(p => p.companyId !== selectedCompanyId);
            return [...filtered, profile];
          });
        }
        
        // Load saved account mappings
        try {
          const mappingsResponse = await fetch(`/api/account-mappings?companyId=${selectedCompanyId}`);
          if (mappingsResponse.ok) {
            const {
              mappings,
              linesOfBusiness: savedLobs,
              invalidMappingsCount,
            } = await mappingsResponse.json();
            if (invalidMappingsCount > 0) {
              alert(
                `We found ${invalidMappingsCount} saved mapping(s) that do not match this company's selected sector. ` +
                `Those mappings were set to Unmapped. Please review and remap Revenue/COGS fields before saving.`,
              );
            }
            if (mappings && mappings.length > 0) {
              console.log('Loaded saved account mappings:', mappings);
              setAiMappings(mappings);
              if (savedLobs && Array.isArray(savedLobs) && savedLobs.length > 0) {
                console.log('Loaded saved Lines of Business:', savedLobs);
              // Convert from stored format to LOBData format
              const lobData = savedLobs.map((lob: any) => ({
                name: typeof lob === 'string' ? lob : (lob.name || ''),
                headcountPercentage: typeof lob === 'object' ? (lob.headcountPercentage || 0) : 0,
                customPercentage: typeof lob === 'object' ? (lob.customPercentage || 0) : 0
              })).filter((lob: LOBData) => lob.name.trim() !== '');
              setLinesOfBusiness(lobData);
              // Note: userDefinedAllocations not loaded from this endpoint, will be loaded separately
              }
              setShowMappingSection(true);
            }
          }
        } catch (error) {
          console.error('Error loading account mappings:', error);
        }
        
        // Load industry benchmarks
        const company = Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : undefined;
        if (company && company.industrySector) {
          console.log('Company has industry sector:', company.industrySector);
          // Get the latest Total Assets to determine asset size category
          let assetCategory = '1m-5m'; // Default to middle range
          if (records && records.length > 0) {
            const latestRecord = records[0];
            const monthlyData = latestRecord.monthlyData || [];
            if (monthlyData.length > 0) {
              const mostRecentMonth = monthlyData[monthlyData.length - 1];
              const totalAssets = mostRecentMonth.totalAssets || 0;
              assetCategory = getAssetSizeCategory(totalAssets);
              console.log('Total Assets:', totalAssets, '-> Asset Category:', assetCategory);
            }
          }
          
          // Fetch benchmarks for this industry and asset size
          console.log('Fetching benchmarks for industry:', company.industrySector, 'assetSize:', assetCategory);
          const benchmarkData = await benchmarksApi.get(String(company.industrySector), assetCategory);
          setBenchmarks(benchmarkData || []);
          console.log('? Loaded', benchmarkData?.length || 0, 'benchmarks');
          if (benchmarkData && benchmarkData.length > 0) {
            console.log('Sample benchmarks:', benchmarkData.slice(0, 3).map((b: any) => b.metricName).join(', '));
          }
        } else {
          console.log('?? Cannot load benchmarks:', !company ? 'Company not found' : 'Industry sector not set');
        }

          // Load subscription pricing for this company (now stored permanently in DB)
          if (company) {
            console.log('?? Loading pricing from company data:', {
              name: company.name,
              id: company.id,
              monthly: company.subscriptionMonthlyPrice,
              quarterly: company.subscriptionQuarterlyPrice,
              annual: company.subscriptionAnnualPrice,
              setupFee: (company as any).subscriptionSetupFee
            });

            // Load pricing from database (try dedicated fields first, then userDefinedAllocations)
            let monthly = company.subscriptionMonthlyPrice;
            let quarterly = company.subscriptionQuarterlyPrice;
            let annual = company.subscriptionAnnualPrice;
            const setupFee = (company as any).subscriptionSetupFee;

            // If dedicated pricing fields are null/undefined, try userDefinedAllocations backup
            if ((monthly === null || monthly === undefined) &&
                company.userDefinedAllocations?.subscriptionPricing) {
              console.log('?? Using backup pricing from userDefinedAllocations');
              monthly = company.userDefinedAllocations.subscriptionPricing.monthly;
              quarterly = company.userDefinedAllocations.subscriptionPricing.quarterly;
              annual = company.userDefinedAllocations.subscriptionPricing.annual;
            }

            // IMPORTANT: Existing companies keep their original pricing (set at registration)
            // Only use default pricing if company has NO pricing data (null/undefined)
            // This ensures existing companies maintain their registration pricing
            const hasPricingData = monthly !== null && monthly !== undefined &&
                                  quarterly !== null && quarterly !== undefined &&
                                  annual !== null && annual !== undefined;

            // Check if company has explicit free pricing flag
            const userDefinedPricing = (company as any)?.userDefinedAllocations?.subscriptionPricing;
            const isExplicitlyFree = userDefinedPricing?.isFree === true;

            if (hasPricingData) {
              // Company has pricing data - use it (this is the pricing from registration)
              // This preserves existing company pricing and doesn't override it
              setSubscriptionMonthlyPrice(monthly);
              setSubscriptionQuarterlyPrice(quarterly);
              setSubscriptionAnnualPrice(annual);
              setSubscriptionSetupFee(setupFee ?? 0);
              console.log('? Loaded existing company pricing from database (preserved from registration):', { monthly, quarterly, annual, isFree: monthly === 0 && quarterly === 0 && annual === 0 });
            } else if (isExplicitlyFree) {
              // Explicitly free (affiliate code with $0 pricing)
              console.log('? Company has explicit free pricing - setting to $0');
              setSubscriptionMonthlyPrice(0);
              setSubscriptionQuarterlyPrice(0);
              setSubscriptionAnnualPrice(0);
              setSubscriptionSetupFee(0);
            } else {
              // No pricing data = company was created before pricing was saved
              // This should only happen for very old companies - use current default pricing
              console.log('?? No pricing data in database - using current default pricing (payment required)');
              // Load default pricing from SystemSettings
              fetch('/api/settings')
                .then(res => res.json())
                .then(data => {
                  if (data.settings) {
                    // Determine if the current user is a business user (not a consultant or site admin)
                    const isBusinessUser = currentUser?.userType === 'company' || currentUser?.userType === 'COMPANY' || (currentUser?.role === 'user' && !currentUser?.consultantId);
                    const defaultMonthly = isBusinessUser 
                      ? (data.settings.businessMonthlyPrice ?? 195)
                      : (data.settings.consultantMonthlyPrice ?? 195);
                    const defaultQuarterly = isBusinessUser
                      ? (data.settings.businessQuarterlyPrice ?? 500)
                      : (data.settings.consultantQuarterlyPrice ?? 500);
                    const defaultAnnual = isBusinessUser
                      ? (data.settings.businessAnnualPrice ?? 1750)
                      : (data.settings.consultantAnnualPrice ?? 1750);
                    const defaultSetupFee = isBusinessUser
                      ? (data.settings.businessSetupFee ?? 0)
                      : (data.settings.consultantSetupFee ?? 0);
                    setSubscriptionMonthlyPrice(defaultMonthly);
                    setSubscriptionQuarterlyPrice(defaultQuarterly);
                    setSubscriptionAnnualPrice(defaultAnnual);
                    setSubscriptionSetupFee(defaultSetupFee);
                    console.log('? Loaded default pricing for company without saved pricing:', { defaultMonthly, defaultQuarterly, defaultAnnual, defaultSetupFee, isBusinessUser });
                  } else {
                    // Fallback to hardcoded defaults
                    setSubscriptionMonthlyPrice(195);
                    setSubscriptionQuarterlyPrice(500);
                    setSubscriptionAnnualPrice(1750);
                    setSubscriptionSetupFee(0);
                  }
                })
                .catch(err => {
                  console.error('Error loading default pricing:', err);
                  // Fallback to hardcoded defaults
                  setSubscriptionMonthlyPrice(195);
                  setSubscriptionQuarterlyPrice(500);
                  setSubscriptionAnnualPrice(1750);
                  setSubscriptionSetupFee(0);
                });
            }

            console.log('? Pricing loaded from database:', {
              monthly: company.subscriptionMonthlyPrice ?? 195,
              quarterly: company.subscriptionQuarterlyPrice ?? 500,
              annual: company.subscriptionAnnualPrice ?? 1750,
              isFree: (company.subscriptionMonthlyPrice ?? 195) === 0 &&
                      (company.subscriptionQuarterlyPrice ?? 500) === 0 &&
                      (company.subscriptionAnnualPrice ?? 1750) === 0
            });
          }

        // Check QuickBooks connection status
        await checkQBStatus(selectedCompanyId);
        // Check Xero connection status
        await checkXeroStatus(selectedCompanyId);
        // Infor M3 setup/status is restricted to site admins.
        if (String(currentUser?.role || '').toUpperCase() === 'SITEADMIN' && company?.accountingSystem === 'INFOR_M3') {
          await checkInforM3Status(selectedCompanyId);
          await fetchInforLastCaoPull(selectedCompanyId);
        }
      } catch (error) {
        console.error('Error loading company data:', error);
      }
    };
    
    loadCompanyData();
  }, [selectedCompanyId, currentUser, qbLastSync]);


  // Track which consultant's companies are currently loaded
  const [loadedConsultantId, setLoadedConsultantId] = useState<string | null>(null);

  // Load companies for consultants
  useEffect(() => {
    const loadConsultantCompanies = async () => {
      if (!currentUser || currentUser.role !== 'consultant' || !currentUser.consultantId) return;
      
      // Only reload if consultant changed (handles site admin viewing as different consultants)
      if (loadedConsultantId === currentUser.consultantId) return;
      
      // Keep any consultant-scoped preview data visible while we refresh from API.
      
      try {
        const { companies: consultantCompanies } = await companiesApi.getAll(currentUser.consultantId);
        safeSetCompanies(consultantCompanies || []);
        setLoadedConsultantId(currentUser.consultantId);
        
        // Load all users and assessment records for all companies
        const allUsers: User[] = [];
        const allAssessments: AssessmentRecord[] = [];
        for (const company of consultantCompanies || []) {
          try {
            // Load users for this company
            const { users: companyUsers } = await usersApi.getByCompany(company.id);
            if (companyUsers) {
              const normalizedUsers = companyUsers.map((u: any) => ({
                ...u,
                role: u.role?.toLowerCase() || 'user',
                userType: u.userType?.toLowerCase() || 'company'
              }));
              allUsers.push(...normalizedUsers);
            }
            
            // Load assessment records for this company
            const { records } = await assessmentsApi.getByCompany(company.id);
            if (records) {
              console.log(`?? Loaded ${records.length} assessment records for company ${company.id} (${company.name}):`, 
                records.map((r: any) => ({ userEmail: r.user?.email, companyId: r.companyId, answersCount: Object.keys(r.responses || {}).length }))
              );
              allAssessments.push(...records);
            }
          } catch (error) {
            console.error(`Error loading data for company ${company.id}:`, error);
          }
        }
        console.log(`? Total loaded: ${allUsers.length} users, ${allAssessments.length} assessment records`);
        console.log(`Assessment users:`, allUsers.filter(u => u.userType === 'assessment').map(u => ({ email: u.email, companyId: u.companyId })));
        setUsers(allUsers);
        setAssessmentRecords(allAssessments);
      } catch (error) {
        console.error('Error loading consultant companies:', error);
      }
    };
    
    loadConsultantCompanies();
  }, [currentUser?.consultantId, currentUser?.role, loadedConsultantId]);

  // Load consultants for site admin
  useEffect(() => {
    const loadConsultants = async () => {
      if (!currentUser || currentUser.role !== 'siteadmin') return;
      
      try {
        const { consultants: loadedConsultants } = await consultantsApi.getAll();
        // Map the user data to consultant level for easier access in the UI
        const mappedConsultants = (loadedConsultants || []).map((c: any) => ({
          ...c,
          email: c.user?.email || c.email || '',
          password: '' // Don't expose passwords
        }));
        setConsultants(mappedConsultants);
        
        // Always load full company records so consultant cards have complete fields
        // (e.g., accountingSystem) required by Site Admin integration containers.
        const companiesRes = await fetch('/api/companies', { cache: 'no-store' });
        if (companiesRes.ok) {
          const companiesData = await companiesRes.json();
          if (Array.isArray(companiesData?.companies)) {
            safeSetCompanies(companiesData.companies);
          }
        }
      } catch (error) {
        console.error('Error loading consultants:', error);
      }
    };
    
    loadConsultants();
  }, [currentUser, siteAdminTab]);

  // Load financial data when company is selected
  useEffect(() => {
    const loadFinancialData = async () => {
      if (!selectedCompanyId) {
        setLoadedMonthlyData([]);
        return;
      }
      
      try {
        console.log('Loading financial data for company:', selectedCompanyId);
        const response = await fetch(`/api/financials?companyId=${selectedCompanyId}`);
        
        if (!response.ok) {
          console.log('No financial data found for company');
          setLoadedMonthlyData([]);
          return;
        }
        
        const data = await response.json();
        if (data.records && data.records.length > 0 && data.records[0].monthlyData) {
          const monthlyData = data.records[0].monthlyData;
          
          // Convert API data to the format expected by the app
          const formattedData = monthlyData.map((m: any) => ({
            ...m,
            date: new Date(m.monthDate),
            month: m.month || new Date(m.monthDate).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }),
            revenue: m.revenue || 0,
            expense: m.expense || 0,
            // COGS Breakdown - map QB aggregated data to detailed fields for Data Review compatibility
            cogsPayroll: m.cogsPayroll || m.payroll || 0,  // Map payroll to cogsPayroll
            cogsOwnerPay: m.cogsOwnerPay || m.ownerBasePay || 0,  // Map owner pay to cogsOwnerPay
            cogsContractors: m.cogsContractors || m.subcontractors || 0,  // Map subcontractors to contractors
            cogsMaterials: m.cogsMaterials || 0,
            cogsCommissions: m.cogsCommissions || 0,
            cogsOther: m.cogsOther || 0,
            cogsTotal: m.cogsTotal || 0,
            // Operating Expenses - map DB field names to display field names
            payroll: m.payroll || m.payroll || 0,
            ownerBasePay: m.ownerBasePay || m.ownerBasePay || 0,
            ownersRetirement: m.ownersRetirement || 0,
            benefits: m.benefits || 0,
            insurance: m.insurance || 0,
            professionalFees: m.professionalFees || m.professionalFees || 0,
            subcontractors: m.subcontractors || m.subcontractors || 0,
            rent: m.rent || 0,
            taxLicense: m.taxLicense || 0,
            phoneComm: m.phoneComm || 0,
            infrastructure: m.infrastructure || 0,
            autoTravel: m.autoTravel || 0,
            salesExpense: m.salesExpense || 0,
            marketing: m.marketing || 0,
            trainingCert: m.trainingCert || 0,
            mealsEntertainment: m.mealsEntertainment || 0,
            interestExpense: m.interestExpense || 0,
            depreciationAmortization: m.depreciationAmortization || m.depreciationAmortization || 0,
            otherExpense: m.otherExpense || 0,
            stateIncomeTaxes: m.stateIncomeTaxes || 0,
            federalIncomeTaxes: m.federalIncomeTaxes || 0,
            operatingExpenseTotal: m.operatingExpenseTotal || m.expense || 0,
            nonOperatingIncome: m.nonOperatingIncome || 0,
            extraordinaryItems: m.extraordinaryItems || 0,
            netProfit: m.netProfit || 0,
            // Balance Sheet - Assets
            totalAssets: m.totalAssets || 0,
            cash: m.cash || 0,
            ar: m.ar || 0,
            inventory: m.inventory || 0,
            otherCA: m.otherCA || 0,
            tca: m.tca || 0,
            fixedAssets: m.fixedAssets || 0,
            otherAssets: m.otherAssets || 0,
            // Balance Sheet - Liabilities
            ap: m.ap || 0,
            loc: m.loc || 0,
            otherCL: m.otherCL || 0,
            tcl: m.tcl || 0,
            ltd: m.ltd || 0,
            totalLiab: m.totalLiab || 0,
            // Balance Sheet - Equity (detailed)
            ownersCapital: m.ownersCapital || 0,
            ownersDraw: m.ownersDraw || 0,
            commonStock: m.commonStock || 0,
            preferredStock: m.preferredStock || 0,
            retainedEarnings: m.retainedEarnings || 0,
            additionalPaidInCapital: m.additionalPaidInCapital || 0,
            treasuryStock: m.treasuryStock || 0,
            totalEquity: m.totalEquity || 0,
            totalLAndE: m.totalLAndE || 0,
            revenueBreakdown: m.revenueBreakdown || null,
            expenseBreakdown: m.expenseBreakdown || null,
            cogsBreakdown: m.cogsBreakdown || null,
            ...(m.revenueBreakdown && typeof m.revenueBreakdown === 'object' ? m.revenueBreakdown : {}),
            ...(m.cogsBreakdown && typeof m.cogsBreakdown === 'object' ? m.cogsBreakdown : {}),
            lobBreakdowns: m.lobBreakdowns || null,
          }));
          
          console.log('? Loaded', formattedData.length, 'months of financial data from database');
          console.log('?? RAW from database (sample):', monthlyData[0] ? {
            revenue: monthlyData[0].revenue,
            payroll: monthlyData[0].payroll,
            professionalFees: monthlyData[0].professionalFees,
            rent: monthlyData[0].rent,
            insurance: monthlyData[0].insurance,
            infrastructure: monthlyData[0].infrastructure,
            retainedEarnings: monthlyData[0].retainedEarnings,
            ownersDraw: monthlyData[0].ownersDraw
          } : 'no data');
          console.log('?? FORMATTED for display (sample):', formattedData[0] ? {
            revenue: formattedData[0].revenue,
            payroll: formattedData[0].payroll,
            professionalFees: formattedData[0].professionalFees,
            rent: formattedData[0].rent,
            insurance: formattedData[0].insurance,
            utilities: formattedData[0].infrastructure,
            retainedEarnings: formattedData[0].retainedEarnings,
            ownersDraw: formattedData[0].ownersDraw
          } : 'no data');
          setLoadedMonthlyData(formattedData);
        } else {
          console.log('No monthly data in response');
          setLoadedMonthlyData([]);
        }
      } catch (error) {
        console.error('Error loading financial data:', error);
        setLoadedMonthlyData([]);
      }
    };
    
    loadFinancialData();
  }, [selectedCompanyId, qbLastSync]);

  useEffect(() => {
    const saveFinancialData = async () => {
      console.log('?? saveFinancialData effect triggered:', {
        hasFile: !!file,
        rawRowsLength: rawRows.length,
        hasMappingDate: !!mapping.date,
        hasCompanyId: !!selectedCompanyId,
        hasCurrentUser: !!currentUser,
        currentUserEmail: currentUser?.email,
        isFreshUpload
      });
      
      if (!file || rawRows.length === 0 || !mapping.date || !selectedCompanyId || !currentUser || !isFreshUpload) {
        console.log('?? Skipping save - conditions not met');
        return;
      }
      
      try {
        console.log('Saving financial data to database...');
        // Use normalizeRows to process the data
        const normalized = normalizeRows(rawRows, mapping);
        
        // Process raw rows to get full data with all fields (same as monthly useMemo)
        const fullMonthlyData = rawRows.map((row, i) => {
          const monthValue = row[mapping.date] || `Month ${i + 1}`;
          // Parse date string to create monthDate
          let monthDate = new Date();
          const monthValueStr = String(monthValue);
          if (monthValue && typeof monthValue === 'string' && monthValue.includes('/')) {
            const [month, day, year] = monthValue.split('/');
            monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
          } else if (monthValue && typeof monthValue === 'string' && monthValue.includes('-')) {
            monthDate = new Date(monthValue);
          } else if (typeof monthValue === 'number') {
            // Handle Excel serial date numbers
            const excelEpoch = new Date(1899, 11, 30);
            monthDate = new Date(excelEpoch.getTime() + monthValue * 24 * 60 * 60 * 1000);
          }
          
          return {
          month: monthValueStr,
          monthDate: monthDate.toISOString(),
          revenue: parseFloat(row[mapping.revenue!]) || 0,
          expense: parseFloat(row[mapping.expense!]) || 0,
          cogsPayroll: parseFloat(row[mapping.cogsPayroll!]) || 0,
          cogsOwnerPay: parseFloat(row[mapping.cogsOwnerPay!]) || 0,
          cogsContractors: parseFloat(row[mapping.cogsContractors!]) || 0,
          cogsMaterials: parseFloat(row[mapping.cogsMaterials!]) || 0,
          cogsCommissions: parseFloat(row[mapping.cogsCommissions!]) || 0,
          cogsOther: parseFloat(row[mapping.cogsOther!]) || 0,
          cogsTotal: parseFloat(row[mapping.cogsTotal!]) || 0,
          salesExpense: parseFloat(row[mapping.salesExpense!]) || 0,
          rent: parseFloat(row[mapping.rent!]) || 0,
          infrastructure: parseFloat(row[mapping.infrastructure!]) || 0,
          autoTravel: parseFloat(row[mapping.autoTravel!]) || 0,
          professionalFees: parseFloat(row[mapping.professionalFees!]) || 0,
          insurance: parseFloat(row[mapping.insurance!]) || 0,
          marketing: parseFloat(row[mapping.marketing!]) || 0,
          payroll: parseFloat(row[mapping.payroll!]) || 0,
          ownerBasePay: parseFloat(row[mapping.ownerBasePay!]) || 0,
          ownersRetirement: parseFloat(row[mapping.ownersRetirement!]) || 0,
          subcontractors: parseFloat(row[mapping.subcontractors!]) || 0,
          interestExpense: parseFloat(row[mapping.interestExpense!]) || 0,
          depreciationAmortization: parseFloat(row[mapping.depreciationAmortization!]) || 0,
          stateIncomeTaxes: parseFloat(row[mapping.stateIncomeTaxes!]) || 0,
          federalIncomeTaxes: parseFloat(row[mapping.federalIncomeTaxes!]) || 0,
          operatingExpenseTotal: parseFloat(row[mapping.operatingExpenseTotal!]) || 0,
          nonOperatingIncome: parseFloat(row[mapping.nonOperatingIncome!]) || 0,
          extraordinaryItems: parseFloat(row[mapping.extraordinaryItems!]) || 0,
          netProfit: parseFloat(row[mapping.netProfit!]) || 0,
          totalAssets: parseFloat(row[mapping.totalAssets!]) || 0,
          totalLiab: parseFloat(row[mapping.totalLiab!]) || 0,
          cash: parseFloat(row[mapping.cash!]) || 0,
          ar: parseFloat(row[mapping.ar!]) || 0,
          inventory: parseFloat(row[mapping.inventory!]) || 0,
          otherCA: parseFloat(row[mapping.otherCA!]) || 0,
          tca: parseFloat(row[mapping.tca!]) || 0,
          fixedAssets: parseFloat(row[mapping.fixedAssets!]) || 0,
          otherAssets: parseFloat(row[mapping.otherAssets!]) || 0,
          ap: parseFloat(row[mapping.ap!]) || 0,
          loc: parseFloat(row[mapping.loc!]) || 0,
          otherCL: parseFloat(row[mapping.otherCL!]) || 0,
          tcl: parseFloat(row[mapping.tcl!]) || 0,
          ltd: parseFloat(row[mapping.ltd!]) || 0,
          ownersCapital: parseFloat(row[mapping.ownersCapital!]) || 0,
          ownersDraw: parseFloat(row[mapping.ownersDraw!]) || 0,
          commonStock: parseFloat(row[mapping.commonStock!]) || 0,
          preferredStock: parseFloat(row[mapping.preferredStock!]) || 0,
          retainedEarnings: parseFloat(row[mapping.retainedEarnings!]) || 0,
          additionalPaidInCapital: parseFloat(row[mapping.additionalPaidInCapital!]) || 0,
          treasuryStock: parseFloat(row[mapping.treasuryStock!]) || 0,
          totalEquity: parseFloat(row[mapping.totalEquity!]) || 0,
          totalLAndE: parseFloat(row[mapping.totalLAndE!]) || 0
          };
        });
        
        console.log('?? Uploading', fullMonthlyData.length, 'months of data for company', selectedCompanyId);
        console.log('?? Sample Excel values from row 0:', { 
          revenue: rawRows[0]?.[mapping.revenue!], 
          expense: rawRows[0]?.[mapping.expense!],
          professionalFees: rawRows[0]?.[mapping.professionalFees!]
        });
        console.log('?? First 3 months PARSED:', fullMonthlyData.slice(0, 3).map(m => ({ 
          month: m.month, 
          revenue: m.revenue, 
          expense: m.expense,
          professionalFees: m.professionalFees
        })));
        
        const result = await financialsApi.upload({
          companyId: selectedCompanyId,
          uploadedByUserId: currentUser.id,
          fileName: file.name,
          rawData: rawRows,
          columnMapping: mapping,
          monthlyData: fullMonthlyData
        });
        
        console.log('Financial data saved successfully:', result);
        setIsFreshUpload(false);
        
        // Immediately set loadedMonthlyData so reports show it
        setLoadedMonthlyData(fullMonthlyData);
        
        alert('Financial data saved successfully! You can now view it in the reports.');
      } catch (error) {
        console.error('Error saving financial data:', error);
        const errorMsg = error instanceof ApiError ? error.message : 'Failed to save financial data';
        setError(errorMsg);
        alert('Error saving financial data: ' + errorMsg);
      }
    };
    
    if (isFreshUpload) {
      saveFinancialData();
    }
  }, [mapping, rawRows, file, selectedCompanyId, currentUser, isFreshUpload]);

  // Auto-map columns
  const autoMapColumns = (columnNames: string[]): Mappings => {
    const mapping: Mappings = { date: '' };
    const normalize = (str: string | number | null | undefined) => String(str ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    
    columnNames.forEach(col => {
      const n = normalize(col);
      // Core fields
      if (!mapping.date && (n.includes('date') || n.includes('month') || n.includes('period'))) mapping.date = col;
      if (!mapping.revenue && (n.includes('grossrevenue') || n.includes('totalgrossrevenue') || n.includes('revenue') || n.includes('sales'))) mapping.revenue = col;
      if (!mapping.expense && (n.includes('totalexpense') || (n.includes('expense') && n.includes('total')))) mapping.expense = col;
      
      // COGS
      if (!mapping.cogsPayroll && n.includes('cogs') && n.includes('payroll')) mapping.cogsPayroll = col;
      if (!mapping.cogsOwnerPay && n.includes('cogs') && n.includes('owner')) mapping.cogsOwnerPay = col;
      if (!mapping.cogsContractors && n.includes('cogs') && n.includes('contractor')) mapping.cogsContractors = col;
      if (!mapping.cogsMaterials && n.includes('cogs') && n.includes('material')) mapping.cogsMaterials = col;
      if (!mapping.cogsCommissions && n.includes('cogs') && (n.includes('comsn') || n.includes('commission'))) mapping.cogsCommissions = col;
      if (!mapping.cogsOther && n.includes('cogs') && n.includes('other')) mapping.cogsOther = col;
      if (!mapping.cogsTotal && n.includes('cogs') && n.includes('total')) mapping.cogsTotal = col;
      
      // OPEX
      if (!mapping.salesExpense && ((n.includes('opex') && (n.includes('sales') || n.includes('marketing'))) || (n === 'salesandmarketing' || n === 'salesmarketing'))) mapping.salesExpense = col;
      if (!mapping.rent && (n.includes('rent') || n.includes('lease'))) mapping.rent = col;
      if (!mapping.infrastructure && (n.includes('utilit') || n.includes('equipment') || n.includes('infrastructure'))) mapping.infrastructure = col;
      if (!mapping.autoTravel && n.includes('travel')) mapping.autoTravel = col;
      if (!mapping.professionalFees && n.includes('professional')) mapping.professionalFees = col;
      if (!mapping.insurance && n.includes('insurance')) mapping.insurance = col;
      if (!mapping.marketing && ((n.includes('opex') && n.includes('other')) || n === 'otheropex')) mapping.marketing = col;
      if (!mapping.payroll && ((n.includes('opex') && n.includes('payroll')) || (n === 'payroll' && !n.includes('cogs')))) mapping.payroll = col;
      
      // Owners & Other Expenses
      if (!mapping.ownerBasePay && n.includes('owners') && n.includes('base')) mapping.ownerBasePay = col;
      if (!mapping.ownersRetirement && n.includes('owners') && n.includes('retirement')) mapping.ownersRetirement = col;
      if (!mapping.subcontractors && n.includes('contractors') && n.includes('distribution')) mapping.subcontractors = col;
      if (!mapping.interestExpense && n.includes('interest')) mapping.interestExpense = col;
      if (!mapping.depreciationAmortization && n.includes('depreciation')) mapping.depreciationAmortization = col;
      if (!mapping.stateIncomeTaxes && ((n.includes('state') && n.includes('incometax')) || n === 'stateincometaxes')) mapping.stateIncomeTaxes = col;
      if (!mapping.federalIncomeTaxes && ((n.includes('federal') && n.includes('incometax')) || n === 'federalincometaxes')) mapping.federalIncomeTaxes = col;
      if (!mapping.operatingExpenseTotal && n.includes('operating') && n.includes('expense') && n.includes('total')) mapping.operatingExpenseTotal = col;
      if (!mapping.nonOperatingIncome && (n.includes('nonoperating') || n.includes('nonoperatng')) && n.includes('income')) mapping.nonOperatingIncome = col;
      if (!mapping.extraordinaryItems && (n.includes('extraordinary') || n.includes('extraordinaryitems'))) mapping.extraordinaryItems = col;
      if (!mapping.netProfit && (n.includes('netprofit') || n.includes('netincome'))) mapping.netProfit = col;
      
      // Assets
      if (!mapping.totalAssets && (n.includes('totalasset') || n === 'totalassets' || n === 'assets')) mapping.totalAssets = col;
      if (!mapping.cash && n === 'cash') mapping.cash = col;
      if (!mapping.ar && (n.includes('accountsreceivable') || n.includes('receivable') || n === 'ar')) mapping.ar = col;
      if (!mapping.inventory && n.includes('inventory')) mapping.inventory = col;
      if (!mapping.otherCA && (n.includes('othercurrentasset') || n === 'othercurrentassets')) mapping.otherCA = col;
      if (!mapping.tca && (n.includes('totalcurrentasset') || n === 'totalcurrentassets' || n === 'currentassets')) mapping.tca = col;
      if (!mapping.fixedAssets && (n.includes('fixedasset') || n === 'fixedassets')) mapping.fixedAssets = col;
      if (!mapping.otherAssets && (n.includes('otherasset') && !n.includes('current'))) mapping.otherAssets = col;
      
      // Liabilities & Equity
      if (!mapping.totalLiab && (n.includes('totalliab') || n === 'totalliabilities' || n === 'liabilities')) mapping.totalLiab = col;
      if (!mapping.ap && (n.includes('accountspayable') || n.includes('payable') || n === 'ap')) mapping.ap = col;
      if (!mapping.loc && (n.includes('lineofcredit') || n === 'loc' || n.includes('creditline'))) mapping.loc = col;
      if (!mapping.otherCL && (n.includes('othercurrentliab') || n === 'othercurrentliabilities')) mapping.otherCL = col;
      if (!mapping.tcl && (n.includes('totalcurrentliab') || n === 'totalcurrentliabilities' || n === 'currentliabilities')) mapping.tcl = col;
      if (!mapping.ltd && (n.includes('longtermdebt') || n.includes('ltd') || n === 'longtermdebt')) mapping.ltd = col;
      
      // Equity Detail
      if (!mapping.ownersCapital && (n.includes('ownerscapital') || n.includes('ownercapital'))) mapping.ownersCapital = col;
      if (!mapping.ownersDraw && (n.includes('ownersdraw') || n.includes('ownerdraw') || n.includes('ownerdistribution'))) mapping.ownersDraw = col;
      if (!mapping.commonStock && (n.includes('commonstock'))) mapping.commonStock = col;
      if (!mapping.preferredStock && (n.includes('preferredstock'))) mapping.preferredStock = col;
      if (!mapping.retainedEarnings && (n.includes('retainedearnings'))) mapping.retainedEarnings = col;
      if (!mapping.additionalPaidInCapital && (n.includes('additionalpaidincapital') || n.includes('paidincapital'))) mapping.additionalPaidInCapital = col;
      if (!mapping.treasuryStock && (n.includes('treasurystock'))) mapping.treasuryStock = col;
      
      if (!mapping.totalEquity && (n.includes('totalequity') || n.includes('equity') || n.includes('networth'))) mapping.totalEquity = col;
      if (!mapping.totalLAndE && (n.includes('liabequity') || n.includes('liabilitiesequity'))) mapping.totalLAndE = col;
    });
    return mapping;
  };

  // Handlers
  const handleLogin = async () => {
    setLoginError('');
    setIsLoading(true);
    
    const normalizedEmail = (loginEmail || '').toLowerCase().trim();

    if (!normalizedEmail || !loginPassword) {
      setLoginError('Please enter both email and password');
      setIsLoading(false);
      return;
    }
    
    try {
      // First, create NextAuth session for API authentication
      const { signIn, getSession } = await import('next-auth/react');
      let signInResult: any = null;
      try {
        signInResult = await signIn('credentials', {
          email: normalizedEmail,
          password: loginPassword,
          redirect: false,
        });
      } catch (e) {
        console.error('❌ NextAuth signIn threw:', e);
        setLoginError(`Login failed (auth session). Please try again.`);
        setIsLoading(false);
        return;
      }
      
      if (signInResult?.error || !signInResult?.ok) {
        console.warn('⚠️ NextAuth signIn failed:', signInResult);
        // NextAuth returns opaque error codes; keep message user-friendly.
        setLoginError('Invalid email or password');
        setIsLoading(false);
        return;
      }
      
      // Verify session was created successfully
      const session = await getSession();
      console.log('?? NextAuth session after login:', session ? 'EXISTS' : 'MISSING');
      
      if (!session) {
        setLoginError('Failed to create session. Please try again.');
        setIsLoading(false);
        return;
      }
      
      // Small delay to ensure session is fully propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then get user data from our custom endpoint
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: loginPassword }),
      });
      
      if (!loginResponse.ok) {
        let loginErrorMessage = 'Invalid email or password';
        try {
          const errorData = await loginResponse.json();
          if (loginResponse.status >= 500) {
            loginErrorMessage =
              'Login service is temporarily unavailable. Please try again in a moment.';
          } else if (typeof errorData?.error === 'string' && errorData.error.trim()) {
            loginErrorMessage = errorData.error;
          }
        } catch {
          if (loginResponse.status >= 500) {
            loginErrorMessage =
              'Login service is temporarily unavailable. Please try again in a moment.';
          }
        }
        setLoginError(loginErrorMessage);
        setIsLoading(false);
        return;
      }
      
      const loginData = await loginResponse.json();
      
      // Check if MFA enrollment is required (user hasn't set up MFA yet)
      if (loginData.mfaEnrollmentRequired) {
        console.log('?? MFA enrollment required');
        setMfaUserId(loginData.userId);
        setMfaUserEmail(loginData.email || normalizedEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAEnrollment(true);
        setIsLoading(false);
        return;
      }
      
      // Check if MFA verification is required (user has MFA enabled)
      if (loginData.mfaRequired) {
        console.log('?? MFA verification required');
        setMfaUserId(loginData.userId);
        setMfaUserEmail(normalizedEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAVerification(true);
        setIsLoading(false);
        return;
      }
      
      // No MFA required (this shouldn't happen with mandatory MFA, but handle it gracefully)
      const { user } = loginData;
      
      // Normalize role and userType to lowercase for frontend compatibility
      const normalizedUser = {
        ...user,
        role: user.role.toLowerCase(),
        userType: user.userType?.toLowerCase(),
        consultantCompanyName: user.consultantCompanyName, // Preserve consultant company name
        consultantType: user.consultantType, // Preserve consultant type
        consultantId: user.consultantId, // Preserve consultant ID
        isPrimaryContact: user.isPrimaryContact, // Preserve primary contact status
        sidebarAccess: user.sidebarAccess ?? null,
      };
      
      setCurrentUser(normalizedUser);
      setIsLoggedIn(true);
      
      // Clear assessment data from localStorage for assessment users
      if (normalizedUser.userType === 'assessment') {
        localStorage.removeItem('fs_assessmentResponses');
        localStorage.removeItem('fs_assessmentNotes');
        setAssessmentResponses({});
        setAssessmentNotes({});
      }
      
      // Set appropriate default view based on user type
      if (normalizedUser.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else if (normalizedUser.role === 'consultant') {
        setCurrentView('consultant-dashboard');
      } else if (normalizedUser.userType === 'assessment') {
        setCurrentView('ma-welcome');
      } else if (normalizedUser.userType === 'company') {
        // Company users land on Daily Alerts.
        setCurrentView('daily-alerts');
      } else {
        setCurrentView('upload');
      }
      
      if (normalizedUser.role !== 'consultant' && normalizedUser.role !== 'siteadmin') {
        setSelectedCompanyId(user.companyId || '');
      }
      
      // Load user's data after login
      if (normalizedUser.role === 'consultant' && user.consultantId) {
        const { companies: loadedCompanies } = await companiesApi.getAll(user.consultantId);
        safeSetCompanies(loadedCompanies || []);
        
        // Check payment for business users (have companyId) OR consultants with companies
        let needsPayment = false;
        
        if (user.companyId && loadedCompanies && loadedCompanies.length > 0) {
          // Business user - check their company's payment
          const userCompany = loadedCompanies.find((c: any) => c.id === user.companyId);
          if (userCompany) {
            setSelectedCompanyId(userCompany.id);
            setExpandedCompanyInfoId(userCompany.id);
            needsPayment = !userCompany.selectedSubscriptionPlan;
          }
        } else if (loadedCompanies && loadedCompanies.length > 0) {
                  // Consultant with companies - check if any company has unpaid status
                  // For now, if they have companies, select the first one
                  // But prioritize company with master data for Goals page testing
                  const companyWithMasterData = loadedCompanies.find((c: any) => c.id === 'cmgmttbfh0004qhgwm6vd9oa5');
                  const companyToSelect = companyWithMasterData || loadedCompanies[0];
                  setSelectedCompanyId(companyToSelect.id);
                  setExpandedCompanyInfoId(companyToSelect.id);
                  needsPayment = !companyToSelect.selectedSubscriptionPlan;
        }
        
        // Note: Consultants now start at consultant-dashboard view (Team Management / Company List)
        // setAdminDashboardTab('company-management'); // Not needed for consultant-dashboard view
      }
      
      // Load company data for company users
      if (normalizedUser.userType === 'company' && user.companyId) {
        try {
          const response = await fetch(`/api/companies?companyId=${user.companyId}`);
          const data = await response.json();
          if (data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
            safeSetCompanies(data.companies);
            // Ensure selectedCompanyId is set
            setSelectedCompanyId(user.companyId);
            console.log('✅ Loaded company for business user:', data.companies[0].name);
          } else {
            safeSetCompanies([]);
            console.warn('⚠️ No company found for business user');
          }
        } catch (error) {
          console.error('Failed to load company data:', error);
          safeSetCompanies([]);
        }
        
        // Load consultant data to show consultant's company name in header
        if (normalizedUser.consultantId) {
          try {
            const consultantResponse = await fetch(`/api/consultants?id=${normalizedUser.consultantId}`);
            const consultantData = await consultantResponse.json();
            if (consultantData && consultantData.id) {
              setConsultants([consultantData]);
            }
          } catch (error) {
            console.error('Failed to load consultant data:', error);
          }
        }
      }
      
      setLoginEmail('');
      setLoginPassword('');
      setLoginError('');
    } catch (error) {
      if (error instanceof ApiError) {
        setLoginError(error.message);
      } else {
        setLoginError('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFAEnrollmentComplete = async () => {
    console.log('? MFA enrollment completed');
    setShowMFAEnrollment(false);
    
    // After enrollment, user is now fully authenticated
    // Get user data from session (no need to re-authenticate)
    try {
      const { getSession } = await import('next-auth/react');
      await getSession(); // Refresh session
      
      // Get user data using session (no password required)
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('? Failed to get user data after MFA enrollment');
        setLoginError('Failed to complete login after MFA setup');
        return;
      }
      
      const { user } = await response.json();
      console.log('? User data retrieved after MFA enrollment:', user);
      console.log('🔍 companyRole from API:', user.companyRole);
      
      // Continue with normal login flow
      const normalizedUser = {
        ...user,
        role: user.role.toLowerCase(),
        userType: user.userType?.toLowerCase(),
        companyRole: user.companyRole, // Preserve companyRole
        consultantCompanyName: user.consultantCompanyName,
        consultantType: user.consultantType,
        consultantId: user.consultantId,
        isPrimaryContact: user.isPrimaryContact,
        sidebarAccess: user.sidebarAccess ?? null,
      };
      
      setCurrentUser(normalizedUser);
      setIsLoggedIn(true);
      
      // Clear assessment data for assessment users
      if (normalizedUser.userType === 'assessment') {
        localStorage.removeItem('fs_assessmentResponses');
        localStorage.removeItem('fs_assessmentNotes');
        setAssessmentResponses({});
        setAssessmentNotes({});
      }
      
      // Set appropriate view
      if (normalizedUser.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else if (normalizedUser.role === 'consultant') {
        setCurrentView('consultant-dashboard');
      } else if (normalizedUser.userType === 'assessment') {
        setCurrentView('ma-welcome');
      } else if (normalizedUser.userType === 'company') {
        // Load company data for business users
        if (user.companyId) {
          try {
            const companyResponse = await fetch(`/api/companies?companyId=${user.companyId}`);
            const companyData = await companyResponse.json();
            if (companyData.companies && Array.isArray(companyData.companies) && companyData.companies.length > 0) {
              safeSetCompanies(companyData.companies);
              setSelectedCompanyId(user.companyId);
              console.log('✅ Loaded company after MFA enrollment:', companyData.companies[0].name);
              // Delay setting view to allow React to complete state updates
              setTimeout(() => {
                setCurrentView('daily-alerts');
                setAdminDashboardTab('company-management');
              }, 100);
            }
          } catch (error) {
            console.error('Error loading company after MFA enrollment:', error);
            setTimeout(() => setCurrentView('daily-alerts'), 100);
          }
        } else {
          setTimeout(() => setCurrentView('daily-alerts'), 100);
        }
      } else {
        setCurrentView('upload');
      }
      
      if (normalizedUser.role !== 'consultant' && normalizedUser.role !== 'siteadmin') {
        setSelectedCompanyId(user.companyId || '');
      }
      
      setLoginEmail('');
      setLoginPassword('');
      setLoginError('');
    } catch (error) {
      console.error('Error completing MFA enrollment:', error);
      setLoginError('Failed to complete login after MFA setup');
    }
  };

  const handleMFAVerificationComplete = async () => {
    console.log('? MFA verification completed');
    setShowMFAVerification(false);
    setTrustDurationDays(null);
    
    // After verification, continue with normal login flow
    try {
      const { getSession } = await import('next-auth/react');
      await getSession(); // Refresh session
      
      // Get user data using session (no password required)
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('? Failed to get user data after MFA verification');
        setLoginError('Failed to complete login after MFA verification');
        return;
      }
      
      const { user } = await response.json();
      console.log('? User data retrieved after MFA verification:', user);
      
      // Continue with normal login flow (same as above)
      const normalizedUser = {
        ...user,
        role: user.role.toLowerCase(),
        userType: user.userType?.toLowerCase(),
        consultantCompanyName: user.consultantCompanyName,
        consultantType: user.consultantType,
        consultantId: user.consultantId,
        isPrimaryContact: user.isPrimaryContact,
        sidebarAccess: user.sidebarAccess ?? null,
      };
      
      setCurrentUser(normalizedUser);
      setIsLoggedIn(true);
      
      // Clear assessment data for assessment users
      if (normalizedUser.userType === 'assessment') {
        localStorage.removeItem('fs_assessmentResponses');
        localStorage.removeItem('fs_assessmentNotes');
        setAssessmentResponses({});
        setAssessmentNotes({});
      }
      
      // Set appropriate view
      if (normalizedUser.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else if (normalizedUser.role === 'consultant') {
        setCurrentView('consultant-dashboard');
      } else if (normalizedUser.userType === 'assessment') {
        setCurrentView('ma-welcome');
      } else if (normalizedUser.userType === 'company') {
        // Load company data for business users
        if (user.companyId) {
          try {
            const companyResponse = await fetch(`/api/companies?companyId=${user.companyId}`);
            const companyData = await companyResponse.json();
            if (companyData.companies && Array.isArray(companyData.companies) && companyData.companies.length > 0) {
              safeSetCompanies(companyData.companies);
              setSelectedCompanyId(user.companyId);
              console.log('✅ Loaded company after MFA verification:', companyData.companies[0].name);
              // Delay setting view to allow React to complete state updates
              setTimeout(() => {
                setCurrentView('daily-alerts');
                setAdminDashboardTab('company-management');
              }, 100);
            }
          } catch (error) {
            console.error('Error loading company after MFA verification:', error);
            setTimeout(() => setCurrentView('daily-alerts'), 100);
          }
        } else {
          setTimeout(() => setCurrentView('daily-alerts'), 100);
        }
      } else {
        setCurrentView('upload');
      }
      
      if (normalizedUser.role !== 'consultant' && normalizedUser.role !== 'siteadmin') {
        setSelectedCompanyId(user.companyId || '');
      }
      
      setLoginEmail('');
      setLoginPassword('');
      setLoginError('');
    } catch (error) {
      console.error('Error completing MFA verification:', error);
      setLoginError('Failed to complete login after MFA verification');
    }
  };

  const handleMFACancel = () => {
    console.log('? MFA verification cancelled');
    setShowMFAVerification(false);
    setShowMFAEnrollment(false);
    setMfaUserId('');
    setMfaUserEmail('');
    setTrustDurationDays(null);
    setLoginError('Login cancelled');
  };

  const handleRegisterConsultant = async () => {
    setLoginError('');
    setIsLoading(true);
    
    // Validate required fields
    if (!loginName || !loginEmail || !loginPassword || !loginPhone || !loginCompanyName || 
        !loginCompanyAddress1 || !loginCompanyCity || !loginCompanyState || !loginCompanyZip) { 
      setLoginError('Please fill in all required fields');
      setIsLoading(false);
      return; 
    }
    
    try {
      // Register the user
      const { user } = await authApi.register({
        name: loginName,
        email: loginEmail,
        password: loginPassword,
        fullName: loginName,
        phone: loginPhone,
        companyName: loginCompanyName,
        companyAddress1: loginCompanyAddress1,
        companyAddress2: loginCompanyAddress2 || undefined,
        companyCity: loginCompanyCity,
        companyState: loginCompanyState,
        companyZip: loginCompanyZip,
        companyWebsite: loginCompanyWebsite || undefined
      });
      
      // Create NextAuth session after registration
      const { signIn, getSession } = await import('next-auth/react');
      const signInResult = await signIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });
      
      if (signInResult?.error || !signInResult?.ok) {
        console.error('Failed to create session after registration');
        setLoginError('Registration successful but login failed. Please try logging in.');
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }
      
      // Verify session was created successfully
      const session = await getSession();
      console.log('?? NextAuth session after registration:', session ? 'EXISTS' : 'MISSING');
      
      if (!session) {
        setLoginError('Registration successful but session creation failed. Please try logging in.');
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }
      
      // Small delay to ensure session is fully propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check MFA requirements after registration
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      if (!loginResponse.ok) {
        setLoginError('Registration successful but login failed. Please try logging in.');
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }

      const loginData = await loginResponse.json();

      if (loginData.mfaEnrollmentRequired) {
        setMfaUserId(loginData.userId);
        setMfaUserEmail(loginData.email || loginEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAEnrollment(true);
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }

      if (loginData.mfaRequired) {
        setMfaUserId(loginData.userId);
        setMfaUserEmail(loginEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAVerification(true);
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }

      const { user: loginUser } = loginData;
      const normalizedUser = {
        ...loginUser,
        role: loginUser.role.toLowerCase(),
        userType: loginUser.userType?.toLowerCase(),
        consultantType: loginUser.consultantType,
        consultantCompanyName: loginUser.consultantCompanyName,
        consultantId: loginUser.consultantId,
        sidebarAccess: (loginUser as any).sidebarAccess ?? null,
      };

      setCurrentUser(normalizedUser);
      setIsLoggedIn(true);
      setCurrentView('consultant-dashboard');
      
      // Clear any stale company data and load fresh data for the new consultant
      safeSetCompanies([]);
      if (loginUser.consultantId) {
        try {
          const { companies: consultantCompanies } = await companiesApi.getAll(loginUser.consultantId);
          safeSetCompanies(consultantCompanies || []);
        } catch (error) {
          console.error('Failed to load companies after registration:', error);
        }
      }
      
      // Clear all form fields
      setLoginName('');
      setLoginEmail('');
      setLoginPassword('');
      setLoginPhone('');
      setLoginCompanyName('');
      setLoginCompanyAddress1('');
      setLoginCompanyAddress2('');
      setLoginCompanyCity('');
      setLoginCompanyState('');
      setLoginCompanyZip('');
      setLoginCompanyWebsite('');
      setIsRegistering(false);
      setLoginError('');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setLoginError('This email is already registered. Please login instead.');
        } else {
          setLoginError(error.message);
        }
      } else {
        setLoginError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    // Sign out from NextAuth
    const { signOut } = await import('next-auth/react');
    await signOut({ redirect: false });
    
    // Clear application state
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentView('login');
    setSelectedCompanyId('');
    setExistingCompanyUserName('');
    setExistingCompanyUserEmail('');
    setExistingAssessmentUserName('');
    setExistingAssessmentUserEmail('');
    setRawRows([]);
    setMapping({ date: '' });
    setFile(null);
    setColumns([]);
    localStorage.removeItem('fs_currentUser');
    localStorage.removeItem('fs_selectedCompanyId');
  };

  // Load master data and extract categories for dynamic goals
  const loadMasterDataForGoals = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first');
      return;
    }

    try {
      console.log('?? Loading master data for goals:', selectedCompanyId);
      const response = await fetch(`/api/master-data?companyId=${selectedCompanyId}`);
      const data = await response.json();

      if (!response.ok) {
        alert(`Failed to load master data: ${data.error}`);
        return;
      }

      // Extract categories from master data
      const categories = extractCategoriesFromMasterData(data.monthlyData);
      setMasterDataCategories(categories);

      console.log('? Loaded categories from master data:', categories.length);
      alert(`Loaded ${categories.length} expense categories from master data`);

    } catch (error) {
      console.error('Error loading master data:', error);
      alert('Failed to load master data');
    }
  };

  // Helper function to get nested object values
  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Extract COGS and expense categories from master data
  const extractCategoriesFromMasterData = (monthlyData: any[]) => {
    const cogsCategories = new Set<string>();
    const expenseCategories = new Set<string>();

    monthlyData.forEach(month => {
      // Extract COGS categories
      if (month.incomeStatement?.cogs) {
        Object.keys(month.incomeStatement.cogs).forEach(key => {
          if (month.incomeStatement.cogs[key] && month.incomeStatement.cogs[key] !== 0) {
            cogsCategories.add(key);
          }
        });
      }

      // Extract operating expense categories
      if (month.incomeStatement?.operatingExpenses) {
        Object.keys(month.incomeStatement.operatingExpenses).forEach(key => {
          if (month.incomeStatement.operatingExpenses[key] && month.incomeStatement.operatingExpenses[key] !== 0) {
            expenseCategories.add(key);
          }
        });
      }
    });

    // Convert to array format expected by goals table
    const categories: any[] = [];

    // Add COGS categories
    Array.from(cogsCategories).sort().forEach(key => {
      categories.push({
        key: `cogs_${key}`,
        label: `${key.charAt(0).toUpperCase() + key.slice(1)}`,
        category: 'COGS',
        masterDataKey: key,
        masterDataPath: `incomeStatement.cogs.${key}`
      });
    });

    // Add expense categories
    Array.from(expenseCategories).sort().forEach(key => {
      categories.push({
        key: `expense_${key}`,
        label: `${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}`,
        category: 'Expense',
        masterDataKey: key,
        masterDataPath: `incomeStatement.operatingExpenses.${key}`
      });
    });

    return categories;
  };

  const addCompany = async () => {
    if (!newCompanyName || !currentUser) {
      alert('Please enter a company name');
      return;
    }
    
    if (!currentUser.consultantId) {
      alert('Error: No consultant ID found. Please log out and log back in.');
      console.error('Current user:', currentUser);
      return;
    }
    
    const trimmedName = newCompanyName.trim();
    const trimmedAffiliateCode = selectedAffiliateCodeForNewCompany?.trim();

    setIsLoading(true);
    try {
      console.log('Creating company:', {
        name: trimmedName,
        consultantId: currentUser.consultantId,
        affiliateCode: trimmedAffiliateCode || undefined,
        affiliateCodeRaw: trimmedAffiliateCode,
        affiliateCodeUpper: trimmedAffiliateCode?.toUpperCase(),
      });

      const { company } = await companiesApi.create({
        name: trimmedName,
        consultantId: currentUser.consultantId,
        affiliateCode: trimmedAffiliateCode ? trimmedAffiliateCode.toUpperCase() : undefined,
      });

      console.log('Company created:', company);
      safeSetCompanies(Array.isArray(companies) ? [...companies, company] : [company]);

      setNewCompanyName('');
      setSelectedAffiliateCodeForNewCompany('');

      // Automatically select the newly created company
      setSelectedCompanyId(company.id);

      // Existing behavior (non-modal flows): send user to payments for setup.
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('payments');

      alert('Company created successfully!');
    } catch (error) {
      console.error('Error creating company:', error);
      alert(error instanceof ApiError ? error.message : 'Failed to create company');
    } finally {
      setIsLoading(false);
    }
  };

  const openAddCompanyModal = () => {
    // Prevent stale input from previous attempts.
    setNewCompanyName('');
    setSelectedAffiliateCodeForNewCompany('');
    setShowAddCompanyModal(true);
  };

  const addCompanyFromConsultantModal = async () => {
    if (!currentUser) {
      alert('Please login again.');
      return;
    }
    if (!currentUser.consultantId) {
      alert('Error: No consultant ID found. Please log out and log back in.');
      console.error('Current user:', currentUser);
      return;
    }

    const trimmedName = newCompanyName.trim();
    const trimmedAffiliateCode = selectedAffiliateCodeForNewCompany?.trim();

    if (!trimmedName) {
      alert('Please enter a company name');
      return;
    }

    setIsLoading(true);
    try {
      const { company } = await companiesApi.create({
        name: trimmedName,
        consultantId: currentUser.consultantId,
        affiliateCode: trimmedAffiliateCode ? trimmedAffiliateCode.toUpperCase() : undefined,
      });

      safeSetCompanies(Array.isArray(companies) ? [...companies, company] : [company]);

      // Clear and close modal before navigation to avoid flicker.
      setNewCompanyName('');
      setSelectedAffiliateCodeForNewCompany('');
      setShowAddCompanyModal(false);

      // Select and redirect to Company Management -> Profile for the new company.
      setSelectedCompanyId(company.id);
      setCurrentView('admin');
      setAdminDashboardTab('company-management');
      setCompanyManagementSubTab('profile');

      alert('Company created successfully!');
    } catch (error) {
      console.error('Error creating company:', error);
      alert(error instanceof ApiError ? error.message : 'Failed to create company');
    } finally {
      setIsLoading(false);
    }
  };


  // Team Management Functions
  const fetchTeamMembers = async () => {
    if (!currentUser?.consultantId) return;
    try {
      const response = await fetch(`/api/consultants/team?consultantId=${currentUser.consultantId}`);
      const data = await response.json();
      if (response.ok) {
        setConsultantTeamMembers(data.teamMembers || []);
      } else {
        console.error('Failed to fetch team members:', data.error);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

  const addTeamMember = async () => {
    if (!newTeamMember.name || !newTeamMember.email || !newTeamMember.password) {
      alert('Please fill in name, email, and password');
      return;
    }
    if (!currentUser?.consultantId) {
      alert('Error: No consultant ID found');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/consultants/team', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultantId: currentUser.consultantId,
          ...newTeamMember
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setConsultantTeamMembers([...consultantTeamMembers, data.teamMember]);
        setNewTeamMember({name: '', email: '', phone: '', title: '', password: ''});
        setShowAddTeamMemberForm(false);
        alert('Team member added successfully!');
      } else {
        alert(data.error || 'Failed to add team member');
      }
    } catch (error) {
      console.error('Error adding team member:', error);
      alert('Failed to add team member');
    } finally {
      setIsLoading(false);
    }
  };

  const removeTeamMember = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from your team?`)) return;
    if (!currentUser?.consultantId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/consultants/team?userId=${userId}&consultantId=${currentUser.consultantId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setConsultantTeamMembers(consultantTeamMembers.filter(m => m.id !== userId));
        alert('Team member removed successfully');
      } else {
        alert(data.error || 'Failed to remove team member');
      }
    } catch (error) {
      console.error('Error removing team member:', error);
      alert('Failed to remove team member');
    } finally {
      setIsLoading(false);
    }
  };

  // QuickBooks Functions
  const checkQBStatus = async (companyId: string) => {
    try {
      const response = await fetch(`/api/quickbooks/status?companyId=${companyId}`);
      const data = await response.json();
      
      if (data.connected) {
        setQbConnected(true);
        setQbStatus(data.status);
        // Only update qbLastSync if the timestamp actually changed (prevent infinite loop)
        const newSyncTime = data.lastSyncAt ? new Date(data.lastSyncAt).getTime() : null;
        const currentSyncTime = qbLastSync ? qbLastSync.getTime() : null;
        if (newSyncTime !== currentSyncTime) {
          setQbLastSync(data.lastSyncAt ? new Date(data.lastSyncAt) : null);
        }
        setQbError(data.errorMessage);
      } else {
        setQbConnected(false);
        setQbStatus('NOT_CONNECTED');
        if (qbLastSync !== null) {
          setQbLastSync(null);
        }
        setQbError(null);
      }
    } catch (error) {
      console.error('Failed to check QuickBooks status:', error);
      setQbError('Failed to check connection status');
    }
  };

  const parseErpCaoPayloadFromJson = (raw: string): Record<string, unknown> => {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid JSON object');
    }
    const source = parsed as Record<string, unknown>;
    const payload =
      source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : source;
    return payload;
  };

  const refreshCompanyMappings = async (companyId: string) => {
    const response = await fetch(`/api/account-mappings?companyId=${companyId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to refresh account mappings');
    }
    const loadedMappings = Array.isArray(data.mappings)
      ? data.mappings.map((m: any) => ({
          qbAccount: m.qbAccount,
          qbAccountId: m.qbAccountId,
          qbAccountCode: m.qbAccountCode,
          qbAccountClassification: m.qbAccountClassification,
          targetField: m.targetField,
          confidence: m.confidence || 'medium',
          lobAllocations: m.lobAllocations,
          sourceStatus: m.sourceStatus || 'mapped',
        }))
      : [];
    setAiMappings(loadedMappings);
    setShowMappingSection(loadedMappings.length > 0);
    setMappingSourceSummary(data.sourceSummary || null);
  };

  const loadErpCaoInDataMapping = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(erpCaoThroughMonth)) {
      alert('Select a valid Through month first (YYYY-MM).');
      return;
    }
    if (!selectedAccountingSystem || !['QUICKBOOKS_DESKTOP', 'INFOR_M3'].includes(String(selectedAccountingSystem).toUpperCase())) {
      alert('ERP COA Load is currently available for QuickBooks Desktop and Infor M3.');
      return;
    }

    setErpCaoLoading(true);
    try {
      let payload: Record<string, unknown> | undefined = undefined;
      if (erpCaoUploadFile) {
        const raw = await erpCaoUploadFile.text();
        payload = parseErpCaoPayloadFromJson(raw);
      }

      const response = await fetch('/api/erp/coa-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          throughMonth: erpCaoThroughMonth,
          payload,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.details || result?.error || 'Failed to load ERP COA data');
      }

      await refreshCompanyMappings(selectedCompanyId);
      setQbLastSync(new Date());
      setErpCaoUploadFile(null);
      alert(
        `ERP COA load complete. Through month: ${erpCaoThroughMonth}. ` +
          `${typeof result?.recordsImported === 'number' ? `${result.recordsImported} monthly records processed.` : ''}`
      );
    } catch (error: any) {
      alert(`ERP COA load failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setErpCaoLoading(false);
    }
  };

  const connectQuickBooks = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first');
      return;
    }

    try {
      const response = await fetch(`/api/quickbooks/auth?companyId=${selectedCompanyId}`);
      const data = await response.json();
      
      if (data.authUri) {
        // Redirect to QuickBooks OAuth page
        window.location.href = data.authUri;
      } else {
        throw new Error('Failed to generate authorization URL');
      }
    } catch (error) {
      console.error('Failed to initiate QuickBooks connection:', error);
      alert('Failed to connect to QuickBooks. Please try again.');
    }
  };

  const syncQuickBooks = async () => {
    if (!selectedCompanyId || !currentUser) {
      alert('Please select a company first');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(apiFinancialTargetMonth)) {
      alert('Select a valid target month first (YYYY-MM).');
      return;
    }

    setQbSyncing(true);
    setQbError(null);

    try {
      const response = await fetch('/api/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyId: selectedCompanyId,
          userId: currentUser.id,
          targetMonth: apiFinancialTargetMonth,
          mode: apiFinancialImportMode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update sync timestamp - this will trigger the useEffect to reload data
        setQbLastSync(new Date());
        
        // Clear the master data cache so Data Review tab shows updated data
        if (selectedCompanyId) {
          masterDataStore.clearCompanyCache(selectedCompanyId);
          console.log('?? Master data cache cleared after QuickBooks sync');
        }
        
        // Refresh QuickBooks status
        if (selectedCompanyId) {
          await checkQBStatus(selectedCompanyId);
        }
        
        alert(
          `QuickBooks data synced successfully! ${data.recordsImported || 0} months imported through ${apiFinancialTargetMonth} (${apiFinancialImportMode}).`
        );
      } else {
        // Include detailed error message from API
        const errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Sync failed');
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('QuickBooks sync error:', error);
      const errorMessage = error.message || 'Failed to sync data';
      setQbError(errorMessage);
      alert('Failed to sync QuickBooks data:\n\n' + errorMessage);
    } finally {
      setQbSyncing(false);
    }
  };

  const disconnectQuickBooks = async () => {
    if (!selectedCompanyId) return;

    if (!confirm('Are you sure you want to disconnect QuickBooks? You can reconnect anytime.')) {
      return;
    }

    try {
      const response = await fetch('/api/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });

      const data = await response.json();

      if (response.ok) {
        setQbConnected(false);
        setQbStatus('NOT_CONNECTED');
        setQbLastSync(null);
        setQbError(null);
        alert('QuickBooks disconnected successfully');
      } else {
        throw new Error(data.error || 'Disconnect failed');
      }
    } catch (error: any) {
      console.error('QuickBooks disconnect error:', error);
      alert('Failed to disconnect QuickBooks: ' + (error.message || 'Unknown error'));
    }
  };

  // Xero Functions
  const checkXeroStatus = async (companyId: string) => {
    try {
      const response = await fetch(`/api/xero/status?companyId=${companyId}`);
      const data = await response.json();
      
      if (data.connected) {
        setXeroConnected(true);
        setXeroStatus(data.status);
        const newSyncTime = data.lastSyncAt ? new Date(data.lastSyncAt).getTime() : null;
        const currentSyncTime = xeroLastSync ? xeroLastSync.getTime() : null;
        if (newSyncTime !== currentSyncTime) {
          setXeroLastSync(data.lastSyncAt ? new Date(data.lastSyncAt) : null);
        }
        setXeroError(data.errorMessage);
      } else {
        setXeroConnected(false);
        setXeroStatus('NOT_CONNECTED');
        if (xeroLastSync !== null) {
          setXeroLastSync(null);
        }
        setXeroError(null);
      }
    } catch (error) {
      console.error('Failed to check Xero status:', error);
      setXeroError('Failed to check connection status');
    }
  };

  const connectXero = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first');
      return;
    }

    try {
      const response = await fetch(`/api/xero/auth?companyId=${selectedCompanyId}`);
      const data = await response.json();
      
      if (data.authUri) {
        window.location.href = data.authUri;
      } else {
        throw new Error('Failed to generate authorization URL');
      }
    } catch (error) {
      console.error('Failed to initiate Xero connection:', error);
      alert('Failed to connect to Xero. Please try again.');
    }
  };

  const syncXero = async () => {
    if (!selectedCompanyId || !currentUser) {
      alert('Please select a company first');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(apiFinancialTargetMonth)) {
      alert('Select a valid target month first (YYYY-MM).');
      return;
    }

    setXeroSyncing(true);
    setXeroError(null);

    try {
      const response = await fetch('/api/xero/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyId: selectedCompanyId,
          userId: currentUser.id,
          targetMonth: apiFinancialTargetMonth,
          mode: apiFinancialImportMode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setXeroLastSync(new Date());
        
        if (selectedCompanyId) {
          await checkXeroStatus(selectedCompanyId);
        }
        
        alert(
          `Xero data synced successfully! ${data.recordsImported || 0} records imported through ${apiFinancialTargetMonth} (${apiFinancialImportMode}).`
        );
      } else {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || 'Sync failed');
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('Xero sync error:', error);
      const errorMessage = error.message || 'Failed to sync data';
      setXeroError(errorMessage);
      alert('Failed to sync Xero data:\n\n' + errorMessage);
    } finally {
      setXeroSyncing(false);
    }
  };

  const disconnectXero = async () => {
    if (!selectedCompanyId) return;

    if (!confirm('Are you sure you want to disconnect Xero? You can reconnect anytime.')) {
      return;
    }

    try {
      const response = await fetch('/api/xero/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });

      const data = await response.json();

      if (response.ok) {
        setXeroConnected(false);
        setXeroStatus('NOT_CONNECTED');
        setXeroLastSync(null);
        setXeroError(null);
        alert('Xero disconnected successfully');
      } else {
        throw new Error(data.error || 'Disconnect failed');
      }
    } catch (error: any) {
      console.error('Xero disconnect error:', error);
      alert('Failed to disconnect Xero: ' + (error.message || 'Unknown error'));
    }
  };

  // Infor M3 Functions
  const checkInforM3Status = async (companyId: string) => {
    try {
      const response = await fetch(`/api/infor-m3/status?companyId=${companyId}`);
      const data = await response.json();

      if (data.connected) {
        setInforConnected(true);
        setInforStatus(data.status);
        setInforLastSync(data.lastSyncAt ? new Date(data.lastSyncAt) : null);
        setInforError(data.errorMessage || null);
      } else {
        setInforConnected(false);
        setInforStatus('NOT_CONNECTED');
        setInforLastSync(null);
        setInforError(null);
      }
      return data;
    } catch (error) {
      console.error('Failed to check Infor M3 status:', error);
      setInforError('Failed to check Infor M3 connection status');
      return null;
    }
  };

  const loadInforM3Credentials = async (companyId: string) => {
    try {
      const response = await fetch(`/api/infor-m3/credentials?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      if (!data?.credentials) return;
      setInforCredentials({
        tenantId: data.credentials.tenantId || '',
        clientName: data.credentials.clientName || '',
        clientId: data.credentials.clientId || '',
        clientSecret: data.credentials.clientSecret || '',
        ionApiBaseUrl: data.credentials.ionApiBaseUrl || '',
        ssoBaseUrl: data.credentials.ssoBaseUrl || '',
        oauthAuthPath: data.credentials.oauthAuthPath || '',
        oauthTokenPath: data.credentials.oauthTokenPath || '',
        oauthRevokePath: data.credentials.oauthRevokePath || '',
        serviceAccountAccessKey: data.credentials.serviceAccountAccessKey || '',
        serviceAccountSecretKey: data.credentials.serviceAccountSecretKey || '',
      });
    } catch (error) {
      console.error('Failed to load Infor M3 credentials:', error);
    }
  };

  const connectInforM3 = async (targetCompanyId?: string) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) {
      alert('Please select a company first');
      return;
    }

    const requiredFields: Array<keyof typeof inforCredentials> = [
      'tenantId',
      'clientId',
      'clientSecret',
      'ionApiBaseUrl',
      'ssoBaseUrl',
      'serviceAccountAccessKey',
      'serviceAccountSecretKey',
    ];
    const missing = requiredFields.filter((field) => !inforCredentials[field]?.trim());
    if (missing.length > 0) {
      alert(`Missing required Infor M3 fields: ${missing.join(', ')}`);
      return;
    }

    setInforBusy(true);
    setInforError(null);
    setInforProbeSummary(null);
    try {
      const response = await fetch('/api/infor-m3/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          ...inforCredentials,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'Infor M3 connect failed');
      }

      await checkInforM3Status(companyId);
      alert('Infor M3 credentials validated and saved for this company.');
    } catch (error: any) {
      console.error('Infor M3 connect error:', error);
      const message = error?.message || 'Failed to connect Infor M3';
      setInforError(message);
      alert(`Failed to connect Infor M3:\n\n${message}`);
    } finally {
      setInforBusy(false);
    }
  };

  const saveInforM3Credentials = async (
    targetCompanyId?: string,
    schedule?: { frequency: 'daily' | 'weekly' | 'monthly'; pullTime: string }
  ) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) {
      alert('Please select a company first');
      return;
    }

    const requiredFields: Array<keyof typeof inforCredentials> = [
      'tenantId',
      'clientId',
      'clientSecret',
      'ionApiBaseUrl',
      'ssoBaseUrl',
      'serviceAccountAccessKey',
      'serviceAccountSecretKey',
    ];
    const missing = requiredFields.filter((field) => !inforCredentials[field]?.trim());
    if (missing.length > 0) {
      alert(`Missing required Infor M3 fields: ${missing.join(', ')}`);
      return;
    }

    setInforBusy(true);
    setInforError(null);
    try {
      const response = await fetch('/api/infor-m3/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          ...inforCredentials,
          ...(schedule ? { frequency: schedule.frequency, pullTime: schedule.pullTime } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'Save failed');
      }
      await checkInforM3Status(companyId);
      alert('Infor M3 credentials saved for this company.');
    } catch (error: any) {
      const message = error?.message || 'Failed to save Infor M3 credentials';
      setInforError(message);
      alert(`Failed to save Infor M3 credentials:\n\n${message}`);
    } finally {
      setInforBusy(false);
    }
  };

  const testInforM3Token = async (targetCompanyId?: string) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) return;
    setInforBusy(true);
    setInforError(null);
    try {
      const response = await fetch(`/api/infor-m3/test-token?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'Token test failed');
      }
      alert(`Infor M3 token test passed. Token endpoint: ${data.tokenEndpoint}`);
    } catch (error: any) {
      console.error('Infor M3 token test error:', error);
      const message = error?.message || 'Failed to test Infor M3 token';
      setInforError(message);
      alert(`Infor M3 token test failed:\n\n${message}`);
    } finally {
      setInforBusy(false);
    }
  };

  const probeInforM3 = async (targetCompanyId?: string) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) return;
    if (!inforProbePath.trim()) {
      alert('Please enter an Infor M3 probe path');
      return;
    }
    setInforBusy(true);
    setInforError(null);
    try {
      const response = await fetch(
        `/api/infor-m3/probe?companyId=${companyId}&path=${encodeURIComponent(inforProbePath.trim())}`
      );
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'Probe failed');
      }

      const summary = `Probe OK (${data.status}) - ${data.url}`;
      setInforProbeSummary(summary);
      alert(summary);
    } catch (error: any) {
      console.error('Infor M3 probe error:', error);
      const message = error?.message || 'Failed to probe Infor M3 endpoint';
      setInforError(message);
      setInforProbeSummary(null);
      alert(`Infor M3 probe failed:\n\n${message}`);
    } finally {
      setInforBusy(false);
    }
  };

  const disconnectInforM3 = async (targetCompanyId?: string) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) return;
    if (!confirm('Are you sure you want to disconnect Infor M3?')) {
      return;
    }

    setInforBusy(true);
    try {
      const response = await fetch('/api/infor-m3/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || 'Disconnect failed');
      }

      setInforConnected(false);
      setInforStatus('NOT_CONNECTED');
      setInforLastSync(null);
      setInforError(null);
      setInforProbeSummary(null);
      alert('Infor M3 disconnected successfully');
    } catch (error: any) {
      console.error('Infor M3 disconnect error:', error);
      alert('Failed to disconnect Infor M3: ' + (error?.message || 'Unknown error'));
    } finally {
      setInforBusy(false);
    }
  };

  const runInforM3OperationalSync = async (
    targetCompanyId?: string,
    frequency: 'daily' | 'weekly' | 'monthly' = 'daily'
  ) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) return;
    setInforBusy(true);
    setInforError(null);
    try {
      const response = await fetch('/api/infor-m3/operational-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, frequency }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        const details = Array.isArray(data?.errors) && data.errors.length > 0
          ? data.errors.join('\n')
          : data?.details || data?.error || 'Operational sync failed';
        throw new Error(details);
      }
      await checkInforM3Status(companyId);
      alert(`Infor M3 operational sync complete. Records created: ${data.recordsCreated ?? 0}.`);
    } catch (error: any) {
      const message = error?.message || 'Failed to run Infor M3 operational sync';
      setInforError(message);
      alert(`Infor M3 operational sync failed:\n\n${message}`);
    } finally {
      setInforBusy(false);
    }
  };

  const runPlatformOperationalSync = async (
    targetCompanyId?: string,
    frequency: 'daily' | 'weekly' | 'monthly' = 'daily'
  ) => {
    const companyId = targetCompanyId || selectedCompanyId;
    if (!companyId) return;

    try {
      const response = await fetch('/api/operational-sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, frequency }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        const details =
          Array.isArray(data?.errors) && data.errors.length > 0
            ? data.errors.join('\n')
            : data?.details || data?.error || 'Operational sync failed';
        throw new Error(details);
      }
      const moduleCounts =
        data?.moduleCounts && typeof data.moduleCounts === 'object'
          ? data.moduleCounts as Record<string, number>
          : null;
      const moduleLines = moduleCounts
        ? [
            `Cash: ${Number(moduleCounts.cash || 0)}`,
            `AR Aging: ${Number(moduleCounts.arAging || 0)}`,
            `AP Aging: ${Number(moduleCounts.apAging || 0)}`,
            `Customers: ${Number(moduleCounts.customers || 0)}`,
            `Products: ${Number(moduleCounts.products || 0)}`,
            `Inventory: ${Number(moduleCounts.inventory || 0)}`,
          ]
        : [];
      const details = moduleLines.length ? `\n\nBy module:\n${moduleLines.join('\n')}` : '';
      const companyForSync = Array.isArray(companies) ? companies.find((c) => c.id === companyId) : null;
      const accountingSystem = String(companyForSync?.accountingSystem || '').toUpperCase();

      // Refresh connector status so "Last synced" updates immediately in API Connections.
      if (accountingSystem === 'QUICKBOOKS' || accountingSystem === 'QUICKBOOKS_DESKTOP') {
        await checkQBStatus(companyId);
      } else if (accountingSystem === 'XERO') {
        await checkXeroStatus(companyId);
      } else if (accountingSystem === 'INFOR_M3') {
        await checkInforM3Status(companyId);
      }

      alert(`Operational sync complete. Records created: ${data.recordsCreated ?? 0}.${details}`);
    } catch (error: any) {
      alert(`Operational sync failed:\n\n${error?.message || 'Unknown error'}`);
    }
  };

  const pullInforMonthlyCao = async () => {
    if (!selectedCompanyId) return;
    setInforCaoPulling(true);
    setInforCaoMessage(null);
    try {
      const response = await fetch('/api/infor-m3/sync-coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Monthly COA pull failed');
      }
      await fetchInforLastCaoPull(selectedCompanyId);
      setInforCaoMessage(
        `Monthly COA pull complete. Program: ${data.accountsProgram}. Records imported: ${data.recordsImported ?? 0}.`
      );
    } catch (error: any) {
      const message = error?.message || 'Monthly COA pull failed';
      setInforCaoMessage(`Error: ${message}`);
    } finally {
      setInforCaoPulling(false);
    }
  };

  const fetchInforLastCaoPull = async (companyId: string) => {
    try {
      const response = await fetch(`/api/infor-m3/sync-coa?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.hasData) {
        setInforLastCaoPullAt(null);
        setInforLastCaoPulledBy(null);
        return;
      }
      setInforLastCaoPullAt(data.lastPullAt ? new Date(data.lastPullAt) : null);
      setInforLastCaoPulledBy(typeof data.pulledByEmail === 'string' ? data.pulledByEmail : null);
    } catch (error) {
      console.error('Failed to fetch last Infor COA pull:', error);
      setInforLastCaoPullAt(null);
      setInforLastCaoPulledBy(null);
    }
  };

  const getCompanyUsers = (companyId: string, userType?: 'company' | 'assessment') => {
    if (userType) {
      return users.filter(u => u.companyId === companyId && u.role === 'user' && u.userType === userType);
    }
    return users.filter(u => u.companyId === companyId && u.role === 'user');
  };
  const getCurrentCompany = () => Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : undefined;
  const handleCompanyUpdated = (updatedCompany: any) => {
    if (!updatedCompany?.id) return;
    setCompanies((prev) => {
      const prevCompanies = Array.isArray(prev) ? prev : [];
      const exists = prevCompanies.some((c: any) => c.id === updatedCompany.id);
      if (!exists) return [...prevCompanies, updatedCompany];
      return prevCompanies.map((c: any) => (c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c));
    });
  };

  const applyActiveCompany = async (companyId: string) => {
    await authApi.selectCompany(companyId);
    setSelectedCompanyId(companyId);
    setExpandedCompanyInfoId(companyId);
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const membership = Array.isArray(prev.accessibleCompanies)
        ? prev.accessibleCompanies.find((c) => c.companyId === companyId)
        : undefined;
      return {
        ...prev,
        companyId,
        activeCompanyId: companyId,
        companyRole: (membership?.companyRole as any) ?? prev.companyRole,
        sidebarAccess: (membership?.sidebarAccess as any) ?? prev.sidebarAccess,
      };
    });
  };

  const handleSelectCompany = async (companyId: string) => {
    const company = Array.isArray(companies) ? companies.find(c => c.id === companyId) : undefined;
    if (!company) return;
    try {
      await applyActiveCompany(companyId);
      // Navigate to Company Management for the selected company.
      setCurrentView('admin');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to switch company';
      alert(message);
    }
  };

  const saveCompanyDetails = async () => {
    if (!companyIndustrySector) { 
      alert('Please select an industry sector'); 
      return; 
    }
    if (!accountingSystem) {
      alert('Please select an accounting system');
      return;
    }
    setIsLoading(true);
    try {
      const { company } = await companiesApi.update(editingCompanyId, {
        addressStreet: companyAddressStreet,
        addressCity: companyAddressCity,
        addressState: companyAddressState,
        addressZip: companyAddressZip,
        addressCountry: companyAddressCountry,
        industrySector: companyIndustrySector as number,
        accountingSystem,
        companySizeCategory: companySizeCategory || null,
        industrySectorCategory: industrySectorCategory || null
      });
      safeSetCompanies(Array.isArray(companies) ? companies.map(c => c.id === editingCompanyId ? { ...c, ...company } : c) : [company]);
      setSelectedCompanyId(editingCompanyId);
      setShowCompanyDetailsModal(false);
      
      // Expand the company that was just saved
      setExpandedCompanyInfoId(editingCompanyId);
      
      setEditingCompanyId('');
      setCompanyAddressStreet('');
      setCompanyAddressCity('');
      setCompanyAddressState('');
      setCompanyAddressZip('');
      setCompanyAddressCountry('USA');
      setCompanyIndustrySector('');
      setAccountingSystem('');
      setCompanySizeCategory('DEFAULT');
      setIndustrySectorCategory('01');
      
      // Stay on Consultant Dashboard
      setCurrentView('admin');
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to update company');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSubscriptionPricing = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first');
      return;
    }
    setIsLoading(true);
    try {
      const { company } = await companiesApi.updatePricing(
        selectedCompanyId,
        subscriptionMonthlyPrice || 0,
        subscriptionQuarterlyPrice || 0,
        subscriptionAnnualPrice || 0,
        subscriptionSetupFee || 0
      );
      
      console.log('?? Subscription pricing saved:', company);
      
      // Update the companies list with the new pricing
      safeSetCompanies(Array.isArray(companies) ? companies.map(c => c.id === selectedCompanyId ? { ...c, ...company } : c) : [company]);
      
      // Reload companies list to ensure fresh data
      if (currentUser?.consultantId) {
        const allCompanies = await companiesApi.getAll(currentUser.consultantId);
        safeSetCompanies(allCompanies);
      }
      
      alert('Subscription pricing saved successfully!');
    } catch (error) {
      console.error('? Error saving subscription pricing:', error);
      alert(error instanceof ApiError ? error.message : 'Failed to save subscription pricing');
    } finally {
      setIsLoading(false);
    }
  };

  const addUser = async (companyId: string, userType: 'company' | 'assessment' = 'company') => {
    // Get the appropriate state variables based on userType
    const name = userType === 'company' ? newCompanyUserName : newAssessmentUserName;
    const title = userType === 'company' ? newCompanyUserTitle : newAssessmentUserTitle;
    const email = userType === 'company' ? newCompanyUserEmail : newAssessmentUserEmail;
    const phone = userType === 'company' ? newCompanyUserPhone : undefined; // Phone only for company users
    const password = userType === 'company' ? newCompanyUserPassword : newAssessmentUserPassword;
    
    if (!name || !email) { 
      alert('Please fill required fields (Name, Email)'); 
      return; 
    }
    
    setIsLoading(true);
    try {
      console.log('Creating user:', { name, title, email, phone, companyId, userType: userType.toUpperCase() });
      console.log('Current users in state:', users);
      console.log('Filtered company users:', users.filter(u => u.companyId === companyId && u.userType === 'company'));
      console.log('Filtered assessment users:', users.filter(u => u.companyId === companyId && u.userType === 'assessment'));
      
      const { user, linkedExistingUser } = await usersApi.create({
        name,
        title,
        email,
        phone,
        password,
        companyId: companyId,
        userType: userType.toUpperCase() as 'COMPANY' | 'ASSESSMENT'
      });
      console.log('User created from API:', user);
      
      // Normalize role and userType to lowercase
      const normalizedUser = {
        ...user,
        role: user.role.toLowerCase(),
        userType: user.userType?.toLowerCase()
      };
      console.log('Normalized user:', normalizedUser);
      
      setUsers([...users, normalizedUser]);
      console.log('Users after adding:', [...users, normalizedUser]);
      
      // Clear the appropriate fields based on userType
      if (userType === 'company') {
        setNewCompanyUserName('');
        setNewCompanyUserTitle('');
        setNewCompanyUserEmail('');
        setNewCompanyUserPhone('');
        setNewCompanyUserPassword('');
      } else {
        setNewAssessmentUserName('');
        setNewAssessmentUserTitle('');
        setNewAssessmentUserEmail('');
        setNewAssessmentUserPassword('');
      }
      
      if (linkedExistingUser) {
        alert(`Access granted to existing user:\n\n${email}\n\nNo password was changed. The user keeps their existing login credentials.`);
      } else {
        alert(`${userType === 'company' ? 'Company' : 'Assessment'} user created successfully!`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      if (error instanceof ApiError) {
        if (error.message.includes('already has access to this company')) {
          alert(`User already has access\n\n"${email}" already has access to this company.`);
        } else if (error.message.includes('already registered')) {
          alert(`Email already in use\n\n"${email}" is already registered in the system.\n\nTip: leave password blank and add this email to grant company access.`);
        } else if (error.message.includes('Password does not meet requirements')) {
          alert('Password does not meet requirements:\n\n• At least 8 characters\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (!@#$%^&*)\n\nPlease create a stronger password.');
        } else {
          alert(error.message);
        }
      } else {
        alert('Failed to add user');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const grantExistingUserAccess = async (
    companyId: string,
    userType: 'company' | 'assessment' = 'company',
  ) => {
    const name =
      userType === 'company' ? existingCompanyUserName.trim() : existingAssessmentUserName.trim();
    const email =
      userType === 'company' ? existingCompanyUserEmail.trim() : existingAssessmentUserEmail.trim();
    if (!name) {
      alert('Please enter the user name.');
      return;
    }
    if (!email) {
      alert('Please enter an email to grant access.');
      return;
    }

    setIsLoading(true);
    try {
      const { user, linkedExistingUser } = await usersApi.create({
        name,
        email,
        password: undefined,
        companyId,
        userType: userType.toUpperCase() as 'COMPANY' | 'ASSESSMENT',
      });

      const normalizedUser = {
        ...user,
        companyId,
        role: user.role.toLowerCase(),
        // Show in the selected section immediately after grant.
        userType: userType.toLowerCase(),
      };
      setUsers((prev) => {
        const existingIndex = prev.findIndex(
          (u) => u.id === normalizedUser.id && u.companyId === companyId
        );
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...normalizedUser };
          return next;
        }
        return [...prev, normalizedUser];
      });

      if (linkedExistingUser) {
        alert(
          `Access granted to existing user:\n\n${email}\n\nNo password was changed. The user keeps their existing login credentials.`,
        );
      } else {
        alert(`User created and added:\n\n${email}`);
      }

      if (userType === 'company') {
        setExistingCompanyUserName('');
        setExistingCompanyUserEmail('');
      } else {
        setExistingAssessmentUserName('');
        setExistingAssessmentUserEmail('');
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message.includes('already has access to this company')) {
          alert(`User already has access\n\n"${email}" already has access to this company.`);
        } else if (error.message.toLowerCase().includes('password is required')) {
          alert(
            `No existing account found for:\n\n${email}\n\nUse "Create New User" and set a password to create this user.`,
          );
        } else {
          alert(error.message);
        }
      } else {
        alert('Failed to grant access');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId: string, companyId?: string) => {
    if (!confirm('Delete this user?')) return;
    setIsLoading(true);
    try {
      await usersApi.delete(userId, companyId);
      setUsers((prev) =>
        prev.filter((u) =>
          companyId ? !(u.id === userId && u.companyId === companyId) : u.id !== userId
        )
      );
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to delete user');
    } finally {
      setIsLoading(false);
    }
  };

  // Consultant CRUD functions
  const addConsultant = async () => {
    if (!newConsultantType || !newConsultantFullName || !newConsultantEmail || !newConsultantPhone || !newConsultantPassword) {
      alert('Please fill all required fields (Type, Contact Person, Email, Phone, Password)');
      return;
    }
    setIsLoading(true);
    try {
      const { consultant } = await consultantsApi.create({
        fullName: newConsultantFullName,
        email: newConsultantEmail,
        password: newConsultantPassword,
        address: newConsultantAddress,
        phone: newConsultantPhone,
        type: newConsultantType,
        companyName: newConsultantCompanyName,
        companyAddress1: newConsultantCompanyAddress1,
        companyAddress2: newConsultantCompanyAddress2,
        companyCity: newConsultantCompanyCity,
        companyState: newConsultantCompanyState,
        companyZip: newConsultantCompanyZip,
        companyWebsite: newConsultantCompanyWebsite
      });
      
      // Add to local state (will be refreshed on next load)
      const newConsultant: Consultant = {
        id: consultant.id,
        type: consultant.type || newConsultantType,
        fullName: consultant.fullName,
        address: consultant.address || newConsultantAddress,
        email: consultant.email,
        phone: consultant.phone || newConsultantPhone,
        password: '', // Don't store password in state
        companyName: consultant.companyName || newConsultantCompanyName,
        companyAddress1: consultant.companyAddress1 || newConsultantCompanyAddress1,
        companyAddress2: consultant.companyAddress2 || newConsultantCompanyAddress2,
        companyCity: consultant.companyCity || newConsultantCompanyCity,
        companyState: consultant.companyState || newConsultantCompanyState,
        companyZip: consultant.companyZip || newConsultantCompanyZip,
        companyWebsite: consultant.companyWebsite || newConsultantCompanyWebsite
      };
      setConsultants([...consultants, newConsultant]);
      
      // Clear form
      setNewConsultantType('');
      setNewConsultantFullName('');
      setNewConsultantAddress('');
      setNewConsultantEmail('');
      setNewConsultantPhone('');
      setNewConsultantPassword('');
      setNewConsultantCompanyName('');
      setNewConsultantCompanyAddress1('');
      setNewConsultantCompanyAddress2('');
      setNewConsultantCompanyCity('');
      setNewConsultantCompanyState('');
      setNewConsultantCompanyZip('');
      setNewConsultantCompanyWebsite('');
    } catch (error) {
      if (error instanceof ApiError && error.message.includes('Password does not meet requirements')) {
        alert('Password does not meet requirements:\n\n• At least 8 characters\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (!@#$%^&*)\n\nPlease create a stronger password.');
      } else {
        alert(error instanceof ApiError ? error.message : 'Failed to add consultant');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateCompanyPricing = async (companyId: string, pricing: { monthly: number; quarterly: number; annual: number; setupFee: number }) => {
    try {
      await companiesApi.updatePricing(companyId, pricing.monthly, pricing.quarterly, pricing.annual, pricing.setupFee);
      
      // Update local state
      safeSetCompanies(Array.isArray(companies) ? companies.map(c => 
        c.id === companyId 
          ? { 
              ...c, 
              subscriptionMonthlyPrice: pricing.monthly,
              subscriptionQuarterlyPrice: pricing.quarterly,
              subscriptionAnnualPrice: pricing.annual,
              subscriptionSetupFee: pricing.setupFee,
              selectedSubscriptionPlan: null // Reset selected plan when pricing changes
            } 
          : c
      ) : []);
      
      // Clear editing state
      setEditingPricing((prev) => {
        const newState = { ...prev };
        delete newState[companyId];
        return newState;
      });
      
      alert('Pricing updated successfully! The business will see the new pricing on their next login or when they refresh.');
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to update pricing');
    }
  };

  const updateConsultantInfo = async (consultantId: string, info: { 
    fullName: string; 
    email: string; 
    address: string; 
    phone: string; 
    type: string;
    companyName?: string;
    companyAddress1?: string;
    companyAddress2?: string;
    companyCity?: string;
    companyState?: string;
    companyZip?: string;
    companyWebsite?: string;
    revenueSharePercentage?: number;
  }) => {
    try {
      const response = await consultantsApi.update(consultantId, info);
      
      // Update local state
      setConsultants(consultants.map(c => 
        c.id === consultantId 
          ? { 
              ...c, 
              fullName: info.fullName,
              email: info.email,
              address: info.address,
              phone: info.phone,
              type: info.type,
              companyName: info.companyName,
              companyAddress1: info.companyAddress1,
              companyAddress2: info.companyAddress2,
              companyCity: info.companyCity,
              companyState: info.companyState,
              companyZip: info.companyZip,
              companyWebsite: info.companyWebsite,
              revenueSharePercentage: info.revenueSharePercentage ?? c.revenueSharePercentage
            } 
          : c
      ));
      
      // Clear editing state
      setEditingConsultantInfo((prev) => {
        const newState = { ...prev };
        delete newState[consultantId];
        return newState;
      });
      
      alert('Consultant information updated successfully');
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to update consultant information');
    }
  };

  const deleteConsultant = async (consultantId: string) => {
    if (!confirm('Delete this consultant? This will also delete all their companies and users.')) return;
    setIsLoading(true);
    try {
      await consultantsApi.delete(consultantId);
      
      // Update local state
      setConsultants(consultants.filter(c => c.id !== consultantId));
      const consultantCompanies = Array.isArray(companies) ? companies.filter(c => c.consultantId === consultantId) : [];
      const companyIds = consultantCompanies.map(c => c.id);
      safeSetCompanies(Array.isArray(companies) ? companies.filter(c => c.consultantId !== consultantId) : []);
      setUsers(users.filter(u => !companyIds.includes(u.companyId) && u.id !== consultantId));
      setFinancialDataRecords(financialDataRecords.filter(r => !companyIds.includes(r.companyId)));
      setAssessmentRecords(assessmentRecords.filter(r => !companyIds.includes(r.companyId)));
    } catch (error) {
      alert(error instanceof ApiError ? error.message : 'Failed to delete consultant');
    } finally {
      setIsLoading(false);
    }
  };

  const getConsultantCompanies = (consultantId: string) => {
    if (!Array.isArray(companies)) return [];
    return companies.filter(c => c.consultantId === consultantId).sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    console.log('?? handleFile called');
    const f = e.target.files?.[0];
    if (!f) {
      console.log('? No file selected');
      return;
    }
    if (!selectedCompanyId) {
      console.log('? No company selected');
      alert('Please select a company first');
      return;
    }
    console.log('? File selected:', f.name, 'Company:', selectedCompanyId);

    setFile(f);
    setError(null);
    setIsFreshUpload(true);
    console.log('?? Set isFreshUpload=true, processing file...');
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { cellDates: false });
    
    // Use Sheet1 if available (transposed format), otherwise use first sheet
    const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
    
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (json.length < 2) { setError('File appears empty or invalid'); return; }
    
    // Check if this is a transposed format (field names in column A, dates in row 0)
    const firstCell = json[0] && (json[0] as any)[0];
    const isTransposed = firstCell === null || firstCell === '' || (typeof firstCell === 'number' && firstCell > 40000); // Excel date serial numbers
    
    if (isTransposed) {
      // Transposed format: Row 0 has dates, Column A has field names
      console.log('Detected transposed format, converting...');
      const dateRow = json[0] as any[];
      const dates = dateRow.slice(1).filter(d => d !== null && d !== ''); // Skip first column
      
      // Convert Excel serial numbers to dates
      const parsedDates = dates.map(d => {
        if (typeof d === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + d * 24 * 60 * 60 * 1000);
          return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        }
        return d;
      });
      
      // Build normal format: each row is a month
      const rows: any[] = [];
      for (let monthIdx = 0; monthIdx < parsedDates.length; monthIdx++) {
        const monthRow: any = { 'Date': parsedDates[monthIdx] };
        
        // For each field (row in original)
        for (let fieldIdx = 1; fieldIdx < json.length; fieldIdx++) {
          const fieldRow = json[fieldIdx] as any[];
          const fieldName = fieldRow[0];
          const fieldValue = fieldRow[monthIdx + 1]; // +1 because column 0 is field name
          if (fieldName) {
            monthRow[fieldName] = fieldValue;
          }
        }
        rows.push(monthRow);
      }
      
      const header = ['Date', ...json.slice(1).map((r: any) => r[0]).filter(n => n)];
      setRawRows(rows);
      setColumns(header);
      setMapping(autoMapColumns(header));
    } else {
      // Normal format: Row 0 has headers, each row is a month
      const header = json[0] as any[];
      const dataRows = json.slice(1);
      const rows = dataRows.map(row => {
        const obj: any = {};
        header.forEach((h, i) => { obj[h] = (row as any[])[i] == null || (row as any[])[i] === '' ? null : (row as any[])[i]; });
        return obj;
      });
      setRawRows(rows);
      setColumns(header);
      setMapping(autoMapColumns(header));
    }
  };

  const hasMeaningfulFinancialData = (row: any): boolean => {
    if (!row || typeof row !== 'object') return false;
    const keys = [
      'revenue',
      'expense',
      'cogsTotal',
      'cash',
      'ar',
      'inventory',
      'ap',
      'tca',
      'tcl',
      'totalAssets',
      'totalLiab',
      'totalEquity',
    ];
    return keys.some((key) => Math.abs(Number(row[key] || 0)) > 0.0001);
  };

  // Calculate monthly data
  const monthly = useMemo(() => {
    // If we have loaded monthly data from QuickBooks, use it directly
    if (loadedMonthlyData && loadedMonthlyData.length > 0) {
      const source = String(latestFinancialSource || '').toLowerCase();
      const isApiSource = !!source && !source.includes('csv');
      if (!isApiSource) return loadedMonthlyData;

      // API imports can include padded zero months; hide those so charts start at real data.
      return loadedMonthlyData.filter((row: any) => hasMeaningfulFinancialData(row));
    }
    
    // Otherwise, process from CSV rawRows
    if (!rawRows || rawRows.length === 0 || !mapping.date) return [];
    return rawRows.map((row, i) => ({
      month: row[mapping.date] || `Month ${i + 1}`,
      // Income Statement
      revenue: parseFloat(row[mapping.revenue!]) || 0,
      expense: parseFloat(row[mapping.expense!]) || 0,
      cogsPayroll: parseFloat(row[mapping.cogsPayroll!]) || 0,
      cogsOwnerPay: parseFloat(row[mapping.cogsOwnerPay!]) || 0,
      cogsContractors: parseFloat(row[mapping.cogsContractors!]) || 0,
      cogsMaterials: parseFloat(row[mapping.cogsMaterials!]) || 0,
      cogsCommissions: parseFloat(row[mapping.cogsCommissions!]) || 0,
      cogsOther: parseFloat(row[mapping.cogsOther!]) || 0,
      cogsTotal: parseFloat(row[mapping.cogsTotal!]) || 0,
      salesExpense: parseFloat(row[mapping.salesExpense!]) || 0,
      rent: parseFloat(row[mapping.rent!]) || 0,
      infrastructure: parseFloat(row[mapping.infrastructure!]) || 0,
      autoTravel: parseFloat(row[mapping.autoTravel!]) || 0,
      professionalFees: parseFloat(row[mapping.professionalFees!]) || 0,
      insurance: parseFloat(row[mapping.insurance!]) || 0,
      marketing: parseFloat(row[mapping.marketing!]) || 0,
      payroll: parseFloat(row[mapping.payroll!]) || 0,
      ownerBasePay: parseFloat(row[mapping.ownerBasePay!]) || 0,
      ownersRetirement: parseFloat(row[mapping.ownersRetirement!]) || 0,
      subcontractors: parseFloat(row[mapping.subcontractors!]) || 0,
      interestExpense: parseFloat(row[mapping.interestExpense!]) || 0,
      depreciationAmortization: parseFloat(row[mapping.depreciationAmortization!]) || 0,
      operatingExpenseTotal: parseFloat(row[mapping.operatingExpenseTotal!]) || 0,
      nonOperatingIncome: parseFloat(row[mapping.nonOperatingIncome!]) || 0,
      extraordinaryItems: parseFloat(row[mapping.extraordinaryItems!]) || 0,
      netProfit: parseFloat(row[mapping.netProfit!]) || 0,
      // Balance Sheet - Assets (reusing from above if already defined)
      totalAssets: parseFloat(row[mapping.totalAssets!]) || 0,
      totalLiab: parseFloat(row[mapping.totalLiab!]) || 0,
      cash: parseFloat(row[mapping.cash!]) || 0,
      ar: parseFloat(row[mapping.ar!]) || 0,
      inventory: parseFloat(row[mapping.inventory!]) || 0,
      otherCA: parseFloat(row[mapping.otherCA!]) || 0,
      tca: parseFloat(row[mapping.tca!]) || 0,
      fixedAssets: parseFloat(row[mapping.fixedAssets!]) || 0,
      otherAssets: parseFloat(row[mapping.otherAssets!]) || 0,
      ap: parseFloat(row[mapping.ap!]) || 0,
      loc: parseFloat(row[mapping.loc!]) || 0,
      otherCL: parseFloat(row[mapping.otherCL!]) || 0,
      tcl: parseFloat(row[mapping.tcl!]) || 0,
      ltd: parseFloat(row[mapping.ltd!]) || 0,
      // Balance Sheet - Equity Detail
      ownersCapital: parseFloat(row[mapping.ownersCapital!]) || 0,
      ownersDraw: parseFloat(row[mapping.ownersDraw!]) || 0,
      commonStock: parseFloat(row[mapping.commonStock!]) || 0,
      preferredStock: parseFloat(row[mapping.preferredStock!]) || 0,
      retainedEarnings: parseFloat(row[mapping.retainedEarnings!]) || 0,
      additionalPaidInCapital: parseFloat(row[mapping.additionalPaidInCapital!]) || 0,
      treasuryStock: parseFloat(row[mapping.treasuryStock!]) || 0,
      totalEquity: parseFloat(row[mapping.totalEquity!]) || 0,
      totalLAndE: parseFloat(row[mapping.totalLAndE!]) || 0
    }));
  }, [rawRows, mapping, loadedMonthlyData, latestFinancialSource]).map(m => {
    // Calculate Total Operating Expenses using standard chart of accounts (same as Data Review)
    // Use the SAME calculation as Data Review for Total Operating Expenses
    const opexCategories = [
      'payroll', 'ownerBasePay', 'ownersRetirement', 'professionalFees',
      'rent', 'utilities', 'infrastructure', 'autoTravel', 'insurance',
      'salesExpense', 'subcontractors', 'depreciationAmortization', 'interestExpense',
      'marketing', 'benefits', 'taxLicense', 'phoneComm', 'trainingCert',
      'mealsEntertainment', 'otherExpense'
    ];
    const totalOperatingExpense = opexCategories.reduce((sum, key) => sum + ((m as any)[key] || 0), 0);

    // Always use calculated total operating expenses (matches Data Review)
    const expense = totalOperatingExpense;

    // Calculate Gross Profit, EBIT and EBITDA for each month
    const revenue = m.revenue || 0;
    const cogsTotal = m.cogsTotal || 0;
    const interestExpense = m.interestExpense || 0;
    const depreciationAmortization = m.depreciationAmortization || 0;
    const netProfit = m.netProfit || 0;

    // Gross Profit = Revenue - COGS
    const grossProfit = revenue - cogsTotal;
    // EBIT = Revenue - COGS - Operating Expenses (interest already included in operating expenses)
    const ebit = revenue - cogsTotal - expense;
    // EBITDA = EBIT + Interest Expense + Depreciation + Amortization
    // (Add back interest expense that was included in operating expenses)
    const ebitda = ebit + interestExpense + depreciationAmortization;

    
    return {
      ...m,
      expense, // Use the calculated total operating expense
      grossProfit,
      ebit,
      ebitda
    };
  });

  const ltmRev = monthly.length >= 12 ? monthly.slice(-12).reduce((sum, m) => sum + m.revenue, 0) : 0;
  const ltmExp = monthly.length >= 12 ? monthly.slice(-12).reduce((sum, m) => sum + m.expense, 0) : 0;
  
  const growth_24mo = monthly.length >= 24 ? ((ltmRev - monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) * 100 : 0;
  const growth_6mo = monthly.length >= 12 ? ((monthly.slice(-6).reduce((sum, m) => sum + m.revenue, 0) - monthly.slice(-12, -6).reduce((sum, m) => sum + m.revenue, 0)) / monthly.slice(-12, -6).reduce((sum, m) => sum + m.revenue, 0)) * 100 : 0;
  const expGrowth_24mo = monthly.length >= 24 ? ((ltmExp - monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0)) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0)) * 100 : 0;
  
  let baseRGS = 10;
  if (growth_24mo >= 25) baseRGS = 100;
  else if (growth_24mo >= 15) baseRGS = 80;
  else if (growth_24mo >= 5) baseRGS = 60;
  else if (growth_24mo >= 0) baseRGS = 50;
  else if (growth_24mo >= -5) baseRGS = 40;
  else if (growth_24mo >= -15) baseRGS = 20;
  else baseRGS = 10;
  
  let adjustedRGS = baseRGS;
  if (growth_6mo >= 25) adjustedRGS = clamp(adjustedRGS + 50, 10, 100);
  else if (growth_6mo >= 15) adjustedRGS = clamp(((100 - adjustedRGS) * 0.8) + adjustedRGS, 10, 100);
  else if (growth_6mo >= 5) adjustedRGS = clamp(((100 - adjustedRGS) * 0.6) + adjustedRGS, 10, 100);
  else if (growth_6mo >= 0) adjustedRGS = clamp(((100 - adjustedRGS) * 0.4) + adjustedRGS, 10, 100);
  else if (growth_6mo >= -5) adjustedRGS = clamp(adjustedRGS * 0.9, 10, 100);
  else if (growth_6mo >= -15) adjustedRGS = clamp(adjustedRGS * 0.7, 10, 100);
  else if (growth_6mo >= -25) adjustedRGS = clamp(adjustedRGS * 0.5, 10, 100);
  else adjustedRGS = clamp(adjustedRGS * 0.3, 10, 100);
  
  const revExpSpread = growth_24mo - expGrowth_24mo;
  let expenseAdjustment = 0;
  if (revExpSpread > 10) expenseAdjustment = 30;
  else if (revExpSpread >= 0 && revExpSpread <= 10) expenseAdjustment = 10;
  else if (revExpSpread >= -5 && revExpSpread < 0) expenseAdjustment = -10;
  else if (revExpSpread < -5) expenseAdjustment = -30;
  
  const profitabilityScore = clamp(adjustedRGS + expenseAdjustment, 10, 100);
  
  const alr1 = monthly.length > 0 ? monthly[monthly.length - 1].totalAssets / monthly[monthly.length - 1].totalLiab : 0;
  const alr13 = monthly.length >= 13 ? monthly[monthly.length - 13].totalAssets / monthly[monthly.length - 13].totalLiab : 0;
  const alrGrowth = alr13 !== 0 ? ((alr1 - alr13) / alr13) * 100 : 0;
  
  let adsBase = 10;
  if (alr1 >= 1.5) adsBase = 100;
  else if (alr1 >= 1.2) adsBase = 90;
  else if (alr1 >= 0.8) adsBase = 70;
  else if (alr1 >= 0.6) adsBase = 50;
  else if (alr1 >= 0.4) adsBase = 30;
  else adsBase = 10;
  
  let adsAdj = 0;
  if (alrGrowth >= 50) adsAdj = 20;
  else if (alrGrowth >= 30) adsAdj = 15;
  else if (alrGrowth >= 15) adsAdj = 10;
  else if (alrGrowth >= 5) adsAdj = 5;
  else if (alrGrowth >= -5) adsAdj = 0;
  else if (alrGrowth >= -15) adsAdj = -5;
  else if (alrGrowth >= -30) adsAdj = -10;
  else if (alrGrowth >= -50) adsAdj = -15;
  else adsAdj = -20;
  
  const assetDevScore = clamp(adsBase + adsAdj, 10, 100);
  const finalScore = (profitabilityScore + assetDevScore) / 2;

  // Trend data
  const trendData = useMemo(() => {
    if (monthly.length < 13) return [];
    const trends: any[] = [];
    
    for (let i = 12; i < monthly.length; i++) {
      const window = monthly.slice(i - 11, i + 1);
      const ltmR = window.reduce((s, m) => s + m.revenue, 0);
      const ltmE = window.reduce((s, m) => s + m.expense, 0);
      const prev12R = i >= 23 ? monthly.slice(i - 23, i - 11).reduce((s, m) => s + m.revenue, 0) : 0;
      const prev12E = i >= 23 ? monthly.slice(i - 23, i - 11).reduce((s, m) => s + m.revenue, 0) : 0;
      const g24 = prev12R > 0 ? ((ltmR - prev12R) / prev12R) * 100 : 0;
      const gE24 = prev12E > 0 ? ((ltmE - prev12E) / prev12E) * 100 : 0;
      const recent6R = window.slice(-6).reduce((s, m) => s + m.revenue, 0);
      const prior6R = window.slice(0, 6).reduce((s, m) => s + m.revenue, 0);
      const g6 = prior6R > 0 ? ((recent6R - prior6R) / prior6R) * 100 : 0;
      
      let bRGS = 10;
      if (g24 >= 25) bRGS = 100;
      else if (g24 >= 15) bRGS = 80;
      else if (g24 >= 5) bRGS = 60;
      else if (g24 >= 0) bRGS = 50;
      else if (g24 >= -5) bRGS = 40;
      else if (g24 >= -15) bRGS = 20;
      else bRGS = 10;
      
      let aRGS = bRGS;
      if (g6 >= 25) aRGS = clamp(aRGS + 50, 10, 100);
      else if (g6 >= 15) aRGS = clamp(((100 - aRGS) * 0.8) + aRGS, 10, 100);
      else if (g6 >= 5) aRGS = clamp(((100 - aRGS) * 0.6) + aRGS, 10, 100);
      else if (g6 >= 0) aRGS = clamp(((100 - aRGS) * 0.4) + aRGS, 10, 100);
      else if (g6 >= -5) aRGS = clamp(aRGS * 0.9, 10, 100);
      else if (g6 >= -15) aRGS = clamp(aRGS * 0.7, 10, 100);
      else if (g6 >= -25) aRGS = clamp(aRGS * 0.5, 10, 100);
      else aRGS = clamp(aRGS * 0.3, 10, 100);
      
      const spread = g24 - gE24;
      let eAdj = 0;
      if (spread > 10) eAdj = 30;
      else if (spread >= 0 && spread <= 10) eAdj = 10;
      else if (spread >= -5 && spread < 0) eAdj = -10;
      else if (spread < -5) eAdj = -30;
      
      const pScore = clamp(aRGS + eAdj, 10, 100);
      
      const alr1Val = monthly[i].totalAssets / monthly[i].totalLiab;
      const alr13Val = i >= 12 ? monthly[i - 12].totalAssets / monthly[i - 12].totalLiab : 0;
      const alrGrowthVal = alr13Val !== 0 ? ((alr1Val - alr13Val) / alr13Val) * 100 : 0;
      
      let adsB = 10;
      if (alr1Val >= 1.5) adsB = 100;
      else if (alr1Val >= 1.2) adsB = 90;
      else if (alr1Val >= 0.8) adsB = 70;
      else if (alr1Val >= 0.6) adsB = 50;
      else if (alr1Val >= 0.4) adsB = 30;
      else adsB = 10;
      
      let adsA = 0;
      if (alrGrowthVal >= 50) adsA = 20;
      else if (alrGrowthVal >= 30) adsA = 15;
      else if (alrGrowthVal >= 15) adsA = 10;
      else if (alrGrowthVal >= 5) adsA = 5;
      else if (alrGrowthVal >= -5) adsA = 0;
      else if (alrGrowthVal >= -15) adsA = -5;
      else if (alrGrowthVal >= -30) adsA = -10;
      else if (alrGrowthVal >= -50) adsA = -15;
      else adsA = -20;
      
      const aScore = clamp(adsB + adsA, 10, 100);
      const fScore = (pScore + aScore) / 2;
      
      const cur = monthly[i];
      const currentAssets = cur.tca || ((cur.cash || 0) + (cur.ar || 0) + (cur.inventory || 0) + (cur.otherCA || 0));
      const currentLiab = Math.abs(cur.tcl || ((cur.ap || 0) + (cur.loc || 0) + (cur.otherCL || 0)));
      const quickAssets = (cur.cash || 0) + (cur.ar || 0);

      const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;
      const quickRatio = currentLiab > 0 ? quickAssets / currentLiab : 0;
      
      const ltmCOGS = window.reduce((s, m) => s + m.cogsTotal, 0);
      const ltmSales = ltmR;
      const avgInv = (cur.inventory + (i >= 12 ? monthly[i-12].inventory : cur.inventory)) / 2;
      const invTurnover = avgInv > 0 ? ltmCOGS / avgInv : 0;
      
      const avgAR = (cur.ar + (i >= 12 ? monthly[i-12].ar : cur.ar)) / 2;
      const arTurnover = avgAR > 0 ? ltmSales / avgAR : 0;
      
      const avgAP = (cur.ap + (i >= 12 ? monthly[i-12].ap : cur.ap)) / 2;
      const apTurnover = avgAP > 0 ? ltmCOGS / avgAP : 0;
      
      const daysInv = invTurnover > 0 ? 365 / invTurnover : 0;
      const daysAR = arTurnover > 0 ? 365 / arTurnover : 0;
      const daysAP = apTurnover > 0 ? 365 / apTurnover : 0;
      
      const workingCap = currentAssets - currentLiab;
      
      // Get prior month for calculations
      const priorMonth = i > 0 ? monthly[i - 1] : cur;
      
      // Sales/Working Capital: Monthly revenue / Average WC (current + prior month)
      const priorMonthCurrentAssets = i > 0 ? (priorMonth.tca || ((priorMonth.cash || 0) + (priorMonth.ar || 0) + (priorMonth.inventory || 0) + (priorMonth.otherCA || 0))) : currentAssets;
      const priorMonthCurrentLiab = i > 0 ? Math.abs(priorMonth.tcl || ((priorMonth.ap || 0) + (priorMonth.loc || 0) + (priorMonth.otherCL || 0))) : currentLiab;
      const priorMonthWorkingCap = priorMonthCurrentAssets - priorMonthCurrentLiab;
      const avgWorkingCap = (workingCap + priorMonthWorkingCap) / 2;
      const salesWC = avgWorkingCap !== 0 ? (cur.revenue || 0) / avgWorkingCap : 0;
      
      const ltmInterest = ltmE * 0.05;
      const ltmEBIT = ltmR - ltmE;
      const interestCov = ltmInterest > 0 ? ltmEBIT / ltmInterest : 0;
      
      const ltmDebtSvc = cur.ltd * 0.1 + ltmInterest;
      const debtSvcCov = ltmDebtSvc > 0 ? ltmEBIT / ltmDebtSvc : 0;
      
      // Calculate Operating Cash Flow for Cash Flow to Debt ratio
      const ltmNetIncome = ltmR - ltmE;
      const ltmDepreciation = ltmE * 0.05; // Estimated depreciation
      const priorMonth12 = i >= 12 ? monthly[i - 12] : cur;
      const priorWorkingCap12CA = priorMonth12.tca || ((priorMonth12.cash || 0) + (priorMonth12.ar || 0) + (priorMonth12.inventory || 0) + (priorMonth12.otherCA || 0));
      const priorWorkingCap12CL = priorMonth12.tcl || ((priorMonth12.ap || 0) + (priorMonth12.loc || 0) + (priorMonth12.otherCL || 0));
      const priorWorkingCap = priorWorkingCap12CA - priorWorkingCap12CL;
      const changeInWorkingCap = workingCap - priorWorkingCap;
      const ltmOperatingCF = ltmNetIncome + ltmDepreciation - changeInWorkingCap;
      
      // Total Debt = Total Liabilities (more conservative) or Long Term Debt + Current Liabilities
      const totalDebt = cur.totalLiab;
      const cfToDebt = totalDebt > 0 ? ltmOperatingCF / totalDebt : 0;
      
      const debtToNW = cur.totalEquity > 0 ? cur.totalLiab / cur.totalEquity : 0;
      const fixedToNW = cur.totalEquity > 0 ? cur.fixedAssets / cur.totalEquity : 0;
      const leverage = cur.totalEquity > 0 ? cur.totalAssets / cur.totalEquity : 0;
      
      // Monthly ratios: annualize monthly income with average balance sheet values
      const avgTotalAssets = ((cur.totalAssets || 0) + (priorMonth.totalAssets || 0)) / 2;
      
      // Calculate total equity from components if totalEquity field is not populated
      const curEquity = cur.totalEquity || ((cur.ownersCapital || 0) + (cur.ownersDraw || 0) + (cur.commonStock || 0) + (cur.preferredStock || 0) + (cur.retainedEarnings || 0) + (cur.additionalPaidInCapital || 0) + (cur.treasuryStock || 0));
      const priorEquity = priorMonth.totalEquity || ((priorMonth.ownersCapital || 0) + (priorMonth.ownersDraw || 0) + (priorMonth.commonStock || 0) + (priorMonth.preferredStock || 0) + (priorMonth.retainedEarnings || 0) + (priorMonth.additionalPaidInCapital || 0) + (priorMonth.treasuryStock || 0));
      const avgTotalEquity = (curEquity + priorEquity) / 2;
      const monthlyNetIncome = (cur.revenue || 0) - (cur.cogsTotal || 0) - (cur.expense || 0);
      const annualizedNetIncome = monthlyNetIncome * 12;
      
      const totalAssetTO = avgTotalAssets > 0 ? ((cur.revenue || 0) * 12) / avgTotalAssets : 0;
      const roe = avgTotalEquity > 0 ? annualizedNetIncome / avgTotalEquity : 0;
      const roa = avgTotalAssets > 0 ? annualizedNetIncome / avgTotalAssets : 0;
      
      // EBIT and EBITDA Margins: Income statement / Income statement = use current month values
      // EBIT = Earnings Before Interest and Taxes, so add back interest expense
      const currentMonthEBIT = (cur.revenue || 0) - (cur.cogsTotal || 0) - (cur.expense || 0) + (cur.interestExpense || 0);
      const currentMonthEBITDA = currentMonthEBIT + (cur.depreciationAmortization || 0);
      const ebitMargin = (cur.revenue || 0) > 0 ? currentMonthEBIT / cur.revenue : 0;
      const ebitdaMargin = (cur.revenue || 0) > 0 ? currentMonthEBITDA / cur.revenue : 0;
      
      trends.push({
        month: cur.month,
        rgs: bRGS,
        rgsAdj: aRGS,
        expenseAdj: eAdj,
        profitabilityScore: pScore,
        alr1: alr1Val,
        alr13: alr13Val,
        alrGrowth: alrGrowthVal,
        adsScore: aScore,
        financialScore: fScore,
        currentRatio,
        quickRatio,
        invTurnover,
        arTurnover,
        apTurnover,
        daysInv,
        daysAR,
        daysAP,
        salesWC,
        interestCov,
        debtSvcCov,
        cfToDebt,
        debtToNW,
        fixedToNW,
        leverage,
        totalAssetTO,
        roe,
        roa,
        ebitdaMargin,
        ebitMargin,
        ebitda: currentMonthEBITDA,
        ebit: currentMonthEBIT
      });
    }
    
    return trends;
  }, [monthly]);

  // MD&A Analysis
  const mdaAnalysis = useMemo(() => {
    if (!trendData || trendData.length === 0) return { strengths: [], weaknesses: [], insights: [] };
    
    const last = trendData[trendData.length - 1];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const insights: string[] = [];
    
    if (finalScore >= 70) strengths.push(`Strong overall financial score of ${finalScore.toFixed(1)}, indicating robust financial health.`);
    else if (finalScore < 50) weaknesses.push(`Financial score of ${finalScore.toFixed(1)} suggests significant areas for improvement.`);
    
    if (profitabilityScore >= 70) strengths.push(`Profitability score of ${profitabilityScore.toFixed(1)} demonstrates solid revenue growth and expense management.`);
    else if (profitabilityScore < 50) weaknesses.push(`Profitability score of ${profitabilityScore.toFixed(1)} indicates challenges in revenue growth or expense control.`);
    
    if (growth_24mo > 10) strengths.push(`24-month revenue growth of ${growth_24mo.toFixed(1)}% shows strong market expansion.`);
    else if (growth_24mo < 0) weaknesses.push(`Negative 24-month revenue growth of ${growth_24mo.toFixed(1)}% requires immediate strategic attention.`);
    
    if (expenseAdjustment > 0) strengths.push(`Expense management is outperforming revenue growth by ${revExpSpread.toFixed(1)}%, adding ${expenseAdjustment} points to profitability.`);
    else if (expenseAdjustment < 0) weaknesses.push(`Expenses are growing faster than revenue by ${Math.abs(revExpSpread).toFixed(1)}%, reducing profitability by ${Math.abs(expenseAdjustment)} points.`);
    
    if (assetDevScore >= 70) strengths.push(`Asset Development Score of ${assetDevScore.toFixed(1)} reflects a healthy asset-to-liability ratio and positive asset growth.`);
    else if (assetDevScore < 50) weaknesses.push(`Asset Development Score of ${assetDevScore.toFixed(1)} suggests concerning leverage and asset composition.`);
    
    if (last.currentRatio >= 1.5) strengths.push(`Current ratio of ${last.currentRatio.toFixed(1)} indicates strong short-term liquidity.`);
    else if (last.currentRatio < 1.0) weaknesses.push(`Current ratio of ${last.currentRatio.toFixed(1)} may indicate potential liquidity challenges.`);
    
    if (last.roe > 0.15) strengths.push(`Return on Equity of ${(last.roe * 100).toFixed(1)}% demonstrates efficient use of shareholder capital.`);
    else if (last.roe < 0) weaknesses.push(`Negative Return on Equity of ${(last.roe * 100).toFixed(1)}% indicates losses relative to equity.`);
    
    // KPI Analysis
    if (last.quickRatio >= 1.0) strengths.push(`Quick ratio of ${last.quickRatio.toFixed(1)} shows strong ability to meet short-term obligations without relying on inventory.`);
    else if (last.quickRatio < 0.5) weaknesses.push(`Quick ratio of ${last.quickRatio.toFixed(1)} suggests potential cash flow challenges.`);
    
    if (last.debtToNW < 1.0) strengths.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(1)} indicates conservative leverage and strong equity position.`);
    else if (last.debtToNW > 2.0) weaknesses.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(1)} suggests high leverage that may limit financial flexibility.`);
    
    if (last.interestCov > 3.0) strengths.push(`Interest coverage ratio of ${last.interestCov.toFixed(1)} demonstrates strong ability to service debt obligations.`);
    else if (last.interestCov < 1.5) weaknesses.push(`Interest coverage of ${last.interestCov.toFixed(1)} indicates potential difficulty meeting interest payments.`);
    
    // Projection Analysis - Calculate inline to avoid circular dependency
    if (monthly.length >= 24) {
      // Calculate simple revenue projection
      const last12Months = monthly.slice(-12);
      const prior12Months = monthly.slice(-24, -12);
      const recentRevGrowth = ((last12Months.reduce((s, m) => s + m.revenue, 0) - prior12Months.reduce((s, m) => s + m.revenue, 0)) / prior12Months.reduce((s, m) => s + m.revenue, 0)) * 100;
      
      if (recentRevGrowth > 10) insights.push(`Based on 12-month trends, revenue shows ${recentRevGrowth.toFixed(1)}% growth trajectory with strong expansion potential.`);
      else if (recentRevGrowth < -5) insights.push(`Revenue trends indicate ${Math.abs(recentRevGrowth).toFixed(1)}% decline trajectory - proactive measures recommended.`);
      
      // Projected annual revenue
      const avgMonthlyRev = last12Months.reduce((s, m) => s + m.revenue, 0) / 12;
      const projectedAnnualRev = avgMonthlyRev * 12;
      
      if (recentRevGrowth > 15) insights.push(`Strong growth trajectory projects annual revenue of approximately $${(projectedAnnualRev / 1000).toFixed(0)}K with continued momentum.`);
      else if (recentRevGrowth < 0) insights.push(`Declining revenue trend requires strategic intervention to stabilize and restore growth.`);
      
      // Equity trend analysis
      const currentEquity = monthly[monthly.length - 1].totalEquity;
      const priorEquity = monthly[monthly.length - 13] ? monthly[monthly.length - 13].totalEquity : currentEquity;
      const equityChange = ((currentEquity - priorEquity) / Math.abs(priorEquity)) * 100;
      
      if (equityChange > 10) insights.push(`Equity has strengthened by ${equityChange.toFixed(1)}% over the past year, improving financial stability.`);
      else if (equityChange < -10) weaknesses.push(`Equity has declined by ${Math.abs(equityChange).toFixed(1)}% - monitor profitability and cash management closely.`);
    }
    
    // Trend Analysis Insights
    if (monthly.length >= 24) {
      const recentRevTrend = trendData.slice(-6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      const priorRevTrend = trendData.slice(-12, -6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      
      if (recentRevTrend > priorRevTrend + 10) strengths.push(`Revenue growth momentum is accelerating in recent months, indicating improving market position.`);
      else if (recentRevTrend < priorRevTrend - 10) weaknesses.push(`Revenue growth momentum is decelerating - review sales strategies and market positioning.`);
    }
    
    // Working Capital Analysis
    const lastMonth = monthly[monthly.length - 1];
    const currentAssets = lastMonth.tca || ((lastMonth.cash || 0) + (lastMonth.ar || 0) + (lastMonth.inventory || 0) + (lastMonth.otherCA || 0));
    const currentLiab = Math.abs(lastMonth.tcl || ((lastMonth.ap || 0) + (lastMonth.loc || 0) + (lastMonth.otherCL || 0)));
    const workingCapital = currentAssets - currentLiab;
    // Fix: If no current liabilities but have current assets, treat as very strong (>10.0), not 0
    const wcRatioMDA = currentLiab > 0 ? currentAssets / currentLiab : (currentAssets > 0 ? 999 : 0);
    
    if (workingCapital > 0 && wcRatioMDA >= 1.5) {
      strengths.push(`Positive working capital of $${(workingCapital / 1000).toFixed(1)}K with strong WC ratio of ${wcRatioMDA.toFixed(1)} supports operational flexibility.`);
    } else if (workingCapital < 0) {
      weaknesses.push(`Negative working capital of $${(Math.abs(workingCapital) / 1000).toFixed(1)}K indicates potential short-term funding challenges.`);
    } else if (wcRatioMDA < 1.0) {
      weaknesses.push(`Working capital ratio of ${wcRatioMDA.toFixed(1)} is below optimal levels - consider improving liquidity.`);
    }
    
    // Activity Ratios (Days metrics)
    if (last.daysAR > 0) {
      if (last.daysAR < 45) strengths.push(`Days' receivables of ${last.daysAR.toFixed(0)} days reflects efficient collection practices.`);
      else if (last.daysAR > 90) weaknesses.push(`Days' receivables of ${last.daysAR.toFixed(0)} days suggests slow collection - review credit policies and collection procedures.`);
    }
    
    if (last.daysInv > 0) {
      if (last.daysInv < 60) insights.push(`Inventory turnover of ${last.daysInv.toFixed(0)} days indicates efficient inventory management.`);
      else if (last.daysInv > 120) weaknesses.push(`Days' inventory of ${last.daysInv.toFixed(0)} days may indicate slow-moving stock - consider inventory optimization.`);
    }
    
    if (last.daysAP > 0) {
      if (last.daysAP > 45) insights.push(`Days' payables of ${last.daysAP.toFixed(0)} days provides beneficial supplier financing.`);
      else if (last.daysAP < 20) insights.push(`Days' payables of ${last.daysAP.toFixed(0)} days - consider extending payment terms to improve cash flow.`);
    }
    
    // Cash Conversion Cycle
    const cashConversionCycle = last.daysInv + last.daysAR - last.daysAP;
    if (cashConversionCycle < 30) strengths.push(`Cash conversion cycle of ${cashConversionCycle.toFixed(0)} days demonstrates excellent working capital efficiency.`);
    else if (cashConversionCycle > 90) weaknesses.push(`Cash conversion cycle of ${cashConversionCycle.toFixed(0)} days suggests opportunities to accelerate cash generation.`);
    
    // Asset Efficiency
    if (last.totalAssetTO > 1.5) strengths.push(`Total asset turnover of ${last.totalAssetTO.toFixed(1)} shows effective asset utilization in generating sales.`);
    else if (last.totalAssetTO < 0.5) weaknesses.push(`Total asset turnover of ${last.totalAssetTO.toFixed(1)} indicates underutilized assets - review asset productivity.`);
    
    // Profitability Margins
    if (last.ebitdaMargin > 0.15) strengths.push(`EBITDA margin of ${(last.ebitdaMargin * 100).toFixed(1)}% demonstrates strong operational profitability.`);
    else if (last.ebitdaMargin < 0.05) weaknesses.push(`EBITDA margin of ${(last.ebitdaMargin * 100).toFixed(1)}% requires operational cost optimization.`);
    
    // Cash Flow Analysis (estimated from financial data)
    if (monthly.length >= 13) {
      const currentCash = monthly[monthly.length - 1].cash;
      const priorYearCash = monthly[monthly.length - 13].cash;
      const cashChange = currentCash - priorYearCash;
      
      if (cashChange > ltmRev * 0.1) strengths.push(`Cash position improved by $${(cashChange / 1000).toFixed(1)}K over the past year, strengthening financial resilience.`);
      else if (cashChange < -ltmRev * 0.05) weaknesses.push(`Cash declined by $${(Math.abs(cashChange) / 1000).toFixed(1)}K - monitor cash flow and consider working capital improvements.`);
    }
    
    // Benchmark Comparison (if available)
    if (benchmarks && benchmarks.length > 0) {
      // Helper function to get benchmark value
      const getBenchmark = (metricName: string) => {
        const bm = benchmarks.find(b => b.metricName === metricName);
        return bm ? bm.fiveYearValue : null;
      };
      
      // Current Ratio Benchmark
      const currentRatioBM = getBenchmark('Current Ratio');
      if (currentRatioBM !== null && last.currentRatio) {
        if (last.currentRatio > currentRatioBM * 1.2) {
          strengths.push(`Current ratio of ${last.currentRatio.toFixed(1)} is ${((last.currentRatio / currentRatioBM - 1) * 100).toFixed(0)}% above industry average (${currentRatioBM.toFixed(1)}), demonstrating superior liquidity management.`);
        } else if (last.currentRatio < currentRatioBM * 0.8) {
          weaknesses.push(`Current ratio of ${last.currentRatio.toFixed(1)} is ${((1 - last.currentRatio / currentRatioBM) * 100).toFixed(0)}% below industry average (${currentRatioBM.toFixed(1)}), indicating potential liquidity concerns relative to peers.`);
        }
      }
      
      // Quick Ratio Benchmark
      const quickRatioBM = getBenchmark('Quick Ratio');
      if (quickRatioBM !== null && last.quickRatio) {
        if (last.quickRatio > quickRatioBM * 1.2) {
          strengths.push(`Quick ratio of ${last.quickRatio.toFixed(1)} significantly exceeds industry benchmark (${quickRatioBM.toFixed(1)}), highlighting exceptional short-term financial strength.`);
        } else if (last.quickRatio < quickRatioBM * 0.8) {
          weaknesses.push(`Quick ratio of ${last.quickRatio.toFixed(1)} lags industry average (${quickRatioBM.toFixed(1)}) by ${((1 - last.quickRatio / quickRatioBM) * 100).toFixed(0)}%, suggesting need for improved cash management.`);
        }
      }
      
      // Debt-to-Net Worth Benchmark
      const debtToNWBM = getBenchmark('Total Debt to Net Worth Ratio');
      if (debtToNWBM !== null && last.debtToNW) {
        if (last.debtToNW < debtToNWBM * 0.7) {
          strengths.push(`Debt-to-Net Worth of ${last.debtToNW.toFixed(1)} is well below industry average (${debtToNWBM.toFixed(1)}), indicating conservative leverage and strong balance sheet.`);
        } else if (last.debtToNW > debtToNWBM * 1.3) {
          weaknesses.push(`Debt-to-Net Worth of ${last.debtToNW.toFixed(1)} exceeds industry norm (${debtToNWBM.toFixed(1)}) by ${((last.debtToNW / debtToNWBM - 1) * 100).toFixed(0)}%, suggesting higher financial risk profile.`);
        }
      }
      
      // Gross Profit Margin Benchmark
      const grossProfitBM = getBenchmark('Gross Profit Margin %');
      if (grossProfitBM !== null && last.grossMargin) {
        if (last.grossMargin > grossProfitBM / 100 * 1.1) {
          strengths.push(`Gross profit margin of ${(last.grossMargin * 100).toFixed(1)}% outperforms industry average (${grossProfitBM.toFixed(1)}%), demonstrating strong pricing power and cost management.`);
        } else if (last.grossMargin < grossProfitBM / 100 * 0.9) {
          weaknesses.push(`Gross margin of ${(last.grossMargin * 100).toFixed(1)}% trails industry benchmark (${grossProfitBM.toFixed(1)}%), indicating potential pricing or cost structure challenges.`);
        }
      }
      
      // Return on Assets Benchmark
      const roaBM = getBenchmark('Return on Total Assets %');
      if (roaBM !== null && last.roa) {
        if (last.roa > roaBM / 100 * 1.2) {
          strengths.push(`Return on Assets of ${(last.roa * 100).toFixed(1)}% is ${(((last.roa * 100) / roaBM - 1) * 100).toFixed(0)}% above industry average (${roaBM.toFixed(1)}%), reflecting superior asset productivity.`);
        } else if (last.roa < roaBM / 100 * 0.8) {
          weaknesses.push(`ROA of ${(last.roa * 100).toFixed(1)}% is below industry standard (${roaBM.toFixed(1)}%), suggesting opportunities for improved asset utilization.`);
        }
      }
      
      // Return on Equity Benchmark
      const roeBM = getBenchmark('Return on Net Worth %');
      if (roeBM !== null && last.roe) {
        if (last.roe > roeBM / 100 * 1.2) {
          strengths.push(`Return on Equity of ${(last.roe * 100).toFixed(1)}% substantially exceeds industry benchmark (${roeBM.toFixed(1)}%), indicating exceptional returns for shareholders.`);
        } else if (last.roe < roeBM / 100 * 0.8) {
          weaknesses.push(`ROE of ${(last.roe * 100).toFixed(1)}% underperforms industry average (${roeBM.toFixed(1)}%), suggesting need for profitability improvement.`);
        }
      }
      
      // Days AR Benchmark
      const daysARBM = getBenchmark('Days\' Receivables');
      if (daysARBM !== null && last.daysAR > 0) {
        if (last.daysAR < daysARBM * 0.8) {
          strengths.push(`Days' receivables of ${last.daysAR.toFixed(0)} days is ${((1 - last.daysAR / daysARBM) * 100).toFixed(0)}% faster than industry average (${daysARBM.toFixed(0)} days), demonstrating superior collection efficiency.`);
        } else if (last.daysAR > daysARBM * 1.2) {
          weaknesses.push(`Collection period of ${last.daysAR.toFixed(0)} days exceeds industry norm (${daysARBM.toFixed(0)} days) by ${((last.daysAR / daysARBM - 1) * 100).toFixed(0)}%, indicating room for accounts receivable optimization.`);
        }
      }
      
      // Days Inventory Benchmark
      const daysInvBM = getBenchmark('Days\' Inventory');
      if (daysInvBM !== null && last.daysInv > 0) {
        if (last.daysInv < daysInvBM * 0.8) {
          insights.push(`Inventory turnover (${last.daysInv.toFixed(0)} days) is ${((1 - last.daysInv / daysInvBM) * 100).toFixed(0)}% faster than industry average (${daysInvBM.toFixed(0)} days), indicating lean inventory management.`);
        } else if (last.daysInv > daysInvBM * 1.2) {
          weaknesses.push(`Inventory holding period of ${last.daysInv.toFixed(0)} days is ${((last.daysInv / daysInvBM - 1) * 100).toFixed(0)}% longer than industry benchmark (${daysInvBM.toFixed(0)} days), suggesting potential obsolescence risk.`);
        }
      }
      
      // Days AP Benchmark
      const daysAPBM = getBenchmark('Days\' Payables');
      if (daysAPBM !== null && last.daysAP > 0) {
        if (last.daysAP > daysAPBM * 1.1) {
          insights.push(`Payment terms of ${last.daysAP.toFixed(0)} days exceed industry average (${daysAPBM.toFixed(0)} days), providing favorable cash flow timing and supplier financing.`);
        } else if (last.daysAP < daysAPBM * 0.8) {
          insights.push(`Payment period of ${last.daysAP.toFixed(0)} days is shorter than industry norm (${daysAPBM.toFixed(0)} days) - consider negotiating extended terms to improve cash flow.`);
        }
      }
      
      // Asset Turnover Benchmark
      const assetTOBM = getBenchmark('Total Asset Turnover');
      if (assetTOBM !== null && last.totalAssetTO) {
        if (last.totalAssetTO > assetTOBM * 1.2) {
          strengths.push(`Asset turnover of ${last.totalAssetTO.toFixed(1)} exceeds industry average (${assetTOBM.toFixed(1)}) by ${((last.totalAssetTO / assetTOBM - 1) * 100).toFixed(0)}%, demonstrating efficient capital deployment.`);
        } else if (last.totalAssetTO < assetTOBM * 0.8) {
          weaknesses.push(`Asset turnover of ${last.totalAssetTO.toFixed(1)} trails industry benchmark (${assetTOBM.toFixed(1)}), indicating potential for enhanced revenue generation from existing assets.`);
        }
      }
      
      insights.push(`Industry benchmark analysis shows ${strengths.filter(s => s.includes('industry')).length} areas where performance exceeds peer standards.`);
    }
    
    // Add strategic insights based on comprehensive data
    insights.push(`Monitor the trend in Financial Score over time to identify patterns and early warning signs of performance changes.`);
    insights.push(`Focus improvement initiatives on components with the lowest scores for maximum impact on overall financial health.`);
    
    if (growth_6mo < growth_24mo) {
      insights.push(`Recent 6-month growth (${growth_6mo.toFixed(1)}%) is slower than 24-month trend (${growth_24mo.toFixed(1)}%), suggesting momentum is decelerating - consider market expansion strategies.`);
    } else if (growth_6mo > growth_24mo) {
      insights.push(`Recent 6-month growth (${growth_6mo.toFixed(1)}%) exceeds 24-month trend (${growth_24mo.toFixed(1)}%), indicating accelerating momentum - capitalize on this growth trajectory.`);
    }
    
    // Valuation insights
    if (last.totalAssets > 0) {
      const assetMultiple = last.totalAssets > 0 ? ltmRev / last.totalAssets : 0;
      if (assetMultiple > 1.5) {
        insights.push(`Revenue-to-Assets ratio of ${assetMultiple.toFixed(1)}x indicates efficient capital utilization and strong operational leverage.`);
      } else if (assetMultiple < 0.8) {
        insights.push(`Revenue-to-Assets ratio of ${assetMultiple.toFixed(1)}x suggests opportunities to improve asset productivity through operational optimization.`);
      }
    }
    
    // Cash flow insights
    if (monthly.length >= 12) {
      const recentCashFlow = monthly.slice(-12).reduce((sum, m) => sum + (m.revenue - m.expense), 0);
      const cashFlowMargin = recentCashFlow / ltmRev;
      if (cashFlowMargin > 0.15) {
        strengths.push(`Operating cash flow margin of ${(cashFlowMargin * 100).toFixed(1)}% demonstrates strong cash generation capability and financial sustainability.`);
      } else if (cashFlowMargin < 0.05) {
        weaknesses.push(`Operating cash flow margin of ${(cashFlowMargin * 100).toFixed(1)}% indicates tight cash generation - focus on working capital optimization.`);
      }
    }
    
    return { strengths, weaknesses, insights };
  }, [trendData, finalScore, profitabilityScore, assetDevScore, growth_24mo, growth_6mo, expenseAdjustment, revExpSpread, ltmRev, ltmExp, monthly, benchmarks]);

  // Projections
  const projections = useMemo(() => {
    if (monthly.length < 24) return { mostLikely: [], bestCase: [], worstCase: [] };
    
    // Add computed netIncome field to monthly data
    const monthlyWithNetIncome = monthly.map(m => ({
      ...m,
      netIncome: m.revenue - (m.cogsTotal || 0) - m.expense
    }));
    
    // Holt-Winters Triple Exponential Smoothing
    const holtWinters = (data: number[], seasonalPeriod: number = 12, alpha: number = 0.2, beta: number = 0.1, gamma: number = 0.1) => {
      const n = data.length;
      if (n < seasonalPeriod * 2) return null;
      
      // Initialize components
      const level: number[] = [];
      const trend: number[] = [];
      const seasonal: number[] = new Array(n).fill(1);
      
      // Calculate initial seasonal indices (average of first two complete seasons)
      for (let i = 0; i < seasonalPeriod; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i; j < n; j += seasonalPeriod) {
          if (j < seasonalPeriod * 2) {
            sum += data[j];
            count++;
          }
        }
        const avg = sum / count;
        const overallAvg = data.slice(0, seasonalPeriod * 2).reduce((a, b) => a + b, 0) / (seasonalPeriod * 2);
        seasonal[i] = avg / overallAvg;
      }
      
      // Initialize level and trend
      level[0] = data[0] / seasonal[0];
      trend[0] = (data[seasonalPeriod] - data[0]) / seasonalPeriod;
      
      // Apply Holt-Winters equations
      for (let t = 1; t < n; t++) {
        const prevLevel = level[t - 1];
        const prevTrend = trend[t - 1];
        const seasonalIdx = t % seasonalPeriod;
        const prevSeasonal = seasonal[seasonalIdx];
        
        // Update level
        level[t] = alpha * (data[t] / prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
        
        // Update trend
        trend[t] = beta * (level[t] - prevLevel) + (1 - beta) * prevTrend;
        
        // Update seasonal
        seasonal[t] = gamma * (data[t] / level[t]) + (1 - gamma) * prevSeasonal;
      }
      
      return { level: level[n - 1], trend: trend[n - 1], seasonal };
    };
    
    // Apply Holt-Winters to each metric
    const revData = monthlyWithNetIncome.map(m => m.revenue);
    const cogsData = monthlyWithNetIncome.map(m => m.cogsTotal || 0);
    const expData = monthlyWithNetIncome.map(m => m.expense);
    
    const revHW = holtWinters(revData);
    const cogsHW = holtWinters(cogsData);
    const expHW = holtWinters(expData);
    
    // For assets and liabilities, use simple growth
    const last12 = monthlyWithNetIncome.slice(-12);
    const prev12 = monthlyWithNetIncome.slice(-24, -12);
    const avgAssetGrowth = ((last12[last12.length - 1].totalAssets - prev12[prev12.length - 1].totalAssets) / prev12[prev12.length - 1].totalAssets) / 12;
    const avgLiabGrowth = ((last12[last12.length - 1].totalLiab - prev12[prev12.length - 1].totalLiab) / prev12[prev12.length - 1].totalLiab) / 12;
    
    const lastMonth = monthlyWithNetIncome[monthlyWithNetIncome.length - 1];
    const mostLikely: any[] = [];
    const bestCase: any[] = [];
    const worstCase: any[] = [];
    
    // Check if Holt-Winters is available (need 24+ months)
    if (revHW && cogsHW && expHW) {
      const seasonalPeriod = 12;
      const n = monthlyWithNetIncome.length;
      
      for (let i = 1; i <= 12; i++) {
        const monthName = `+${i}mo`;
        const seasonalIdx = (n + i - 1) % seasonalPeriod;
        
        // Most Likely: Standard Holt-Winters forecast
        const mlRev = Math.max(0, (revHW.level + i * revHW.trend) * revHW.seasonal[seasonalIdx]);
        const mlCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend) * cogsHW.seasonal[seasonalIdx]);
        const mlExp = Math.max(0, (expHW.level + i * expHW.trend) * expHW.seasonal[seasonalIdx]);
        const mlAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth, i);
        const mlLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth, i);
        const mlEquity = mlAssets - mlLiab;
        
        mostLikely.push({
          month: monthName,
          revenue: mlRev,
          expense: mlExp,
          netIncome: mlRev - mlCogs - mlExp,
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        // Best Case: Amplify trend by 50%
        const bcRev = Math.max(0, (revHW.level + i * revHW.trend * 1.5) * revHW.seasonal[seasonalIdx]);
        const bcCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend * 0.5) * cogsHW.seasonal[seasonalIdx]); // Lower trend is better
        const bcExp = Math.max(0, (expHW.level + i * expHW.trend * 0.5) * expHW.seasonal[seasonalIdx]); // Lower trend is better
        const bcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 1.2, i);
        const bcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 0.8, i);
        const bcEquity = bcAssets - bcLiab;
        
        bestCase.push({
          month: monthName,
          revenue: bcRev,
          expense: bcExp,
          netIncome: bcRev - bcCogs - bcExp,
          totalAssets: bcAssets,
          totalLiab: bcLiab,
          totalEquity: bcEquity
        });
        
        // Worst Case: Reduce trend by 50%
        const wcRev = Math.max(0, (revHW.level + i * revHW.trend * 0.5) * revHW.seasonal[seasonalIdx]);
        const wcCogs = Math.max(0, (cogsHW.level + i * cogsHW.trend * 1.5) * cogsHW.seasonal[seasonalIdx]); // Higher trend is worse
        const wcExp = Math.max(0, (expHW.level + i * expHW.trend * 1.5) * expHW.seasonal[seasonalIdx]); // Higher trend is worse
        const wcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 0.8, i);
        const wcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 1.2, i);
        const wcEquity = wcAssets - wcLiab;
        
        worstCase.push({
          month: monthName,
          revenue: wcRev,
          expense: wcExp,
          netIncome: wcRev - wcCogs - wcExp,
          totalAssets: wcAssets,
          totalLiab: wcLiab,
          totalEquity: wcEquity
        });
      }
    } else {
      // Fallback to simple projection if not enough data
      const avgRevGrowth = monthlyWithNetIncome.length >= 2 
        ? (lastMonth.revenue - monthlyWithNetIncome[0].revenue) / monthlyWithNetIncome[0].revenue / monthlyWithNetIncome.length
        : 0;
      const avgCogsGrowth = monthlyWithNetIncome.length >= 2 
        ? ((lastMonth.cogsTotal || 0) - (monthlyWithNetIncome[0].cogsTotal || 0)) / (monthlyWithNetIncome[0].cogsTotal || 1) / monthlyWithNetIncome.length
        : 0;
      const avgExpGrowth = monthlyWithNetIncome.length >= 2 
        ? (lastMonth.expense - monthlyWithNetIncome[0].expense) / monthlyWithNetIncome[0].expense / monthlyWithNetIncome.length
        : 0;
      
      for (let i = 1; i <= 12; i++) {
        const monthName = `+${i}mo`;
        
        const mlRev = lastMonth.revenue * Math.pow(1 + avgRevGrowth, i);
        const mlCogs = (lastMonth.cogsTotal || 0) * Math.pow(1 + avgCogsGrowth, i);
        const mlExp = lastMonth.expense * Math.pow(1 + avgExpGrowth, i);
        const mlAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth, i);
        const mlLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth, i);
        const mlEquity = mlAssets - mlLiab;
        
        mostLikely.push({
          month: monthName,
          revenue: mlRev,
          expense: mlExp,
          netIncome: mlRev - mlCogs - mlExp,
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        bestCase.push({
          month: monthName,
          revenue: mlRev * 1.1,
          expense: mlExp * 0.9,
          netIncome: (mlRev * 1.1) - (mlCogs * 0.9) - (mlExp * 0.9),
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
        
        worstCase.push({
          month: monthName,
          revenue: mlRev * 0.9,
          expense: mlExp * 1.1,
          netIncome: (mlRev * 0.9) - (mlCogs * 1.1) - (mlExp * 1.1),
          totalAssets: mlAssets,
          totalLiab: mlLiab,
          totalEquity: mlEquity
        });
      }
    }
    
    return { mostLikely, bestCase, worstCase, monthlyWithNetIncome };
  }, [monthly]);

  const renderColumnSelector = (label: string, mappingKey: keyof Mappings) => renderColumnSelectorUtil(label, mappingKey, mapping, setMapping, columns);

  const saveProjectionDefaults = () => saveProjectionDefaultsUtil(
    bestCaseRevMultiplier,
    bestCaseExpMultiplier,
    worstCaseRevMultiplier,
    worstCaseExpMultiplier,
    setDefaultBestCaseRevMult,
    setDefaultBestCaseExpMult,
    setDefaultWorstCaseRevMult,
    setDefaultWorstCaseExpMult,
    setShowDefaultSettings
  );

  // Main Logged-In View with Header
  const company = getCurrentCompany();
  const companyName = company ? company.name : '';
  const selectedAccountingSystem = company?.accountingSystem || '';
  const selectedAccountingSystemLabel = (() => {
    switch (selectedAccountingSystem) {
      case 'ACUMATICA':
        return 'Acumatica';
      case 'CERTINIA':
        return 'Certinia';
      case 'CSV_FILE':
        return 'CSV file';
      case 'DYNAMICS':
        return 'Dynamics';
      case 'EPICOR':
        return 'Epicor';
      case 'FUSION_CLOUD':
        return 'Fusion Cloud';
      case 'IFS':
        return 'IFS';
      case 'INFOR_M3':
        return 'Infor M3';
      case 'NETSUITE':
        return 'NetSuite';
      case 'QAD':
        return 'QAD';
      case 'QUICKBOOKS':
        return 'QuickBooks Online';
      case 'QUICKBOOKS_DESKTOP':
        return 'QuickBooks Desktop';
      case 'SAGE':
        return 'Sage';
      case 'SAGE_INTACCT':
        return 'Sage Intacct';
      case 'XERO':
        return 'Xero';
      default:
        return selectedAccountingSystem ? selectedAccountingSystem : 'Not set';
    }
  })();

  // Custom Print Package Handler
  const handleGeneratePrintPackage = () => {
    // Check if any items are selected
    const hasSelection = Object.values(printPackageSelections).some(val => val);
    if (!hasSelection) {
      alert('Please select at least one report to include in the print package.');
      return;
    }

    // Build array of print instructions
    const printQueue: any[] = [];
    
    if (printPackageSelections.mda) {
      printQueue.push({ view: 'mda', title: 'MD&A (Management Discussion & Analysis)', orientation: printPackageOrientations.mda });
    }
    if (printPackageSelections.priorityRatios) {
      printQueue.push({ view: 'kpis', tab: 'priority-ratios', title: 'Priority Ratios', orientation: printPackageOrientations.priorityRatios });
    }
    if (printPackageSelections.workingCapital) {
      printQueue.push({ view: 'working-capital', title: 'Working Capital', orientation: printPackageOrientations.workingCapital });
    }
    if (printPackageSelections.dashboard) {
      printQueue.push({ view: 'dashboard', title: 'Dashboard', orientation: printPackageOrientations.dashboard });
    }
    if (printPackageSelections.cashFlow4Quarters) {
      printQueue.push({ view: 'cash-flow', display: 'quarterly', title: 'Cash Flow - Last 4 Quarters', orientation: printPackageOrientations.cashFlow4Quarters });
    }
    if (printPackageSelections.cashFlow3Years) {
      printQueue.push({ view: 'cash-flow', display: 'annual', title: 'Cash Flow - Last 3 Years', orientation: printPackageOrientations.cashFlow3Years });
    }
    if (printPackageSelections.incomeStatement12MonthsQuarterly) {
      printQueue.push({ 
        view: 'financial-statements', 
        type: 'income-statement', 
        display: 'quarterly',
        title: 'Income Statement - Last 12 Months (Quarterly)',
        orientation: printPackageOrientations.incomeStatement12MonthsQuarterly
      });
    }
    if (printPackageSelections.incomeStatement3YearsAnnual) {
      printQueue.push({ 
        view: 'financial-statements', 
        type: 'income-statement', 
        display: 'annual',
        title: 'Income Statement - Last 3 Years (Annual)',
        orientation: printPackageOrientations.incomeStatement3YearsAnnual
      });
    }
    if (printPackageSelections.balanceSheet12MonthsQuarterly) {
      printQueue.push({ 
        view: 'financial-statements', 
        type: 'balance-sheet', 
        display: 'quarterly',
        title: 'Balance Sheet - Last 12 Months (Quarterly)',
        orientation: printPackageOrientations.balanceSheet12MonthsQuarterly
      });
    }
    if (printPackageSelections.balanceSheet3YearsAnnual) {
      printQueue.push({ 
        view: 'financial-statements', 
        type: 'balance-sheet', 
        display: 'annual',
        title: 'Balance Sheet - Last 3 Years (Annual)',
        orientation: printPackageOrientations.balanceSheet3YearsAnnual
      });
    }
    if (printPackageSelections.profile) {
      printQueue.push({ view: 'profile', title: 'Company Profile', orientation: printPackageOrientations.profile });
    }
    if (printPackageSelections.opsDashboard) {
      printQueue.push({ view: 'operations', opsTab: 'dashboard', title: 'Operations - Ops Dashboard', orientation: printPackageOrientations.opsDashboard });
    }
    if (printPackageSelections.opsCashForecast) {
      printQueue.push({ view: 'operations', opsTab: 'forecast', title: 'Operations - Cash Forecast', orientation: printPackageOrientations.opsCashForecast });
    }
    if (printPackageSelections.opsCashBasisIncomeStatementForecast) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'cash-basis',
        opsForecastSubTab: 'income-statement-forecast',
        title: 'Operations - Cash Basis - Income Statement Forecast',
        orientation: printPackageOrientations.opsCashBasisIncomeStatementForecast
      });
    }
    if (printPackageSelections.opsCashBasisCashForecast) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'cash-basis',
        opsForecastSubTab: 'cash-forecast',
        title: 'Operations - Cash Basis - Cash Forecast',
        orientation: printPackageOrientations.opsCashBasisCashForecast
      });
    }
    if (printPackageSelections.opsCashBasisGraphs) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'cash-basis',
        opsForecastSubTab: 'graphs',
        title: 'Operations - Cash Basis - Graphs',
        orientation: printPackageOrientations.opsCashBasisGraphs
      });
    }
    if (printPackageSelections.opsAccrualIncomeStatementForecast) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'accrual-basis',
        opsForecastSubTab: 'income-statement-forecast',
        title: 'Operations - Accrual Basis - Income Statement Forecast',
        orientation: printPackageOrientations.opsAccrualIncomeStatementForecast
      });
    }
    if (printPackageSelections.opsAccrualCashForecast) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'accrual-basis',
        opsForecastSubTab: 'cash-forecast',
        title: 'Operations - Accrual Basis - Cash Forecast',
        orientation: printPackageOrientations.opsAccrualCashForecast
      });
    }
    if (printPackageSelections.opsAccrualGraphs) {
      printQueue.push({
        view: 'operations',
        opsTab: 'forecast',
        opsForecastBasisTab: 'accrual-basis',
        opsForecastSubTab: 'graphs',
        title: 'Operations - Accrual Basis - Graphs',
        orientation: printPackageOrientations.opsAccrualGraphs
      });
    }
    if (printPackageSelections.opsCustomers) {
      printQueue.push({ view: 'operations', opsTab: 'customers', title: 'Operations - Customers', orientation: printPackageOrientations.opsCustomers });
    }
    if (printPackageSelections.opsARAging) {
      printQueue.push({ view: 'operations', opsTab: 'ar', title: 'Operations - AR Aging', orientation: printPackageOrientations.opsARAging });
    }
    if (printPackageSelections.opsAPAging) {
      printQueue.push({ view: 'operations', opsTab: 'ap', title: 'Operations - AP Aging', orientation: printPackageOrientations.opsAPAging });
    }
    if (printPackageSelections.opsProducts) {
      printQueue.push({ view: 'operations', opsTab: 'products', title: 'Operations - Products', orientation: printPackageOrientations.opsProducts });
    }
    if (printPackageSelections.opsInventory) {
      printQueue.push({ view: 'operations', opsTab: 'inventory', title: 'Operations - Inventory', orientation: printPackageOrientations.opsInventory });
    }
    if (printPackageSelections.opsDailyFinancials) {
      printQueue.push({ view: 'operations', opsTab: 'daily_financials', title: 'Operations - Daily Financials', orientation: printPackageOrientations.opsDailyFinancials });
    }

    if (printQueue.length === 0) {
      alert('Please select at least one report to print.');
      return;
    }

    // Show confirmation
    const reportNames = printQueue.map(p => p.title).join('\n• ');
    if (!confirm(`You are about to print the following reports in sequence:\n\n• ${reportNames}\n\nThis will open ${printQueue.length} print dialog(s). Continue?`)) {
      return;
    }

    setIsPrintingPackage(true);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const waitForPrintReady = async (report: any) => {
      const baseDelayMs =
        report.view === 'dashboard' ? 1500 : report.view === 'operations' ? 1800 : 1000;
      await sleep(baseDelayMs);

      // Forecast pages can still be loading after initial render; wait until loading text clears.
      const isOpsForecast = report.view === 'operations' && report.opsTab === 'forecast';
      if (!isOpsForecast) return;

      const maxWaitMs = 15000;
      const pollMs = 250;
      const startedAt = Date.now();
      while (Date.now() - startedAt < maxWaitMs) {
        const root = document.querySelector('.app-shell-main') || document.body;
        const text = (root.textContent || '').toLowerCase();
        const hasLoadingText =
          text.includes('loading...') ||
          text.includes('loading…') ||
          text.includes('beginning cash (last imported)\nloading');

        if (!hasLoadingText) return;
        await sleep(pollMs);
      }
    };

    // Print each report in sequence with a delay/readiness check
    let currentIndex = 0;
    const printNext = async () => {
      if (currentIndex >= printQueue.length) {
        setIsPrintingPackage(false);
        setOperationsPrintConfig(null);
        alert('All reports have been sent to print!');
        return;
      }

      const report = printQueue[currentIndex];
      setPrintOrientation(report.orientation || 'portrait');
      
      // Set the appropriate view and parameters
      if (report.view === 'financial-statements') {
        setOperationsPrintConfig(null);
        setStatementType(report.type as any);
        setStatementDisplay(report.display as any);
        setCurrentView('financial-statements');
      } else if (report.view === 'operations') {
        setOperationsPrintConfig({
          tab: report.opsTab as string,
          forecastBasisTab: report.opsForecastBasisTab as 'cash-basis' | 'accrual-basis' | undefined,
          forecastSubTab: report.opsForecastSubTab as 'income-statement-forecast' | 'cash-forecast' | 'graphs' | undefined
        });
        setCurrentView('operations');
      } else if (report.view === 'cash-flow') {
        setOperationsPrintConfig(null);
        setCashFlowDisplay(report.display as any);
        setCurrentView('cash-flow');
      } else if (report.view === 'kpis' && report.tab) {
        setOperationsPrintConfig(null);
        setKpiDashboardTab(report.tab as any);
        setCurrentView('kpis');
      } else {
        setOperationsPrintConfig(null);
        setCurrentView(report.view as any);
      }

      await waitForPrintReady(report);
      window.print();
      currentIndex++;
      // Give the browser time to close print dialog before next report
      setTimeout(() => { void printNext(); }, 1200);
    };

    void printNext();
  };

  if (!isLoggedIn) {
    return (
      <>
        <LoginView
          loginEmail={loginEmail}
          setLoginEmail={setLoginEmail}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          loginName={loginName}
          setLoginName={setLoginName}
          loginPhone={loginPhone}
          setLoginPhone={setLoginPhone}
          loginCompanyName={loginCompanyName}
          setLoginCompanyName={setLoginCompanyName}
          loginCompanyAddress1={loginCompanyAddress1}
          setLoginCompanyAddress1={setLoginCompanyAddress1}
          loginCompanyAddress2={loginCompanyAddress2}
          setLoginCompanyAddress2={setLoginCompanyAddress2}
          loginCompanyCity={loginCompanyCity}
          setLoginCompanyCity={setLoginCompanyCity}
          loginCompanyState={loginCompanyState}
          setLoginCompanyState={setLoginCompanyState}
          loginCompanyZip={loginCompanyZip}
          setLoginCompanyZip={setLoginCompanyZip}
          loginCompanyWebsite={loginCompanyWebsite}
          setLoginCompanyWebsite={setLoginCompanyWebsite}
          isRegistering={isRegistering}
          setIsRegistering={setIsRegistering}
          loginError={loginError}
          setLoginError={setLoginError}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          showForgotPassword={showForgotPassword}
          setShowForgotPassword={setShowForgotPassword}
          resetEmail={resetEmail}
          setResetEmail={setResetEmail}
          resetSuccess={resetSuccess}
          setResetSuccess={setResetSuccess}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          handleLogin={handleLogin}
          handleRegisterConsultant={handleRegisterConsultant}
        />
        
        {/* MFA Enrollment Modal */}
        {showMFAEnrollment && (
          <MFAEnrollmentModal
            userId={mfaUserId}
            userEmail={mfaUserEmail}
            onComplete={handleMFAEnrollmentComplete}
            trustDurationDays={trustDurationDays || undefined}
          />
        )}
        
        {/* MFA Verification Modal */}
        {showMFAVerification && (
          <MFAVerificationModal
            userId={mfaUserId}
            userEmail={mfaUserEmail}
            onSuccess={handleMFAVerificationComplete}
            onCancel={handleMFACancel}
            trustDurationDays={trustDurationDays || undefined}
          />
        )}
      </>
    );
  }

  return (
    <div className="app-shell" style={{ height: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Toaster />
      <InactivityLogout 
        isLoggedIn={isLoggedIn}
        userEmail={currentUser?.email}
        onLogout={handleLogout}
      />
      <style>{`
        @media print {
          @page {
            size: ${isPrintingPackage ? printOrientation : 'auto'};
          }

          html,
          body,
          .app-shell {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .app-shell .app-global-header,
          .app-shell .app-left-sidebar,
          .app-shell header,
          .app-shell aside,
          .app-shell footer,
          .app-shell [role="navigation"] {
            display: none !important;
          }

          .app-shell-content {
            margin-top: 0 !important;
            height: auto !important;
            display: block !important;
            overflow: visible !important;
          }

          .app-shell-main {
            padding-top: 0 !important;
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
          }
        }
      `}</style>
      <div className="app-global-header">
        <Header
          currentUser={currentUser}
          companyName={companyName || (currentUser?.userType === 'company' ? (Array.isArray(companies) && companies.find(c => c.id === currentUser?.companyId)?.name) || '' : '')}
          currentView={currentView}
          setCurrentView={setCurrentView as any}
          handleLogout={handleLogout}
          handleNavigation={handleNavigation}
        />
      </div>

      {/* Main Content Area with Sidebar */}
      <div className="app-shell-content" style={{ display: 'flex', overflow: 'hidden', marginTop: '70px', height: 'calc(100vh - 70px)' }}>
        {/* Left Navigation Sidebar - Not for Site Admin */}
        {currentUser?.role !== 'siteadmin' && !(currentUser?.userType === 'assessment') && (
        <aside className="app-left-sidebar" style={{ 
          width: '280px', 
          background: 'white', 
          borderRight: '2px solid #e2e8f0', 
          padding: '32px 0 24px 0',
          overflowY: 'auto',
          flexShrink: 0,
          boxShadow: '2px 0 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '24px' }}>
            {currentUser?.userType !== 'assessment' && null}

            <div style={{ marginBottom: '6px' }}>
              <h3
                onClick={() => handleNavigation('ai-analysis')}
                style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: currentView === 'ai-analysis' ? '#1F70C1' : '#1e293b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '1px 24px',
                  margin: '0 0 8px 0',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1F70C1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = currentView === 'ai-analysis' ? '#1F70C1' : '#1e293b';
                }}
              >
                {currentView === 'ai-analysis' && '› '}ASK CORELYTICS
              </h3>
            </div>

            {/* Analysis Section */}
            <div style={{ marginBottom: '16px' }}>
              <h3
                onClick={() => handleNavigation('pa-overview')}
                style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: currentView.startsWith('pa-') ? '#1F70C1' : '#1e293b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '1px 24px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1F70C1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = currentView.startsWith('pa-') ? '#1F70C1' : '#1e293b';
                }}
              >
                {currentView === 'pa-overview' && '› '}Expert Analysis
              </h3>
              {(!isCompanyUser || isCompanyAdmin || (allowedSectionsForCompanyUser || []).includes('performance-analytics')) && (
                <>
                  <div style={{ paddingLeft: '28px' }}>
                    {[
                      { id: 'pa-critical-issues', label: 'Critical Issues' },
                      { id: 'pa-focus-board', label: 'Major Trends' },
                      { id: 'pa-trend-explorer', label: 'Trend Explorer' },
                      { id: 'pa-anomaly-inbox', label: 'Anomaly Inbox' },
                      { id: 'pa-opportunity-workspace', label: 'Actions/Monitor' }
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNavigation(item.id)}
                        style={{
                          fontSize: '16px',
                          color: currentView === item.id ? '#1F70C1' : '#475569',
                          padding: '6px 12px',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          marginBottom: '4px',
                          background: currentView === item.id ? '#e0f2fe' : 'transparent',
                          fontWeight: currentView === item.id ? '600' : '400',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (currentView !== item.id) {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.color = '#1F70C1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentView !== item.id) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#475569';
                          }
                        }}
                      >
                        {currentView === item.id && '› '}{item.label}
                      </div>
                    ))}
                  </div>
                  <h3
                    onClick={() => handleNavigation('mda')}
                    style={{
                      fontSize: '16px',
                      fontWeight: '700',
                      color: currentView === 'mda' ? '#1F70C1' : '#1e293b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      padding: '1px 24px',
                      margin: '6px 0 8px 0',
                      cursor: 'pointer',
                      transition: 'color 0.2s',
                      whiteSpace: 'normal',
                      lineHeight: '1.25'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#1F70C1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = currentView === 'mda' ? '#1F70C1' : '#1e293b';
                    }}
                  >
                    {currentView === 'mda' && '› '}MANAGEMENT DISCUSSION AND ANALYSIS
                  </h3>
                </>
              )}
            </div>

            {/* Financial Score Section - removed from sidebar; functionality commented out below */}

            {/* Team Assessment - moved to Support page; link there goes to /?view=ma-welcome */}

            {/* Company Dashboard Section - For Business Users (Company Users) */}
            {currentUser?.role === 'user' && currentUser?.userType === 'company' && (!allowedSectionsForCompanyUser || allowedSectionsForCompanyUser.includes('company-dashboard')) && (
              <div style={{ marginBottom: '12px' }}>
                <h3 
                  onClick={() => {
                    if (selectedCompanyId) {
                      handleNavigation('dashboard');
                    } else {
                      setCurrentView('admin');
                      setAdminDashboardTab('company-management');
                    }
                  }}
                  style={{ 
                    fontSize: '14px', 
                    fontWeight: '700', 
                    color: (currentView === 'dashboard' || currentView === 'admin') ? '#1F70C1' : '#1e293b',
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    padding: '8px 24px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    borderLeft: (currentView === 'dashboard' || currentView === 'admin') ? '4px solid #1F70C1' : '4px solid transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1F70C1';
                    e.currentTarget.title = 'Company Dashboard';
                  }}
                  onMouseLeave={(e) => e.currentTarget.style.color = (currentView === 'dashboard' || currentView === 'admin') ? '#1F70C1' : '#1e293b'}
                >
                  Company Dashboard
                </h3>
              </div>
            )}

            {/* Bottom section: Print Packages + User/Consultant - grouped at bottom of sidebar */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Print Packages Section - For Consultants and Company Users only */}
              {(currentUser?.role === 'consultant' || (currentUser?.role === 'user' && currentUser?.userType === 'company')) && (
                <div style={{ marginBottom: '1px' }}>
                  <h3 
                    onClick={() => setCurrentView('custom-print')}
                    style={{ 
                      fontSize: '14px', 
                      fontWeight: '700', 
                      color: currentView === 'custom-print' ? '#1F70C1' : '#1e293b',
                      textTransform: 'uppercase', 
                      letterSpacing: '0.5px',
                      padding: '1px 24px',
                      marginBottom: '1px',
                      cursor: 'pointer',
                      transition: 'color 0.2s',
                      borderLeft: currentView === 'custom-print' ? '4px solid #1F70C1' : '4px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#1F70C1';
                      e.currentTarget.title = 'Print Packages';
                    }}
                    onMouseLeave={(e) => e.currentTarget.style.color = currentView === 'custom-print' ? '#1F70C1' : '#1e293b'}
                  >
                    Print Packages
                  </h3>
                </div>
              )}

              {/* User/Consultant Name Display - Now acts as dashboard link */}
              <div 
                onClick={() => {
                  if (currentUser?.role === 'consultant') {
                    setCurrentView('consultant-dashboard');
                  } else if (currentUser?.userType === 'company') {
                    setCurrentView('admin');
                  }
                }}
                style={{ 
                  paddingTop: '16px', 
                  paddingBottom: '8px', 
                  borderTop: '1px solid #e2e8f0', 
                  paddingLeft: '24px', 
                  paddingRight: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderRadius: '6px',
                  marginLeft: '0',
                  marginRight: '0',
                  marginBottom: '0'
                }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f0f9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', paddingLeft: '24px' }}>
                {currentUser?.role === 'consultant' ? 'Consultant' : 'User'}
              </div>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                color: (currentView === 'admin' || currentView === 'consultant-dashboard') ? '#1F70C1' : '#1e293b',
                paddingLeft: '24px',
                transition: 'color 0.2s'
              }}>
                {currentUser?.consultantCompanyName || currentUser?.name || currentUser?.email}
              </div>
            </div>
            </div>

            {/* Support Section */}
            <div style={{ marginTop: '0', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <a
                href="/support"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1F70C1',
                  textDecoration: 'none',
                  padding: '12px 24px',
                  transition: 'all 0.2s',
                  borderRadius: '6px',
                  margin: '0 12px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e0f2fe';
                  e.currentTarget.style.color = '#1F70C1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#1F70C1';
                }}
              >
                📞 SUPPORT
              </a>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#1e293b',
                  padding: '8px 24px 0 24px',
                  margin: '0 12px'
                }}
              >
                Powered by Corelytics
              </div>
            </div>
          </nav>
        </aside>
        )}

        {/* Assessment User Sidebar - Only Team Assessment */}
        {currentUser?.userType === 'assessment' && (
        <aside className="app-left-sidebar" style={{ 
          width: '280px', 
          background: 'white', 
          borderRight: '2px solid #e2e8f0', 
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '0 24px', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Navigation</h2>
            <p style={{ fontSize: '12px', color: '#64748b' }}>Team Assessment</p>
          </div>
          
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '24px' }}>
            {/* Team Assessment Section */}
            <div style={{ marginBottom: '1px' }}>
              <h3 
                onClick={() => setIsManagementAssessmentExpanded(!isManagementAssessmentExpanded)}
                style={{ 
                  fontSize: '14px', 
                  fontWeight: '700', 
                  color: '#1e293b',
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  padding: '1px 24px',
                  marginBottom: '1px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1F70C1';
                  e.currentTarget.title = 'Opens Digital Presence Analysis in new tab';
                }}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1e293b'}
              >
                <span>Team Assessment</span>
                <span style={{ fontSize: '12px', color: '#1F70C1' }}>{isManagementAssessmentExpanded ? '-' : '+'}</span>
              </h3>
              {isManagementAssessmentExpanded && (
                <div style={{ paddingLeft: '28px' }}>
                  <div
                    onClick={() => handleViewChange('ma-welcome')}
                    style={{
                      fontSize: '14px',
                      color: currentView === 'ma-welcome' ? '#1F70C1' : '#475569',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      background: currentView === 'ma-welcome' ? '#e0f2fe' : 'transparent',
                      fontWeight: currentView === 'ma-welcome' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== 'ma-welcome') {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#1F70C1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== 'ma-welcome') {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    Welcome
                  </div>
                  <div
                    onClick={() => handleViewChange('ma-questionnaire')}
                    style={{
                      fontSize: '14px',
                      color: currentView === 'ma-questionnaire' ? '#1F70C1' : '#475569',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      background: currentView === 'ma-questionnaire' ? '#e0f2fe' : 'transparent',
                      fontWeight: currentView === 'ma-questionnaire' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== 'ma-questionnaire') {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#1F70C1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== 'ma-questionnaire') {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    Questionnaire
                  </div>
                  <div
                    onClick={() => handleViewChange('ma-your-results')}
                    style={{
                      fontSize: '14px',
                      color: currentView === 'ma-your-results' ? '#1F70C1' : '#475569',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      background: currentView === 'ma-your-results' ? '#e0f2fe' : 'transparent',
                      fontWeight: currentView === 'ma-your-results' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== 'ma-your-results') {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#1F70C1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== 'ma-your-results') {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    Results
                  </div>
                </div>
              )}
            </div>

            {/* Support Section */}
            <div style={{ marginTop: '0', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <a
                href="/support"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1F70C1',
                  textDecoration: 'none',
                  padding: '12px 24px',
                  transition: 'all 0.2s',
                  borderRadius: '6px',
                  margin: '0 12px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e0f2fe';
                  e.currentTarget.style.color = '#1F70C1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#1F70C1';
                }}
              >
                📞 SUPPORT
              </a>
            </div>
          </nav>
        </aside>
        )}

        {/* Main Content Area */}
        <main className="app-shell-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '8px' }}>
          {/* Restrict access for assessment users - only show Team Assessment views */}
          {(!(currentUser?.userType === 'assessment') || currentView === 'ma-questionnaire' || currentView === 'ma-your-results' || currentView === 'ma-scores-summary' || currentView === 'ma-charts' || currentView === 'ma-scoring-guide') && (
          <>
          {/* Site Administration */}
          {currentView === 'siteadmin' && currentUser?.role === 'siteadmin' && (
            <SiteAdminDashboard
              siteAdminTab={siteAdminTab}
              setSiteAdminTab={setSiteAdminTab}
              consultants={consultants}
              companies={companies}
              siteAdmins={siteAdmins}
              isLoading={isLoading}
              expandedBusinessIds={expandedBusinessIds}
              setExpandedBusinessIds={setExpandedBusinessIds}
              editingPricing={editingPricing}
              setEditingPricing={setEditingPricing}
              defaultBusinessMonthlyPrice={defaultBusinessMonthlyPrice}
              setDefaultBusinessMonthlyPrice={setDefaultBusinessMonthlyPrice}
              defaultBusinessQuarterlyPrice={defaultBusinessQuarterlyPrice}
              setDefaultBusinessQuarterlyPrice={setDefaultBusinessQuarterlyPrice}
              defaultBusinessAnnualPrice={defaultBusinessAnnualPrice}
              setDefaultBusinessAnnualPrice={setDefaultBusinessAnnualPrice}
              defaultBusinessSetupFee={defaultBusinessSetupFee}
              setDefaultBusinessSetupFee={setDefaultBusinessSetupFee}
              defaultConsultantMonthlyPrice={defaultConsultantMonthlyPrice}
              setDefaultConsultantMonthlyPrice={setDefaultConsultantMonthlyPrice}
              defaultConsultantQuarterlyPrice={defaultConsultantQuarterlyPrice}
              setDefaultConsultantQuarterlyPrice={setDefaultConsultantQuarterlyPrice}
              defaultConsultantAnnualPrice={defaultConsultantAnnualPrice}
              setDefaultConsultantAnnualPrice={setDefaultConsultantAnnualPrice}
              defaultConsultantSetupFee={defaultConsultantSetupFee}
              setDefaultConsultantSetupFee={setDefaultConsultantSetupFee}
              updateCompanyPricing={updateCompanyPricing}
              affiliates={affiliates}
              setAffiliates={setAffiliates}
              showAddAffiliateForm={showAddAffiliateForm}
              setShowAddAffiliateForm={setShowAddAffiliateForm}
              editingAffiliate={editingAffiliate}
              setEditingAffiliate={setEditingAffiliate}
              expandedAffiliateId={expandedAffiliateId}
              setExpandedAffiliateId={setExpandedAffiliateId}
              newAffiliateCode={newAffiliateCode}
              setNewAffiliateCode={setNewAffiliateCode}
              editingAffiliateCode={editingAffiliateCode}
              setEditingAffiliateCode={setEditingAffiliateCode}
              editingConsultantInfo={editingConsultantInfo}
              setEditingConsultantInfo={setEditingConsultantInfo}
              users={users}
              getCompanyUsers={getCompanyUsers}
              selectedConsultantId={selectedConsultantId}
              setSelectedConsultantId={setSelectedConsultantId}
              expandedCompanyIds={expandedCompanyIds}
              setExpandedCompanyIds={setExpandedCompanyIds}
              showAddConsultantForm={showAddConsultantForm}
              setShowAddConsultantForm={setShowAddConsultantForm}
              newConsultantType={newConsultantType}
              setNewConsultantType={setNewConsultantType}
              newConsultantFullName={newConsultantFullName}
              setNewConsultantFullName={setNewConsultantFullName}
              newConsultantEmail={newConsultantEmail}
              setNewConsultantEmail={setNewConsultantEmail}
              newConsultantPhone={newConsultantPhone}
              setNewConsultantPhone={setNewConsultantPhone}
              newConsultantPassword={newConsultantPassword}
              setNewConsultantPassword={setNewConsultantPassword}
              newConsultantAddress={newConsultantAddress}
              setNewConsultantAddress={setNewConsultantAddress}
              newConsultantCompanyName={newConsultantCompanyName}
              setNewConsultantCompanyName={setNewConsultantCompanyName}
              newConsultantCompanyAddress1={newConsultantCompanyAddress1}
              setNewConsultantCompanyAddress1={setNewConsultantCompanyAddress1}
              newConsultantCompanyAddress2={newConsultantCompanyAddress2}
              setNewConsultantCompanyAddress2={setNewConsultantCompanyAddress2}
              newConsultantCompanyCity={newConsultantCompanyCity}
              setNewConsultantCompanyCity={setNewConsultantCompanyCity}
              newConsultantCompanyState={newConsultantCompanyState}
              setNewConsultantCompanyState={setNewConsultantCompanyState}
              newConsultantCompanyZip={newConsultantCompanyZip}
              setNewConsultantCompanyZip={setNewConsultantCompanyZip}
              newConsultantCompanyWebsite={newConsultantCompanyWebsite}
              setNewConsultantCompanyWebsite={setNewConsultantCompanyWebsite}
              addConsultant={addConsultant}
              deleteConsultant={deleteConsultant}
              updateConsultantInfo={updateConsultantInfo}
              getConsultantCompanies={getConsultantCompanies}
              setCurrentUser={setCurrentUser}
              setSiteAdminViewingAs={setSiteAdminViewingAs}
              setCurrentView={setCurrentView}
              setLoadedConsultantId={setLoadedConsultantId}
              setCompanies={setCompanies}
              currentUser={currentUser}
              setSelectedCompanyId={setSelectedCompanyId}
              setCompanyToDelete={setCompanyToDelete}
              setShowDeleteConfirmation={setShowDeleteConfirmation}
              inforConnected={inforConnected}
              inforStatus={inforStatus}
              inforLastSync={inforLastSync}
              inforError={inforError}
              inforBusy={inforBusy}
              inforCredentials={inforCredentials}
              setInforCredentials={setInforCredentials}
              inforProbePath={inforProbePath}
              setInforProbePath={setInforProbePath}
              inforProbeSummary={inforProbeSummary}
              checkInforM3Status={checkInforM3Status}
              loadInforM3Credentials={loadInforM3Credentials}
              saveInforM3Credentials={saveInforM3Credentials}
              connectInforM3={connectInforM3}
              testInforM3Token={testInforM3Token}
              probeInforM3={probeInforM3}
              disconnectInforM3={disconnectInforM3}
              runInforM3OperationalSync={runInforM3OperationalSync}
              runPlatformOperationalSync={runPlatformOperationalSync}
              newSiteAdminFirstName={newSiteAdminFirstName}
              setNewSiteAdminFirstName={setNewSiteAdminFirstName}
              newSiteAdminLastName={newSiteAdminLastName}
              setNewSiteAdminLastName={setNewSiteAdminLastName}
              newSiteAdminEmail={newSiteAdminEmail}
              setNewSiteAdminEmail={setNewSiteAdminEmail}
              newSiteAdminPassword={newSiteAdminPassword}
              setNewSiteAdminPassword={setNewSiteAdminPassword}
              showAddSiteAdminForm={showAddSiteAdminForm}
              setShowAddSiteAdminForm={setShowAddSiteAdminForm}
              businessesLoading={siteAdminBusinessesLoading}
            />
          )}

          {/* Consultant Dashboard */}
          {currentView === 'consultant-dashboard' && currentUser?.role === 'consultant' && (
            <div>
              {/* Exit Preview Mode button (only when site admin is previewing) */}
              {siteAdminViewingAs && (
                <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 32px 0 32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0' }}>
                    <button
                      onClick={() => {
                        setCurrentUser(siteAdminViewingAs);
                        setSiteAdminViewingAs(null);
                        setCurrentView('siteadmin');
                        setLoadedConsultantId(null);
                        safeSetCompanies([]); // Clear companies to prevent data leakage
                      }}
                      style={{ 
                        padding: '10px 20px', 
                        background: '#f59e0b', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '8px', 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      <span>Return to Site Admin</span>
                    </button>
                  </div>
                </div>
              )}
              <ConsultantDashboard
                currentUser={currentUser}
                consultantDashboardTab={consultantDashboardTab}
                setConsultantDashboardTab={setConsultantDashboardTab}
                consultantTeamMembers={consultantTeamMembers}
                showAddTeamMemberForm={showAddTeamMemberForm}
                setShowAddTeamMemberForm={setShowAddTeamMemberForm}
                newTeamMember={newTeamMember}
                setNewTeamMember={setNewTeamMember}
                addTeamMember={addTeamMember}
                removeTeamMember={removeTeamMember}
                companies={companies}
                setCurrentView={setCurrentView}
                setSelectedCompanyId={setSelectedCompanyId}
                setAdminDashboardTab={setAdminDashboardTab}
                setCompanyManagementSubTab={setCompanyManagementSubTab}
                setCompanyToDelete={setCompanyToDelete}
                setShowDeleteConfirmation={setShowDeleteConfirmation}
                isLoading={isLoading}
                selectedCompanyId={selectedCompanyId}
                monthly={monthly}
                companyName={companyName}
                onAddCompany={openAddCompanyModal}
              />
            </div>
          )}

          {/* Admin Dashboard */}
          {currentView === 'admin' && (currentUser?.role === 'siteadmin' || currentUser?.role === 'consultant' || (currentUser?.role === 'user' && currentUser?.userType === 'company')) && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          {/* Exit Preview Mode button (only when site admin is previewing) */}
          {siteAdminViewingAs && (
            <div className="dashboard-header-print-hide" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px' }}>
              <button
                onClick={() => {
                  // Restore admin user
                  setCurrentUser(siteAdminViewingAs);
                  setSiteAdminViewingAs(null);
                  setCurrentView('siteadmin');
                  setLoadedConsultantId(null); // Reset so companies reload for next consultant view
                  safeSetCompanies([]); // Clear companies to prevent data leakage
                }}
                style={{ 
                  padding: '10px 20px', 
                  background: '#f59e0b', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back to Site Admin</span>
              </button>
            </div>
          )}
          
          {/* Tab Navigation */}
          <div
            className="dashboard-tabs-print-hide"
            style={{
              display: 'flex',
              gap: '8px',
              // Data Mapping needs to sit tight to the content below.
              marginBottom: (adminDashboardTab === 'data-mapping' || adminDashboardTab === 'data-review') ? '2px' : '12px',
              borderBottom: '2px solid #e2e8f0'
            }}
          >
            <button
              onClick={() => handleAdminTabNavigation('company-management')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'company-management' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'company-management' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'company-management' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Company Management
            </button>
            <button
              onClick={() => handleAdminTabNavigation('api-connections')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'api-connections' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'api-connections' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'api-connections' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Accounting API Connections
            </button>
            <button
              onClick={() => handleAdminTabNavigation('company-settings')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'company-settings' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'company-settings' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'company-settings' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              LOB Settings
            </button>
            <button
              onClick={() => handleAdminTabNavigation('data-mapping')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'data-mapping' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'data-mapping' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'data-mapping' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Data Mapping
            </button>
            <button
              onClick={() => handleAdminTabNavigation('data-review')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'data-review' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'data-review' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'data-review' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Data Review
            </button>
            <button
              onClick={() => handleAdminTabNavigation('documents')}
              style={{
                padding: '12px 24px',
                background: adminDashboardTab === 'documents' ? '#667eea' : 'transparent',
                color: adminDashboardTab === 'documents' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: adminDashboardTab === 'documents' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Documents
            </button>
          </div>
          
          {/* Company Management Tab */}
          {adminDashboardTab === 'company-management' && (
            <CompanyManagementTab
              companyManagementSubTab={companyManagementSubTab}
              setCompanyManagementSubTab={setCompanyManagementSubTab}
              currentUser={currentUser}
              selectedCompanyId={selectedCompanyId}
              companies={companies}
              users={users}
              assessmentRecords={assessmentRecords}
              isLoading={isLoading}
              newCompanyName={newCompanyName}
              setNewCompanyName={setNewCompanyName}
              addCompany={addCompany}
              setEditingCompanyId={setEditingCompanyId}
              setCompanyAddressStreet={setCompanyAddressStreet}
              setCompanyAddressCity={setCompanyAddressCity}
              setCompanyAddressState={setCompanyAddressState}
              setCompanyAddressZip={setCompanyAddressZip}
              selectedAffiliateCodeForNewCompany={selectedAffiliateCodeForNewCompany}
              setSelectedAffiliateCodeForNewCompany={setSelectedAffiliateCodeForNewCompany}
              setCompanyAddressCountry={setCompanyAddressCountry}
              setCompanyIndustrySector={setCompanyIndustrySector}
              setAccountingSystem={setAccountingSystem}
              setCompanySizeCategory={setCompanySizeCategory}
              setIndustrySectorCategory={setIndustrySectorCategory}
              setShowCompanyDetailsModal={setShowCompanyDetailsModal}
              deleteUser={deleteUser}
              newCompanyUserName={newCompanyUserName}
              setNewCompanyUserName={setNewCompanyUserName}
              newCompanyUserTitle={newCompanyUserTitle}
              setNewCompanyUserTitle={setNewCompanyUserTitle}
              newCompanyUserEmail={newCompanyUserEmail}
              setNewCompanyUserEmail={setNewCompanyUserEmail}
              newCompanyUserPhone={newCompanyUserPhone}
              setNewCompanyUserPhone={setNewCompanyUserPhone}
              newCompanyUserPassword={newCompanyUserPassword}
              setNewCompanyUserPassword={setNewCompanyUserPassword}
              addUser={addUser}
              existingCompanyUserName={existingCompanyUserName}
              setExistingCompanyUserName={setExistingCompanyUserName}
              existingCompanyUserEmail={existingCompanyUserEmail}
              setExistingCompanyUserEmail={setExistingCompanyUserEmail}
              newAssessmentUserName={newAssessmentUserName}
              setNewAssessmentUserName={setNewAssessmentUserName}
              newAssessmentUserTitle={newAssessmentUserTitle}
              setNewAssessmentUserTitle={setNewAssessmentUserTitle}
              newAssessmentUserEmail={newAssessmentUserEmail}
              setNewAssessmentUserEmail={setNewAssessmentUserEmail}
              newAssessmentUserPassword={newAssessmentUserPassword}
              setNewAssessmentUserPassword={setNewAssessmentUserPassword}
              existingAssessmentUserName={existingAssessmentUserName}
              setExistingAssessmentUserName={setExistingAssessmentUserName}
              existingAssessmentUserEmail={existingAssessmentUserEmail}
              setExistingAssessmentUserEmail={setExistingAssessmentUserEmail}
              grantExistingUserAccess={grantExistingUserAccess}
              setSelectedCompanyId={setSelectedCompanyId}
              company={company}
              companyProfiles={companyProfiles}
              setCompanyProfiles={setCompanyProfiles}
              monthly={monthly}
              trendData={trendData}
              setIsLoading={setIsLoading}
              onCompanyUpdated={handleCompanyUpdated}
              paymentsSelectedCompany={paymentsSelectedCompany}
              selectedSubscriptionPlan={selectedSubscriptionPlan}
              setSelectedSubscriptionPlan={setSelectedSubscriptionPlan}
              activeSubscription={activeSubscription}
              setActiveSubscription={setActiveSubscription}
              loadingSubscription={loadingSubscription}
              setShowCheckoutModal={setShowCheckoutModal}
              setShowUpdatePaymentModal={setShowUpdatePaymentModal}
              subscriptionMonthlyPrice={paymentsPricing.monthly}
              subscriptionQuarterlyPrice={paymentsPricing.quarterly}
              subscriptionAnnualPrice={paymentsPricing.annual}
              subscriptionSetupFee={paymentsPricing.setupFee}
            />
          )}

          {/* Documents Tab */}
          {adminDashboardTab === 'documents' && selectedCompanyId && (
            <DocumentsTab selectedCompanyId={selectedCompanyId} />
          )}

          {!selectedCompanyId && adminDashboardTab === 'documents' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px 24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to manage documents.</p>
            </div>
          )}

          {/* LOB Settings Tab */}
          {adminDashboardTab === 'company-settings' && selectedCompanyId && (
            <CompanySettingsTab
              selectedCompanyId={selectedCompanyId}
              companies={companies}
              onLOBChange={(lobData: LOBData[]) => {
                setLinesOfBusiness(lobData);
              }}
              initialLOBs={linesOfBusiness}
            />
          )}

          {/* Import Financials Tab */}
          {adminDashboardTab === 'import-financials' && selectedCompanyId && (
            <>
              {/* QuickBooks Data Verification Section */}
              {loadedMonthlyData && loadedMonthlyData.length > 0 && qbRawData && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #10b981' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>QuickBooks Data Verification</h2>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
                    Imported from QuickBooks - {loadedMonthlyData.length} months of data verified
                  </p>

                  {/* Summary Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #86efac' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>MONTHS IMPORTED</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>{loadedMonthlyData.length}</div>
                    </div>
                    <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '16px', border: '1px solid #c4b5fd' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6', marginBottom: '4px' }}>DATE RANGE</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#7c3aed' }}>
                        {new Date(loadedMonthlyData[0].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - {new Date(loadedMonthlyData[loadedMonthlyData.length - 1].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '16px', border: '1px solid #93c5fd' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>TOTAL REVENUE</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>
                        ${(loadedMonthlyData.reduce((sum, m) => sum + (m.revenue || 0), 0) / 1000).toFixed(0)}K
                      </div>
                    </div>
                    <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px', border: '1px solid #fcd34d' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>TOTAL ASSETS</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#d97706' }}>
                        ${(loadedMonthlyData[loadedMonthlyData.length - 1].totalAssets / 1000).toFixed(0)}K
                      </div>
                    </div>
                  </div>

                  {/* Sample Data Tables */}
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sample Income Statement Data (Last 6 Months)</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Month</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Revenue</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Expense</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>COGS Total</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Net Income</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadedMonthlyData.slice(-6).map((m, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px', color: '#1e293b' }}>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#10b981', fontWeight: '600' }}>${m.revenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600' }}>${m.expense.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>${m.cogsTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: (m.revenue - m.expense - m.cogsTotal) >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                                ${(m.revenue - m.expense - m.cogsTotal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sample Balance Sheet Data (Last 6 Months)</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Month</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Cash</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>A/R</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>A/P</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Total Assets</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Total Equity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadedMonthlyData.slice(-6).map((m, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px', color: '#1e293b' }}>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#10b981', fontWeight: '600' }}>${m.cash.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#3b82f6' }}>${m.ar.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>${m.ap.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#8b5cf6', fontWeight: '600' }}>${m.totalAssets.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ec4899', fontWeight: '600' }}>${m.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '8px' }}>Data Quality Check</div>
                    <div style={{ fontSize: '13px', color: '#059669' }}>
                      • All {loadedMonthlyData.length} months have complete data<br/>
                      • Income Statement fields populated: Revenue, Expenses, COGS<br/>
                      • Balance Sheet fields populated: Assets, Liabilities, Equity<br/>
                      • Ready for AI-assisted mapping
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Excel Import</h2>
                
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <p style={{ fontSize: '14px', color: '#0c4a6e', lineHeight: '1.6', margin: 0 }}>
                    To use spreadsheet uploads <a href="mailto:steve@stevebuck.us" style={{ color: '#0284c7', fontWeight: '600', textDecoration: 'none' }}>Email Us</a> for a spreadsheet format. For best results include 36 months of historical data.
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Upload Financial Data</h3>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ marginBottom: '16px', padding: '12px', border: '2px dashed #cbd5e1', borderRadius: '8px', width: '100%', cursor: 'pointer' }} />
                  {error && <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
                  {file && <div style={{ fontSize: '14px', color: '#10b981', fontWeight: '600' }}>Loaded: {file.name}</div>}
                </div>

              {file && columns.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Column Mapping</h3>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Verify or adjust the column mappings below. Columns have been auto-detected.</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Required Fields</h4>
                      {renderColumnSelector('Date/Period', 'date')}
                      {renderColumnSelector('Total Revenue', 'revenue')}
                      {renderColumnSelector('Total Expenses', 'expense')}
                      {renderColumnSelector('Total Assets', 'totalAssets')}
                      {renderColumnSelector('Total Liabilities', 'totalLiab')}
                      {renderColumnSelector('Total Equity', 'totalEquity')}
                    </div>
                    
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Cost of Goods Sold</h4>
                      {renderColumnSelector('COGS Payroll', 'cogsPayroll')}
                      {renderColumnSelector('COGS Owner Pay', 'cogsOwnerPay')}
                      {renderColumnSelector('COGS Contractors', 'cogsContractors')}
                      {renderColumnSelector('COGS Materials', 'cogsMaterials')}
                      {renderColumnSelector('COGS Commissions', 'cogsCommissions')}
                      {renderColumnSelector('COGS Other', 'cogsOther')}
                      {renderColumnSelector('COGS Total', 'cogsTotal')}
                    </div>
                    
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Operating Expenses</h4>
                      {renderColumnSelector('Sales & Marketing', 'salesExpense')}
                      {renderColumnSelector('Rent/Lease', 'rent')}
                      {renderColumnSelector('Infrastructure/Utilities', 'infrastructure')}
                      {renderColumnSelector('Auto & Travel', 'autoTravel')}
                      {renderColumnSelector('Professional Services', 'professionalFees')}
                      {renderColumnSelector('Insurance', 'insurance')}
                      {renderColumnSelector('OPEX Other', 'marketing')}
                    </div>
                    
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Payroll & Owners</h4>
                      {renderColumnSelector('OPEX Payroll', 'payroll')}
                      {renderColumnSelector('Owners Base Pay', 'ownerBasePay')}
                      {renderColumnSelector('Owners Retirement', 'ownersRetirement')}
                      {renderColumnSelector('Contractors/Distribution', 'subcontractors')}
                      {renderColumnSelector('Interest Expense', 'interestExpense')}
                      {renderColumnSelector('Depreciation Expense', 'depreciationAmortization')}
                      {renderColumnSelector('Operating Expense Total', 'operatingExpenseTotal')}
                      {renderColumnSelector('Non-Operating Income', 'nonOperatingIncome')}
                      {renderColumnSelector('Extraordinary Items', 'extraordinaryItems')}
                      {renderColumnSelector('Net Profit', 'netProfit')}
                    </div>
                    
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Assets</h4>
                      {renderColumnSelector('Cash', 'cash')}
                      {renderColumnSelector('Accounts Receivable', 'ar')}
                      {renderColumnSelector('Inventory', 'inventory')}
                      {renderColumnSelector('Other Current Assets', 'otherCA')}
                      {renderColumnSelector('Total Current Assets', 'tca')}
                      {renderColumnSelector('Fixed Assets', 'fixedAssets')}
                      {renderColumnSelector('Other Assets', 'otherAssets')}
                    </div>
                    
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Liabilities & Other</h4>
                      {renderColumnSelector('Accounts Payable', 'ap')}
                      {renderColumnSelector('Line of Credit', 'loc')}
                      {renderColumnSelector('Other Current Liabilities', 'otherCL')}
                      {renderColumnSelector('Total Current Liabilities', 'tcl')}
                      {renderColumnSelector('Long Term Debt', 'ltd')}
                      {renderColumnSelector('Total Liabilities & Equity', 'totalLAndE')}
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '20px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                    <p style={{ fontSize: '13px', color: '#0c4a6e', margin: 0 }}>
                      <strong>Tip:</strong> At minimum, map Date, Total Revenue, Total Expenses, Total Assets, and Total Liabilities for basic analysis. 
                      Map detailed P&L and balance sheet items for comprehensive analysis and reporting.
                    </p>
                  </div>
                </div>
              )}
            </div>

              {/* Trial Balance Import Section */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={20} />
                  Trial Balance Import
                </h2>
                
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <p style={{ fontSize: '14px', color: '#065f46', lineHeight: '1.6', margin: 0 }}>
                    <strong>Trial Balance Format:</strong> Upload a CSV with columns: Acct Type, Acct ID, Description, then date columns (e.g., 12/31/2022, 1/31/2023, ...).
                    This format supports QuickBooks-style account types and routes through Data Mapping for precise account classification.
                  </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Upload Trial Balance CSV</h3>
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      try {
                        const text = await file.text();
                        const parsed = parseTrialBalanceCSV(text, selectedCompanyId);
                        const csvData = {
                          ...parsed,
                          _companyId: selectedCompanyId,
                          fileName: file.name,
                        };
                        setCsvTrialBalanceData(csvData);
                        // Save to localStorage for persistence across sessions
                        localStorage.setItem(`csvTrialBalance_${selectedCompanyId}`, JSON.stringify(csvData));
                        setError(null);
                        alert(`Parsed ${parsed.accounts.length} accounts across ${parsed.dates.length} periods. Go to Data Mapping tab to map accounts.`);
                      } catch (err: any) {
                        setError(`Failed to parse Trial Balance CSV: ${err.message}`);
                        setCsvTrialBalanceData(null);
                      }
                    }} 
                    style={{ marginBottom: '16px', padding: '12px', border: '2px dashed #10b981', borderRadius: '8px', width: '100%', cursor: 'pointer', background: '#f0fdf4' }} 
                  />
                  {error && error.includes('Trial Balance') && (
                    <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
                  )}
                </div>

                {csvTrialBalanceData && csvTrialBalanceData._companyId === selectedCompanyId && (
                  <div style={{ background: '#f0fdf4', border: '2px solid #10b981', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '12px' }}>
                      ? Trial Balance Loaded: {csvTrialBalanceData.fileName}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ background: 'white', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>{csvTrialBalanceData.accounts?.length || 0}</div>
                        <div style={{ fontSize: '12px', color: '#065f46' }}>Accounts</div>
                      </div>
                      <div style={{ background: 'white', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>{csvTrialBalanceData.dates?.length || 0}</div>
                        <div style={{ fontSize: '12px', color: '#3730a3' }}>Periods</div>
                      </div>
                      <div style={{ background: 'white', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>{Object.keys(csvTrialBalanceData.accountsByType || {}).length}</div>
                        <div style={{ fontSize: '12px', color: '#92400e' }}>Account Types</div>
                      </div>
                    </div>
                    
                    {/* Account Types Summary */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '8px' }}>Account Types Found:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {Object.entries(csvTrialBalanceData.accountsByType || {}).map(([type, accounts]: [string, any]) => (
                          <span key={type} style={{ 
                            padding: '4px 10px', 
                            background: 'white', 
                            borderRadius: '12px', 
                            fontSize: '12px', 
                            color: '#065f46',
                            border: '1px solid #86efac'
                          }}>
                            {type}: {accounts.length}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={() => setAdminDashboardTab('data-mapping')}
                        style={{
                          padding: '12px 24px',
                          background: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(102, 126, 234, 0.3)'
                        }}
                      >
                        ? Go to Data Mapping
                      </button>
                      <button
                        onClick={() => {
                          setCsvTrialBalanceData(null);
                          localStorage.removeItem(`csvTrialBalance_${selectedCompanyId}`);
                        }}
                        style={{
                          padding: '12px 24px',
                          background: 'white',
                          color: '#64748b',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          
          {!selectedCompanyId && adminDashboardTab === 'import-financials' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px 24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to import Excel files.</p>
            </div>
          )}

          {/* Accounting API Connections Tab */}
          {adminDashboardTab === 'api-connections' && selectedCompanyId && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Accounting API Connections</h2>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
                Connect to accounting platforms to automatically import financial data for {companyName || 'your company'}.
              </p>
              <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                Selected Accounting System: <span style={{ fontWeight: '700', color: '#1e293b' }}>{selectedAccountingSystemLabel}</span>
              </div>

              {!selectedAccountingSystem && (
                <div style={{ marginBottom: '16px', padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '13px', color: '#9a3412' }}>
                  Please select an Accounting System on the Company Profile page to enable the correct connector.
                </div>
              )}

              {selectedAccountingSystem === 'CSV_FILE' && (
                <div style={{ marginBottom: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', color: '#065f46' }}>
                  CSV file does not require an API connection. Use the Trial Balance CSV upload in Data Mapping (or Excel Import) to load data.
                </div>
              )}

              {selectedAccountingSystem &&
                !['QUICKBOOKS', 'QUICKBOOKS_DESKTOP', 'XERO', 'INFOR_M3', 'SAGE', 'SAGE_INTACCT', 'NETSUITE', 'DYNAMICS', 'DYNAMICS365', 'ACUMATICA', 'ODOO', 'CSV_FILE'].includes(selectedAccountingSystem) && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '13px', color: '#9a3412' }}>
                    {selectedAccountingSystemLabel} is not supported yet.
                  </div>
                )}

              {selectedAccountingSystem &&
                ['QUICKBOOKS_DESKTOP', 'DYNAMICS', 'DYNAMICS365', 'ACUMATICA', 'ODOO', 'SAGE_INTACCT'].includes(selectedAccountingSystem) && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '13px', color: '#0c4a6e' }}>
                    {String(currentUser?.role || '').toUpperCase() === 'SITEADMIN' ? (
                      <>
                        {selectedAccountingSystemLabel} configuration is managed in <strong>Site Administration &gt; Consultants/Businesses</strong> for this company.
                        Use that admin-only section to save credentials, programs, and schedule settings.
                      </>
                    ) : (
                      <>
                        {selectedAccountingSystemLabel} is configured by your administrator.
                        This page shows operational status/actions only; contact your administrator for credential or program changes.
                      </>
                    )}
                  </div>
                )}

              {selectedAccountingSystem === 'QUICKBOOKS' && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '2px solid #e2e8f0' }}>
              {/* QuickBooks Connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#2ca01c' }}>QB</div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>QuickBooks Online</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Intuit QuickBooks Online</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ 
                    flex: 1, 
                    padding: '12px', 
                    background: qbConnected && qbStatus === 'ACTIVE' ? '#d1fae5' : qbStatus === 'ERROR' ? '#fee2e2' : qbStatus === 'EXPIRED' ? '#fed7aa' : '#fef3c7', 
                    borderRadius: '8px', 
                    border: `1px solid ${qbConnected && qbStatus === 'ACTIVE' ? '#10b981' : qbStatus === 'ERROR' ? '#ef4444' : qbStatus === 'EXPIRED' ? '#f97316' : '#fbbf24'}` 
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: qbConnected && qbStatus === 'ACTIVE' ? '#065f46' : qbStatus === 'ERROR' ? '#991b1b' : qbStatus === 'EXPIRED' ? '#9a3412' : '#92400e', marginBottom: '4px' }}>
                      {qbConnected && qbStatus === 'ACTIVE' ? 'Connected' : qbStatus === 'ERROR' ? 'Error' : qbStatus === 'EXPIRED' ? 'Token Expired' : 'Status: Not Connected'}
                    </div>
                    <div style={{ fontSize: '12px', color: qbConnected && qbStatus === 'ACTIVE' ? '#065f46' : qbStatus === 'ERROR' ? '#991b1b' : qbStatus === 'EXPIRED' ? '#9a3412' : '#92400e' }}>
                      {qbError || (qbConnected && qbStatus === 'ACTIVE' ? (qbLastSync ? `Last synced: ${qbLastSync.toLocaleString()}` : 'Ready to sync') : qbStatus === 'EXPIRED' ? 'Please reconnect' : 'Ready to connect')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="month"
                    value={apiFinancialTargetMonth}
                    onChange={(e) => setApiFinancialTargetMonth(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                  />
                  <select
                    value={apiFinancialImportMode}
                    onChange={(e) => setApiFinancialImportMode(e.target.value === 'only' ? 'only' : 'through')}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                  >
                    <option value="through">Through month</option>
                    <option value="only">Only month</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {!qbConnected || qbStatus === 'EXPIRED' || qbStatus === 'ERROR' ? (
                    <button
                      onClick={connectQuickBooks}
                      style={{
                        padding: '12px 24px',
                        background: '#2ca01c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#239017'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#2ca01c'}
                    >
                      {qbConnected ? 'Reconnect' : 'Connect'} to QuickBooks
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={syncQuickBooks}
                        disabled={qbSyncing}
                        style={{
                          padding: '12px 24px',
                          background: qbSyncing ? '#94a3b8' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: qbSyncing ? 'not-allowed' : 'pointer',
                          transition: 'background 0.2s',
                          opacity: qbSyncing ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => !qbSyncing && (e.currentTarget.style.background = '#5568d3')}
                        onMouseLeave={(e) => !qbSyncing && (e.currentTarget.style.background = '#667eea')}
                      >
                        {qbSyncing ? 'Syncing...' : 'Sync Data'}
                      </button>
                      <button
                        onClick={disconnectQuickBooks}
                        disabled={qbSyncing}
                        style={{
                          padding: '12px 24px',
                          background: 'white',
                          color: '#ef4444',
                          border: '2px solid #ef4444',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: qbSyncing ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: qbSyncing ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => !qbSyncing && (e.currentTarget.style.background = '#fef2f2')}
                        onMouseLeave={(e) => !qbSyncing && (e.currentTarget.style.background = 'white')}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
              )}

              {selectedAccountingSystem === 'XERO' && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '2px solid #e2e8f0' }}>
              {/* Xero Connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#13B5EA' }}>X</div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Xero</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Xero Accounting Software</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ 
                    flex: 1, 
                    padding: '12px', 
                    background: xeroConnected && xeroStatus === 'ACTIVE' ? '#d1fae5' : xeroStatus === 'ERROR' ? '#fee2e2' : xeroStatus === 'EXPIRED' ? '#fed7aa' : '#fef3c7', 
                    borderRadius: '8px', 
                    border: `1px solid ${xeroConnected && xeroStatus === 'ACTIVE' ? '#10b981' : xeroStatus === 'ERROR' ? '#ef4444' : xeroStatus === 'EXPIRED' ? '#f97316' : '#fbbf24'}` 
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: xeroConnected && xeroStatus === 'ACTIVE' ? '#065f46' : xeroStatus === 'ERROR' ? '#991b1b' : xeroStatus === 'EXPIRED' ? '#9a3412' : '#92400e', marginBottom: '4px' }}>
                      {xeroConnected && xeroStatus === 'ACTIVE' ? 'Connected' : xeroStatus === 'ERROR' ? 'Error' : xeroStatus === 'EXPIRED' ? 'Token Expired' : 'Status: Not Connected'}
                    </div>
                    <div style={{ fontSize: '12px', color: xeroConnected && xeroStatus === 'ACTIVE' ? '#065f46' : xeroStatus === 'ERROR' ? '#991b1b' : xeroStatus === 'EXPIRED' ? '#9a3412' : '#92400e' }}>
                      {xeroError || (xeroConnected && xeroStatus === 'ACTIVE' ? (xeroLastSync ? `Last synced: ${xeroLastSync.toLocaleString()}` : 'Ready to sync') : xeroStatus === 'EXPIRED' ? 'Please reconnect' : 'Ready to connect')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="month"
                    value={apiFinancialTargetMonth}
                    onChange={(e) => setApiFinancialTargetMonth(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                  />
                  <select
                    value={apiFinancialImportMode}
                    onChange={(e) => setApiFinancialImportMode(e.target.value === 'only' ? 'only' : 'through')}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', background: 'white' }}
                  >
                    <option value="through">Through month</option>
                    <option value="only">Only month</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {!xeroConnected || xeroStatus === 'EXPIRED' || xeroStatus === 'ERROR' ? (
                    <button
                      onClick={connectXero}
                      style={{
                        padding: '12px 24px',
                        background: '#13B5EA',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#0E8FBA'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#13B5EA'}
                    >
                      {xeroConnected ? 'Reconnect' : 'Connect'} to Xero
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={syncXero}
                        disabled={xeroSyncing}
                        style={{
                          padding: '12px 24px',
                          background: xeroSyncing ? '#94a3b8' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: xeroSyncing ? 'not-allowed' : 'pointer',
                          transition: 'background 0.2s',
                          opacity: xeroSyncing ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => !xeroSyncing && (e.currentTarget.style.background = '#5568d3')}
                        onMouseLeave={(e) => !xeroSyncing && (e.currentTarget.style.background = '#667eea')}
                      >
                        {xeroSyncing ? 'Syncing...' : 'Sync Data'}
                      </button>
                      <button
                        onClick={disconnectXero}
                        disabled={xeroSyncing}
                        style={{
                          padding: '12px 24px',
                          background: 'white',
                          color: '#ef4444',
                          border: '2px solid #ef4444',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: xeroSyncing ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: xeroSyncing ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => !xeroSyncing && (e.currentTarget.style.background = '#fef2f2')}
                        onMouseLeave={(e) => !xeroSyncing && (e.currentTarget.style.background = 'white')}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
              )}

              {selectedAccountingSystem === 'INFOR_M3' && (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '2px solid #e2e8f0' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                    Infor M3 Monthly COA Pull
                  </h3>
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                    Infor M3 credential setup and program configuration are managed in <strong>Site Administration &gt; Businesses</strong>.
                    This action triggers a monthly Chart of Accounts pull using the <strong>Accounts</strong> MI Program configured for this company.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      onClick={pullInforMonthlyCao}
                      disabled={inforCaoPulling}
                      style={{
                        padding: '10px 16px',
                        background: inforCaoPulling ? '#94a3b8' : '#1d4ed8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: inforCaoPulling ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {inforCaoPulling ? 'Pulling COA...' : 'Pull Monthly COA Data'}
                    </button>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Requires Accounts MI Program in Site Admin &gt; Businesses.
                    </span>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#475569' }}>
                    <strong>Last COA pull:</strong>{' '}
                    {inforLastCaoPullAt ? inforLastCaoPullAt.toLocaleString() : 'Not yet run'}
                    {'  '}|{'  '}
                    <strong>Pulled by:</strong> {inforLastCaoPulledBy || 'N/A'}
                  </div>
                  {inforCaoMessage && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        background: inforCaoMessage.startsWith('Error:') ? '#fee2e2' : '#d1fae5',
                        color: inforCaoMessage.startsWith('Error:') ? '#991b1b' : '#065f46',
                        border: `1px solid ${inforCaoMessage.startsWith('Error:') ? '#fecaca' : '#86efac'}`,
                      }}
                    >
                      {inforCaoMessage}
                    </div>
                  )}
                </div>
              )}

              {/* QuickBooks Data Verification */}
              {loadedMonthlyData && loadedMonthlyData.length > 0 && qbRawData && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #10b981' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>QuickBooks Data Verification</h3>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
                    Synced successfully - {loadedMonthlyData.length} months of data imported
                  </p>

                  {/* Summary Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #86efac' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>MONTHS IMPORTED</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>{loadedMonthlyData.length}</div>
                    </div>
                    <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '16px', border: '1px solid #c4b5fd' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6', marginBottom: '4px' }}>DATE RANGE</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#7c3aed' }}>
                        {new Date(loadedMonthlyData[0].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - {new Date(loadedMonthlyData[loadedMonthlyData.length - 1].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '16px', border: '1px solid #93c5fd' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>TOTAL REVENUE</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>
                        ${(loadedMonthlyData.reduce((sum, m) => sum + (m.revenue || 0), 0) / 1000).toFixed(0)}K
                      </div>
                    </div>
                    <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '16px', border: '1px solid #fcd34d' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>TOTAL ASSETS</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#d97706' }}>
                        ${(loadedMonthlyData[loadedMonthlyData.length - 1].totalAssets / 1000).toFixed(0)}K
                      </div>
                    </div>
                  </div>

                  {/* Sample Data Tables - Show Individual Accounts */}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sample Income & Expense Accounts (Last 3 Months)</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Account</th>
                            {loadedMonthlyData.slice(-3).map((m, idx) => (
                              <th key={idx} style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>
                                {new Date(m.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // Extract individual accounts from qbRawData
                            const extractRows = (data: any, type: 'data' | 'total' = 'data'): any[] => {
                              const result: any[] = [];
                              if (!data || !data.Rows || !data.Rows.Row) return result;
                              const rows = Array.isArray(data.Rows.Row) ? data.Rows.Row : [data.Rows.Row];
                              
                              const processRows = (rows: any[], parentSection: string = ''): void => {
                                for (const row of rows) {
                                  if (row.type === 'Section') {
                                    const sectionName = row.Header?.ColData?.[0]?.value || '';
                                    if (row.Rows && row.Rows.Row) {
                                      const nested = Array.isArray(row.Rows.Row) ? row.Rows.Row : [row.Rows.Row];
                                      processRows(nested, sectionName);
                                    }
                                    if (type === 'total' && row.Summary?.ColData) {
                                      const name = row.Summary.ColData[0]?.value || '';
                                      if (name) {
                                        result.push({ name, section: parentSection, colData: row.Summary.ColData });
                                      }
                                    }
                                  } else if (row.type === 'Data' && row.ColData && type === 'data') {
                                    const name = row.ColData[0]?.value || '';
                                    if (name && !name.toLowerCase().includes('total')) {
                                      result.push({ name, section: parentSection, colData: row.ColData });
                                    }
                                  }
                                }
                              };
                              
                              processRows(rows);
                              return result;
                            };

                            // Get income and expense accounts
                            const allAccounts = extractRows(qbRawData?.profitAndLoss);
                            const incomeAccounts = allAccounts.filter(a => 
                              (a.section || '').toLowerCase().includes('income') || 
                              (a.section || '').toLowerCase().includes('revenue') ||
                              (a.section || '').toLowerCase().includes('service')
                            ).slice(0, 5);
                            const expenseAccounts = allAccounts.filter(a => 
                              (a.section || '').toLowerCase().includes('expense') || 
                              (a.section || '').toLowerCase().includes('cost')
                            ).slice(0, 5);

                            const displayAccounts = [...incomeAccounts, ...expenseAccounts].slice(0, 10);
                            
                            return displayAccounts.map((account, idx) => {
                              // Get values for last 3 months
                              const columnCount = qbRawData.profitAndLoss?.Columns?.Column?.length || 0;
                              const lastThreeMonths = Array.from({length: 3}, (_, i) => {
                                const colIndex = columnCount - 4 - (2 - i); // Skip the "Total" column
                                const value = account.colData[colIndex]?.value;
                                return parseFloat(value || '0');
                              });

                              const isIncome = incomeAccounts.includes(account);
                              
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px', color: '#1e293b' }}>
                                    <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '8px' }}>
                                      {isIncome ? '??' : '??'}
                                    </span>
                                    {account.name}
                                  </td>
                                  {lastThreeMonths.map((val, midx) => (
                                    <td key={midx} style={{ 
                                      padding: '8px', 
                                      textAlign: 'right', 
                                      color: isIncome ? '#10b981' : '#ef4444', 
                                      fontWeight: val !== 0 ? '600' : '400' 
                                    }}>
                                      ${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </td>
                                  ))}
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sample Balance Sheet Data (Last 6 Months)</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Month</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Cash</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>A/R</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>A/P</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Total Assets</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Total Equity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadedMonthlyData.slice(-6).map((m, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px', color: '#1e293b' }}>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#10b981', fontWeight: '600' }}>${m.cash.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#3b82f6' }}>${m.ar.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#f59e0b' }}>${m.ap.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#8b5cf6', fontWeight: '600' }}>${m.totalAssets.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#ec4899', fontWeight: '600' }}>${m.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #86efac', marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '8px' }}>Data Quality Check</div>
                    <div style={{ fontSize: '13px', color: '#059669' }}>
                      • All {loadedMonthlyData.length} months have complete data<br/>
                      • Income Statement: Revenue, Expenses, COGS populated<br/>
                      • Balance Sheet: Assets, Liabilities, Equity populated<br/>
                      • Ready for AI-assisted account mapping
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => {
                        // Navigate to Data Mapping tab
                        setAdminDashboardTab('data-mapping');
                      }}
                      style={{
                        padding: '12px 24px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#5568d3'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#667eea'}
                    >
                      <FileSpreadsheet size={16} />
                      <span>Proceed to AI Account Mapping ?</span>
                    </button>
                  </div>
                </div>
              )}


              {(selectedAccountingSystem === 'SAGE' || selectedAccountingSystem === 'SAGE_INTACCT') && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '2px solid #e2e8f0', opacity: 0.6 }}>
              {/* Sage Connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#00a851' }}>S</div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Sage</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Sage Business Cloud Accounting</p>
                  </div>
                </div>
                <div style={{ padding: '12px', background: '#e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                  Coming Soon
                </div>
              </div>
              )}

              {selectedAccountingSystem === 'NETSUITE' && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '2px solid #e2e8f0', opacity: 0.6 }}>
              {/* NetSuite Connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#E91C24' }}>NS</div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>NetSuite</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Oracle NetSuite ERP</p>
                  </div>
                </div>
                <div style={{ padding: '12px', background: '#e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                  Coming Soon
                </div>
              </div>
              )}

              {selectedAccountingSystem === 'DYNAMICS' && (
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', border: '2px solid #e2e8f0', opacity: 0.6 }}>
              {/* Dynamics Connection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#0078D4' }}>D</div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Microsoft Dynamics 365</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Microsoft Dynamics 365 Finance</p>
                  </div>
                </div>
                <div style={{ padding: '12px', background: '#e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                  Coming Soon
                </div>
              </div>
              )}

            </div>
          )}

          {!selectedCompanyId && adminDashboardTab === 'api-connections' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px 24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to manage API connections.</p>
            </div>
          )}

          {!selectedCompanyId && adminDashboardTab === 'data-review' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px 24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to review financial data.</p>
            </div>
          )}
        </div>
      )}

      {/* Covenants View - Accessible from header navigation */}
      {currentView === 'covenants' && selectedCompanyId && (
        <CovenantsTab
          selectedCompanyId={selectedCompanyId}
          currentUser={currentUser}
          monthly={monthly}
          companyName={companyName}
        />
      )}

      {/* Covenants View - No Company Selected */}
      {currentView === 'covenants' && !selectedCompanyId && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '64px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>No Company Selected</h2>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '12px' }}>Please select a company to manage covenants.</p>
        </div>
      )}

      {/* Operations View - With Company Selected */}
      {currentView === 'operations' && selectedCompanyId && (
        <OperationsTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          industrySectorCategory={company?.industrySectorCategory || null}
          initialTab={operationsPrintConfig?.tab}
          initialForecastBasisTab={operationsPrintConfig?.forecastBasisTab}
          initialForecastSubTab={operationsPrintConfig?.forecastSubTab}
        />
      )}

      {/* Operations View - No Company Selected */}
      {currentView === 'operations' && !selectedCompanyId && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '64px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>No Company Selected</h2>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '12px' }}>Please select a company to view operational data.</p>
        </div>
      )}

      {/* Daily Alerts View */}
      {currentView === 'daily-alerts' && selectedCompanyId && (
        <DailyAlertsView
          companyId={selectedCompanyId}
          companyName={companyName || ''}
          onNavigate={handleNavigation}
        />
      )}
      {currentView === 'daily-alerts' && !selectedCompanyId && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '64px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>No Company Selected</h2>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '12px' }}>Please select a company to view daily alerts.</p>
        </div>
      )}

      {/* Admin Dashboard */}
      {currentView === 'admin' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          {/* Checkout Modal */}
          {showCheckoutModal && selectedSubscriptionPlan && (() => {
            const planPrice = selectedSubscriptionPlan === 'monthly' ? (subscriptionMonthlyPrice ?? 0) :
                             selectedSubscriptionPlan === 'quarterly' ? (subscriptionQuarterlyPrice ?? 0) :
                             (subscriptionAnnualPrice ?? 0);
            const planPeriod = selectedSubscriptionPlan === 'monthly' ? '/month' :
                              selectedSubscriptionPlan === 'quarterly' ? '/quarter' : '/year';
            const setupFee = paymentsPricing.setupFee ?? 0;
            const firstRecurringBillDatePreview = addMonthsClamped(
              new Date(),
              billingIntervalMonths(selectedSubscriptionPlan as 'monthly' | 'quarterly' | 'annual')
            );

            return (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Complete Your Purchase</h2>
                    <button
                      onClick={() => setShowCheckoutModal(false)}
                      style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b', padding: '0', lineHeight: '1' }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Setup Fee + Recurring Summary */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#334155', marginBottom: '10px' }}>Order Summary</div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>Setup fee (due today)</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>One-time onboarding charge</div>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#10b981' }}>${setupFee.toFixed(2)}</div>
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', textTransform: 'capitalize' }}>{selectedSubscriptionPlan} subscription</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          ${planPrice.toFixed(2)}{planPeriod} starting{' '}
                          {firstRecurringBillDatePreview.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#667eea' }}>
                        ${planPrice.toFixed(2)}
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>{planPeriod}</span>
                      </div>
                    </div>
                  </div>

                  {/* USAePay Payment Form */}
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={16} />
                      Payment Information
                    </h3>
                    
                    {/* Payment Form */}
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      
                      try {
                        const response = await fetch('/api/payments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            // Note: server charges setup fee and schedules recurring; amount is used as a fallback for recurring pricing.
                            amount: planPrice,
                            companyId: selectedCompanyId,
                            subscriptionPlan: `${selectedSubscriptionPlan} Plan`,
                            billingPeriod: selectedSubscriptionPlan || '',
                            cardNumber: formData.get('cardNumber'),
                            cardholderName: formData.get('cardholderName'),
                            expirationMonth: formData.get('expMonth'),
                            expirationYear: formData.get('expYear'),
                            cvv: formData.get('cvv'),
                            billingAddress: {
                              street: formData.get('street') as string,
                              city: formData.get('city') as string,
                              state: formData.get('state') as string,
                              zip: formData.get('zip') as string,
                            },
                          }),
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                          const scheduleMsg = result.recurringScheduled
                            ? `Recurring billing scheduled. First recurring payment: ${new Date(result.firstRecurringBillDate).toLocaleDateString()}`
                            : `Setup fee paid, but recurring billing could not be scheduled automatically. Please use admin retry.`;
                          alert(`Payment successful!\n\nTransaction ID: ${result.transactionId || 'n/a'}\n\n${scheduleMsg}`);
                          setShowCheckoutModal(false);
                          setSelectedSubscriptionPlan(null);
                          // Refresh companies to show updated subscription
                          loadAllCompanies();
                        } else {
                          alert(`Payment failed\n\n${result.error || 'Please try again or contact support.'}`);
                        }
                      } catch (error) {
                        console.error('Payment error:', error);
                        alert('An error occurred while processing your payment. Please try again.');
                      }
                    }}>
                      {/* Card Information Section */}
                      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      💳 Card Details
                        </h4>
                        
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Card Number</label>
                          <input
                            type="text"
                            name="cardNumber"
                            autoComplete="cc-number"
                            placeholder="1234 5678 9012 3456"
                            maxLength={19}
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                          />
                        </div>
                        
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Cardholder Name</label>
                          <input
                            type="text"
                            name="cardholderName"
                            autoComplete="cc-name"
                            placeholder="John Doe"
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                          />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Exp Month</label>
                            <select name="expMonth" autoComplete="cc-exp-month" required style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}>
                              <option value="">MM</option>
                              {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Exp Year</label>
                            <select name="expYear" autoComplete="cc-exp-year" required style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}>
                              <option value="">YYYY</option>
                              {Array.from({length: 15}, (_, i) => new Date().getFullYear() + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>CVV</label>
                            <input
                              type="text"
                              name="cvv"
                              autoComplete="cc-csc"
                              placeholder="123"
                              maxLength={4}
                              required
                              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'white', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Billing Address Section */}
                      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MapPin size={16} />
                          Billing Address
                        </h4>
                        
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Street Address</label>
                          <input
                            type="text"
                            name="street"
                            autoComplete="billing street-address"
                            placeholder="123 Main St"
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                          />
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>City</label>
                            <input
                              type="text"
                              name="city"
                              autoComplete="billing address-level2"
                              placeholder="City"
                              required
                              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>State</label>
                            <input
                              type="text"
                              name="state"
                              autoComplete="billing address-level1"
                              placeholder="CA"
                              maxLength={2}
                              required
                              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                            />
                          </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>ZIP Code</label>
                            <input
                              type="text"
                              name="zip"
                              autoComplete="billing postal-code"
                              placeholder="12345"
                              maxLength={10}
                              required
                              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Country</label>
                            <select required style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}>
                              <option value="US">United States</option>
                              <option value="CA">Canada</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      {/* Payment Summary */}
                      <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Due Today:</span>
                          <span style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>${setupFee.toFixed(2)}</span>
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
                          Setup fee charged today. Recurring {selectedSubscriptionPlan} subscription begins on{' '}
                          {firstRecurringBillDatePreview.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.
                        </p>
                      </div>
                      
                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          type="button"
                          onClick={() => setShowCheckoutModal(false)}
                          style={{
                            flex: 1,
                            padding: '12px 24px',
                            background: 'white',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          style={{
                            flex: 1.5,
                            padding: '12px 32px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                        >
                          💳 {setupFee > 0 ? `Complete Setup Fee Payment - $${setupFee.toFixed(2)}` : 'Save Payment Method & Schedule'}
                        </button>
                      </div>
                    </form>
                    
                    {/* Security Notice */}
                    <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={16} color="#059669" />
                      <span style={{ fontSize: '12px', fontWeight: '500', color: '#059669' }}>
                        Secured by USAePay - Your payment information is encrypted
                      </span>
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={16} color="#059669" />
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#059669' }}>
                        Secure payment processing via USAePay. Your card data is encrypted and never stored on our servers.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Update Payment Method Modal */}
          {showUpdatePaymentModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
              <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Update Payment Method</h2>
                  <button
                    onClick={() => setShowUpdatePaymentModal(false)}
                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b', padding: '0', lineHeight: '1' }}
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleUpdatePaymentMethod}>
                  {/* Card Information Section */}
                  <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      💳 Card Details
                    </h4>
                    
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Card Number</label>
                      <input
                        type="text"
                        value={updatePaymentData.cardNumber}
                        onChange={(e) => {
                          const formatted = e.target.value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
                          setUpdatePaymentData({...updatePaymentData, cardNumber: formatted});
                        }}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        required
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Cardholder Name</label>
                      <input
                        type="text"
                        value={updatePaymentData.cardholderName}
                        onChange={(e) => setUpdatePaymentData({...updatePaymentData, cardholderName: e.target.value})}
                        placeholder="John Doe"
                        required
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Exp Month</label>
                        <input
                          type="text"
                          value={updatePaymentData.expirationMonth}
                          onChange={(e) => setUpdatePaymentData({...updatePaymentData, expirationMonth: e.target.value})}
                          placeholder="MM"
                          maxLength={2}
                          required
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Exp Year</label>
                        <input
                          type="text"
                          value={updatePaymentData.expirationYear}
                          onChange={(e) => setUpdatePaymentData({...updatePaymentData, expirationYear: e.target.value})}
                          placeholder="YYYY"
                          maxLength={4}
                          required
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>CVV</label>
                        <input
                          type="text"
                          value={updatePaymentData.cvv}
                          onChange={(e) => setUpdatePaymentData({...updatePaymentData, cvv: e.target.value})}
                          placeholder="123"
                          maxLength={4}
                          required
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Billing Address Section */}
                  <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                      📍 Billing Address
                    </h4>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Street Address</label>
                      <input
                        type="text"
                        value={updatePaymentData.billingStreet}
                        onChange={(e) => setUpdatePaymentData({...updatePaymentData, billingStreet: e.target.value})}
                        placeholder="123 Main St"
                        required
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>City</label>
                        <input
                          type="text"
                          value={updatePaymentData.billingCity}
                          onChange={(e) => setUpdatePaymentData({...updatePaymentData, billingCity: e.target.value})}
                          placeholder="City"
                          required
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>State</label>
                        <input
                          type="text"
                          value={updatePaymentData.billingState}
                          onChange={(e) => setUpdatePaymentData({...updatePaymentData, billingState: e.target.value.toUpperCase()})}
                          placeholder="State"
                          maxLength={2}
                          required
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>ZIP Code</label>
                      <input
                        type="text"
                        value={updatePaymentData.billingZip}
                        onChange={(e) => setUpdatePaymentData({...updatePaymentData, billingZip: e.target.value})}
                        placeholder="12345"
                        maxLength={10}
                        required
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                      />
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px', marginBottom: '20px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                    <Lock size={18} color="#065f46" />
                    <span style={{ fontSize: '13px', color: '#065f46', lineHeight: '1.5' }}>
                      Secure payment processing via USAePay. Your card data is encrypted and never stored on our servers.
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowUpdatePaymentModal(false)}
                      disabled={updatingPayment}
                      style={{
                        flex: 1,
                        padding: '12px 24px',
                        background: 'white',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#64748b',
                        cursor: updatingPayment ? 'not-allowed' : 'pointer',
                        opacity: updatingPayment ? 0.5 : 1
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updatingPayment}
                      style={{
                        flex: 1,
                        padding: '12px 24px',
                        background: updatingPayment ? '#94a3b8' : '#667eea',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'white',
                        cursor: updatingPayment ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {updatingPayment ? (
                        <>
                          <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                          Updating...
                        </>
                      ) : (
                        <>
                          <CreditCard size={16} />
                          Update Payment Method
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Data Mapping Tab - Content rendered through Financial Statements conditional below */}

          {!selectedCompanyId && adminDashboardTab === 'data-mapping' && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to map accounts.</p>
            </div>
          )}

          {adminDashboardTab === 'data-mapping' && selectedCompanyId && selectedAccountingSystem === 'CSV_FILE' && (
            <div style={{ maxWidth: '1280px', margin: '-18px auto 6px auto', padding: '0 16px', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '10px 12px', width: '52%', minWidth: '520px', maxWidth: '640px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#9a3412', marginBottom: '4px' }}>Publish Monthly Financials</div>
                  <p style={{ fontSize: '12px', color: '#92400e', margin: 0, fontWeight: '600', whiteSpace: 'nowrap' }}>
                    Only Publish prior month data when books are closed.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', flexShrink: 0 }}>
                  <input
                    type="month"
                    value={publishMonthInput}
                    onChange={(e) => setPublishMonthInput(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: 'white' }}
                  />
                  <button
                    onClick={async () => {
                      if (!selectedCompanyId) return;
                      if (!publishMonthInput || !/^\d{4}-\d{2}$/.test(publishMonthInput)) {
                        alert('Select a valid publish month first (YYYY-MM).');
                        return;
                      }
                      setIsPublishingMonthlyData(true);
                      try {
                        const response = await fetch('/api/financials/publish-month', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            companyId: selectedCompanyId,
                            month: publishMonthInput,
                          }),
                        });
                        const result = await response.json();
                        if (!response.ok || !result?.success) {
                          throw new Error(result?.error || 'Failed to publish monthly data');
                        }
                        alert(`Published ${publishMonthInput} to core financial reports.`);
                        masterDataStore.clearCompanyCache(selectedCompanyId);
                      } catch (error: any) {
                        alert(`Publish failed: ${error?.message || 'Unknown error'}`);
                      } finally {
                        setIsPublishingMonthlyData(false);
                      }
                    }}
                    disabled={isPublishingMonthlyData}
                    style={{
                      padding: '8px 12px',
                      background: isPublishingMonthlyData ? '#9ca3af' : '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: isPublishingMonthlyData ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isPublishingMonthlyData ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {adminDashboardTab === 'data-mapping' && selectedCompanyId && aiMappings.length === 0 && !csvTrialBalanceData && !qbRawData && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No Financial Data to Map</div>
                <p style={{ fontSize: '14px', color: '#94a3b8' }}>
                  Selected Accounting System: {selectedAccountingSystemLabel}. Connect your accounting system or upload a Trial Balance CSV to map accounts.
                </p>
              </div>
              
              <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                {(() => {
                  if (selectedAccountingSystem === 'QUICKBOOKS') {
                    return (
                      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '2px solid #e2e8f0', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                          <DollarSign size={32} color="#667eea" />
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>QuickBooks API</div>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>Connect to QuickBooks Online to sync your financial data automatically.</p>
                        <button
                          onClick={() => setAdminDashboardTab('api-connections')}
                          style={{
                            padding: '10px 20px',
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Connect QuickBooks
                        </button>
                      </div>
                    );
                  }

                  if (selectedAccountingSystem === 'XERO') {
                    return (
                      <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '2px solid #fed7aa', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                          <TrendingUp size={32} color="#fb923c" />
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>Xero API</div>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>Connect to Xero to sync your financial data automatically.</p>
                        <button
                          onClick={() => setAdminDashboardTab('api-connections')}
                          style={{
                            padding: '10px 20px',
                            background: '#fb923c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Connect Xero
                        </button>
                      </div>
                    );
                  }

                  if (selectedAccountingSystem === 'QUICKBOOKS_DESKTOP' || selectedAccountingSystem === 'INFOR_M3') {
                    return (
                      <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '2px solid #fed7aa' }}>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#9a3412', marginBottom: '8px', textAlign: 'center' }}>
                          ERP COA Load
                        </div>
                        <p style={{ fontSize: '13px', color: '#92400e', marginBottom: '12px', textAlign: 'center' }}>
                          Load Accounts/COA JSON for mapping and process up to 36 months through the selected month.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Through month</span>
                          <input
                            type="month"
                            value={erpCaoThroughMonth}
                            onChange={(e) => setErpCaoThroughMonth(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: 'white' }}
                          />
                          <input
                            type="file"
                            accept=".json,.txt"
                            onChange={(e) => setErpCaoUploadFile(e.target.files?.[0] || null)}
                            style={{ fontSize: '12px' }}
                          />
                          <button
                            onClick={loadErpCaoInDataMapping}
                            disabled={erpCaoLoading}
                            style={{
                              padding: '8px 12px',
                              background: erpCaoLoading ? '#9ca3af' : '#7c3aed',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '700',
                              cursor: erpCaoLoading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {erpCaoLoading ? 'Loading COA...' : 'Load ERP COA'}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // CSV Trial Balance option: always available and used as the fallback for "not supported yet".
                  const isUnsupported =
                    !!selectedAccountingSystem &&
                    !['CSV_FILE', 'QUICKBOOKS', 'XERO'].includes(selectedAccountingSystem);

                  return (
                    <div style={{ background: isUnsupported ? '#fff7ed' : '#f0fdf4', borderRadius: '12px', padding: '16px', border: `2px solid ${isUnsupported ? '#fed7aa' : '#86efac'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                        <FileSpreadsheet size={32} color={isUnsupported ? '#fb923c' : '#10b981'} />
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: isUnsupported ? '#9a3412' : '#065f46', marginBottom: '6px', textAlign: 'center' }}>
                        {isUnsupported ? `${selectedAccountingSystemLabel} (Not supported yet)` : 'Trial Balance CSV'}
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', textAlign: 'center' }}>
                        Upload your Trial Balance CSV to start account mapping.
                      </p>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleTrialBalanceCsvSelected}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px dashed #10b981',
                          borderRadius: '8px',
                          background: '#ffffff',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Account Mapping Interface - Shows after CSV is uploaded */}
          {(currentView === 'admin' && adminDashboardTab === 'data-mapping' && selectedCompanyId && (csvTrialBalanceData?._companyId === selectedCompanyId || aiMappings.length > 0)) && (() => {
            const currentCompany = Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : undefined;

            // Get accounts for mapping from CSV data (if available)
            const csvAccountsForMapping = csvTrialBalanceData ? getAccountsForMapping(csvTrialBalanceData) : [];
            const hasCsvData = csvTrialBalanceData && csvTrialBalanceData._companyId === selectedCompanyId;
            const mappedApiSourceLabel =
              selectedAccountingSystem === 'QUICKBOOKS'
                ? 'QuickBooks'
                : selectedAccountingSystem === 'XERO'
                  ? 'Xero'
                  : selectedAccountingSystemLabel || 'accounting';
            const isCsvMappingWorkflow =
              hasCsvData ||
              selectedAccountingSystem === 'CSV_FILE' ||
              String(latestFinancialSource || '').toLowerCase().includes('csv');
            const showCsvProcessButton =
              selectedAccountingSystem === 'CSV_FILE' ||
              hasCsvData ||
              hasSavedCsvInLocalStorage;
            const hasSupportedApiReprocessPlatform = ['QUICKBOOKS', 'XERO', 'INFOR_M3', 'QUICKBOOKS_DESKTOP', 'SAGE', 'SAGE_INTACCT'].includes(
              String(selectedAccountingSystem || '').toUpperCase()
            );
            const selectedSystemNormalized = String(selectedAccountingSystem || '').toUpperCase();
            const erpCaoEnabledSystems = ['QUICKBOOKS_DESKTOP', 'INFOR_M3'];
            const erpCaoFutureSystems = ['ACUMATICA', 'DYNAMICS', 'DYNAMICS365', 'SAGE_INTACCT', 'SAGE'];
            const showErpCaoLoadPanel = erpCaoEnabledSystems.includes(selectedSystemNormalized);
            const showProcessButton =
              showCsvProcessButton ||
              hasSupportedApiReprocessPlatform ||
              Boolean(loadedMonthlyData && loadedMonthlyData.length > 0);

            return (
              <div
                key={`csv-data-mapping-${selectedCompanyId}-${dataRefreshKey}`}
                style={{
                  maxWidth: '1280px',
                  margin: '0 auto',
                  // Pull the section up to reduce the large perceived gap under the admin tabs.
                  marginTop: '-54px',
                  padding: '0px 16px 16px'
                }}
              >
                <div style={{ fontSize: '18px', color: '#334155', fontWeight: '600', marginBottom: '4px' }}>
                  Accounting System: <span style={{ fontWeight: '700', color: '#475569' }}>{selectedAccountingSystemLabel}</span>
                </div>
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '10px' }}>
                  {hasCsvData
                    ? `Map Trial Balance accounts to Corelytics accounts - Source: ${csvTrialBalanceData.fileName || 'CSV Upload'}`
                    : `${aiMappings.length} saved account mappings loaded from database`
                  }
                </p>

                {showErpCaoLoadPanel && (
                  <div style={{ marginBottom: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#9a3412', marginBottom: '6px' }}>
                      ERP COA Load
                    </div>
                    <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '8px' }}>
                      Load monthly Accounts/COA data and process up to 36 months through the selected month for mapping and financial reporting.
                    </div>
                    <div style={{ fontSize: '11px', color: '#a16207', marginBottom: '8px' }}>
                      Future-ready connector list: {erpCaoFutureSystems.join(', ')}.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Through month</span>
                      <input
                        type="month"
                        value={erpCaoThroughMonth}
                        onChange={(e) => setErpCaoThroughMonth(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: 'white' }}
                      />
                      <input
                        type="file"
                        accept=".json,.txt"
                        onChange={(e) => setErpCaoUploadFile(e.target.files?.[0] || null)}
                        style={{ fontSize: '12px' }}
                      />
                      <button
                        onClick={loadErpCaoInDataMapping}
                        disabled={erpCaoLoading}
                        style={{
                          padding: '8px 12px',
                          background: erpCaoLoading ? '#9ca3af' : '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: erpCaoLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {erpCaoLoading ? 'Loading COA...' : 'Load ERP COA'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedAccountingSystem === 'CSV_FILE' && (
                  <div style={{ marginBottom: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Upload/Replace Trial Balance CSV</div>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleTrialBalanceCsvSelected}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px dashed #94a3b8',
                        borderRadius: '6px',
                        background: 'white',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                )}

                {/* AI-Assisted Mapping Section for CSV */}
                {hasCsvData && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '10px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                          AI-Assisted Account Mapping
                        </h2>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                          Use AI to automatically suggest mappings from Trial Balance accounts ({csvAccountsForMapping.length} accounts) to your standardized financial fields
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          setIsGeneratingMappings(true);
                          try {
                            // Convert CSV accounts to format expected by AI mapping
                            const qbAccountsWithClass = csvAccountsForMapping.map(acc => ({
                              name: acc.name,
                              classification: acc.classification,
                              accountCode: acc.acctId,  // Include account code for better AI mapping
                              accountType: acc.acctType,
                            }));
                            const currentSectorCategory = companies.find(c => c.id === selectedCompanyId)?.industrySectorCategory || '01';
                            const targetFieldOptions = getTargetFieldOptions(currentSectorCategory);
                            const sectorTargetFields = [...targetFieldOptions.revenue, ...targetFieldOptions.cogs];

                            console.log('?? CSV accounts to map:', qbAccountsWithClass.length);
                            console.log('?? First 10 accounts:', qbAccountsWithClass.slice(0, 10));

                            const response = await fetch('/api/ai-mapping/enhanced', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                qbAccountsWithClass,
                                companyId: selectedCompanyId,
                                targetFields: sectorTargetFields
                              })
                            });

                            if (!response.ok) {
                              throw new Error('Failed to generate mappings');
                            }

                            const data = await response.json();
                            setAiMappings(data.mappings || []);
                            setShowMappingSection(true);
                          } catch (error: any) {
                            console.error('Error generating mappings:', error);
                            alert('Failed to generate AI mappings: ' + error.message);
                          } finally {
                            setIsGeneratingMappings(false);
                          }
                        }}
                        disabled={isGeneratingMappings || csvAccountsForMapping.length === 0}
                        style={{
                          padding: '12px 24px',
                          background: isGeneratingMappings ? '#94a3b8' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: isGeneratingMappings ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {isGeneratingMappings ? (
                          <>
                            <Upload size={16} />
                            <span>Generating Mappings...</span>
                          </>
                        ) : (
                          <>
                            <TrendingUp size={16} />
                            <span>Generate AI Mappings</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Account Summary by Type */}
                    <div style={{ marginTop: '12px', padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '8px' }}>Accounts by Type:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {Object.entries(csvTrialBalanceData.accountsByType || {}).map(([type, accounts]: [string, any]) => (
                          <span key={type} style={{
                            padding: '4px 12px',
                            background: 'white',
                            borderRadius: '16px',
                            fontSize: '12px',
                            color: '#065f46',
                            border: '1px solid #86efac'
                          }}>
                            {type}: {accounts.length}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* AI-Assisted Mapping Section for API synced accounts (QuickBooks/Xero) */}
                {!hasCsvData && aiMappings.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '10px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                          AI-Assisted Account Mapping
                        </h2>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                          {aiMappings.filter(m => m.targetField === 'unmapped').length > 0
                            ? `Use AI to automatically suggest mappings for ${aiMappings.filter(m => m.targetField === 'unmapped').length} unmapped accounts to your standardized financial fields`
                            : 'All accounts are currently mapped. Re-run AI suggestions if you imported corrected accounting data.'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          setIsGeneratingMappings(true);
                          try {
                            // Convert current accounts to format expected by AI mapping
                            const qbAccountsWithClass = aiMappings.map(acc => ({
                              name: acc.qbAccount,
                              classification: acc.qbAccountClassification,
                              accountCode: acc.qbAccountCode,
                            }));
                            const currentSectorCategory = companies.find(c => c.id === selectedCompanyId)?.industrySectorCategory || '01';
                            const targetFieldOptions = getTargetFieldOptions(currentSectorCategory);
                            const sectorTargetFields = [...targetFieldOptions.revenue, ...targetFieldOptions.cogs];

                            console.log('?? API accounts to map:', qbAccountsWithClass.length);

                            const response = await fetch('/api/ai-mapping/enhanced', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                qbAccountsWithClass,
                                companyId: selectedCompanyId,
                                targetFields: sectorTargetFields
                              })
                            });

                            if (!response.ok) {
                              throw new Error('Failed to generate mappings');
                            }

                            const data = await response.json();
                            setAiMappings(data.mappings || []);
                            setShowMappingSection(true);
                          } catch (error: any) {
                            console.error('Error generating mappings:', error);
                            alert('Failed to generate AI mappings: ' + error.message);
                          } finally {
                            setIsGeneratingMappings(false);
                          }
                        }}
                        disabled={isGeneratingMappings}
                        style={{
                          padding: '12px 24px',
                          background: isGeneratingMappings ? '#94a3b8' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: isGeneratingMappings ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {isGeneratingMappings ? (
                          <>
                            <Upload size={16} />
                            <span>Generating Mappings...</span>
                          </>
                        ) : (
                          <>
                            <TrendingUp size={16} />
                            <span>{aiMappings.filter(m => m.targetField === 'unmapped').length > 0 ? 'Generate AI Mappings' : 'Regenerate AI Mappings'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Account Summary by Classification */}
                    <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#065f46', marginBottom: '8px' }}>Accounts by Classification:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {Object.entries(
                          aiMappings.reduce((acc: any, m) => {
                            const type = m.qbAccountClassification || 'Other';
                            acc[type] = (acc[type] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([type, count]: [string, any]) => (
                          <span key={type} style={{
                            padding: '4px 12px',
                            background: 'white',
                            borderRadius: '16px',
                            fontSize: '12px',
                            color: '#065f46',
                            border: '1px solid #86efac'
                          }}>
                            {type}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Mapping Results Section */}
                {showMappingSection && aiMappings.length > 0 && (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                        Account Mappings ({aiMappings.length} accounts)
                      </h2>
                      <button
                        onClick={() => setShowOnlyActionableMappings((prev) => !prev)}
                        style={{
                          padding: '8px 12px',
                          background: showOnlyActionableMappings ? '#0f766e' : '#e2e8f0',
                          color: showOnlyActionableMappings ? 'white' : '#334155',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        {showOnlyActionableMappings ? 'Showing New/Changed/Unmapped' : 'Showing All Accounts'}
                      </button>
                    </div>
                    {mappingSourceSummary && (
                      <div
                        style={{
                          marginBottom: '12px',
                          padding: '10px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          background: '#f8fafc',
                          display: 'flex',
                          gap: '12px',
                          flexWrap: 'wrap',
                          fontSize: '12px',
                          color: '#334155',
                        }}
                      >
                        <span><strong>Total:</strong> {mappingSourceSummary.total}</span>
                        <span><strong>New:</strong> {mappingSourceSummary.new}</span>
                        <span><strong>Changed:</strong> {mappingSourceSummary.changed}</span>
                        <span><strong>Inactive:</strong> {mappingSourceSummary.inactive}</span>
                        <span><strong>Unmapped:</strong> {mappingSourceSummary.unmapped}</span>
                        {mappingSourceSummary.lastSeedAt && (
                          <span><strong>Last Seed:</strong> {new Date(mappingSourceSummary.lastSeedAt).toLocaleString()}</span>
                        )}
                      </div>
                    )}

                    <AccountMappingTable
                      mappings={aiMappings}
                      linesOfBusiness={linesOfBusiness}
                      userDefinedAllocations={userDefinedAllocations}
                      industrySectorCategory={companies.find(c => c.id === selectedCompanyId)?.industrySectorCategory || '01'}
                      showOnlyActionable={showOnlyActionableMappings}
                      onMappingChange={(index, updates) => {
                        const updated = [...aiMappings];
                        updated[index] = { ...updated[index], ...updates };
                        setAiMappings(updated);
                      }}
                    />

                    {/* Save Mappings Section */}
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
                      {!csvTrialBalanceData && loadedMonthlyData && loadedMonthlyData.length > 0 && (
                        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                          <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                            <span style={{ fontSize: '16px' }}></span>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>{mappedApiSourceLabel} Data Detected</div>
                              <p style={{ fontSize: '12px', color: '#1e40af', margin: 0 }}>
                                Your financial data is imported. After saving mappings, click <strong>"Apply Mappings to Data"</strong> to create detailed expense breakdowns, then view in <strong>Data Review</strong> tab!
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Save Account Mappings</h3>
                          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                            {csvTrialBalanceData
                              ? 'Save your mappings, then process the CSV data to create monthly records.'
                              : hasSavedCsvInLocalStorage
                                ? 'A saved CSV was found for this company. Load it, then process with your mappings.'
                                : `Save your mappings to apply them to your ${mappedApiSourceLabel} data.`}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          {!csvTrialBalanceData && hasSavedCsvInLocalStorage && (
                            <button
                              onClick={() => {
                                try {
                                  const savedCsvData = localStorage.getItem(`csvTrialBalance_${selectedCompanyId}`);
                                  if (!savedCsvData) {
                                    alert('No saved CSV found for this company.');
                                    setHasSavedCsvInLocalStorage(false);
                                    return;
                                  }
                                  const parsed = JSON.parse(savedCsvData);
                                  if (!parsed || parsed._companyId !== selectedCompanyId) {
                                    alert('Saved CSV does not match the selected company.');
                                    return;
                                  }
                                  setCsvTrialBalanceData(parsed);
                                  alert(`Loaded saved CSV: ${parsed.fileName || 'Trial Balance CSV'}`);
                                } catch (err: any) {
                                  alert(`Failed to load saved CSV: ${err?.message || 'Unknown error'}`);
                                }
                              }}
                              style={{
                                padding: '8px 16px',
                                background: '#0ea5e9',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(14, 165, 233, 0.3)'
                              }}
                            >
                              Load Saved CSV
                            </button>
                          )}
                          {/* Unified process button for all import types */}
                          {showProcessButton && (
                          <>
                          {!isCsvMappingWorkflow && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="month"
                                value={apiFinancialTargetMonth}
                                onChange={(e) => setApiFinancialTargetMonth(e.target.value)}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: 'white' }}
                              />
                              <select
                                value={apiFinancialImportMode}
                                onChange={(e) => setApiFinancialImportMode(e.target.value === 'only' ? 'only' : 'through')}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: 'white' }}
                              >
                                <option value="through">Through month</option>
                                <option value="only">Only month</option>
                              </select>
                            </div>
                          )}
                          <button
                            onClick={async () => {
                              if (!aiMappings || aiMappings.length === 0) {
                                alert('Please save account mappings first!');
                                return;
                              }

                              if (isCsvMappingWorkflow) {
                                if (!hasCsvData) {
                                  alert('Upload a CSV or click "Load Saved CSV" first.');
                                  return;
                                }
                                if (!currentUser) {
                                  alert('User not logged in!');
                                  return;
                                }

                                setIsProcessingMonthlyData(true);
                                try {
                                  console.log('?? Processing CSV/Trial Balance data using mappings...');
                                  console.log('?? Total mappings:', aiMappings.length);

                                  // Process the CSV data using mappings
                                  const processedData = processTrialBalanceToMonthly(csvTrialBalanceData, aiMappings);
                                  const dailyMapped = processTrialBalanceToDailySnapshotsAndLines(csvTrialBalanceData, aiMappings);

                                  // Save to database
                                  const response = await fetch('/api/financials', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      companyId: selectedCompanyId,
                                      uploadedByUserId: currentUser.id,
                                      fileName: csvTrialBalanceData.fileName || 'CSV Trial Balance Upload',
                                      rawData: csvTrialBalanceData,
                                      columnMapping: { source: 'csv_trial_balance', mappings: aiMappings },
                                      monthlyData: processedData
                                    })
                                  });

                                  if (!response.ok) {
                                    const errorBody = await response.json().catch(() => ({}));
                                    const detailText =
                                      typeof errorBody?.details === 'string'
                                        ? errorBody.details
                                        : errorBody?.details
                                          ? JSON.stringify(errorBody.details)
                                          : '';
                                    throw new Error(`${errorBody?.error || 'Failed to save processed data'}${detailText ? `: ${detailText}` : ''}`);
                                  }

                                  await response.json();
                                  console.log(`? Processed and saved ${processedData.length} months of CSV data`);

                                  // Persist detailed daily post-mapped data for Operations > Daily Financials
                                  try {
                                    const dailyResponse = await fetch('/api/operational-sync/daily-financials', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        companyId: selectedCompanyId,
                                        platform: 'CSV_TRIAL_BALANCE',
                                        runId: `csv-map-${Date.now()}`,
                                        frequency: 'daily',
                                        records: dailyMapped.dailySnapshots,
                                        mappedLines: dailyMapped.mappedLines,
                                      }),
                                    });
                                    if (!dailyResponse.ok) {
                                      const dailyErrorBody = await dailyResponse.json().catch(() => ({}));
                                      console.error('Failed to persist daily mapped financial data:', dailyErrorBody);
                                    } else {
                                      const dailyResult = await dailyResponse.json();
                                      console.log(`✅ Saved ${dailyResult.recordsIngested || 0} daily snapshots (${dailyMapped.mappedLines.length} mapped lines submitted)`);
                                    }
                                  } catch (dailySaveError) {
                                    console.error('Error persisting daily mapped financial data:', dailySaveError);
                                  }

                                  // Automatically create master data from the processed data
                                  try {
                                    console.log('?? Auto-creating master data...');
                                    const masterDataResponse = await fetch('/api/save-master-file', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        companyId: selectedCompanyId,
                                        monthlyData: processedData
                                      })
                                    });

                                    const masterDataResult = await masterDataResponse.json();
                                    if (masterDataResult.success) {
                                      console.log(`? Master data auto-created: ${masterDataResult.months} months`);
                                      // Clear the master data cache so Data Review tab shows updated data
                                      masterDataStore.clearCompanyCache(selectedCompanyId);
                                      console.log('?? Master data cache cleared - Data Review will show fresh data');
                                    } else {
                                      console.error('? Failed to auto-create master data:', masterDataResult.error);
                                    }
                                  } catch (masterDataError) {
                                    console.error('? Error auto-creating master data:', masterDataError);
                                  }

                                  // Update local state
                                  setLoadedMonthlyData(processedData);
                                  alert(`Successfully processed and saved ${processedData.length} months of financial data from CSV/Trial Balance!`);
                                } catch (error: any) {
                                  console.error('Error processing CSV data:', error);
                                  alert('Failed to process CSV data: ' + error.message);
                                } finally {
                                  setIsProcessingMonthlyData(false);
                                }
                                return;
                              }

                              if (!selectedCompanyId) {
                                alert('No company selected');
                                return;
                              }
                              if (!/^\d{4}-\d{2}$/.test(apiFinancialTargetMonth)) {
                                alert('Select a valid target month first (YYYY-MM).');
                                return;
                              }

                              const confirmed = confirm(`Reprocess ${mappedApiSourceLabel} data with your account mappings?\n\nThis will re-run mapping application for the selected accounting source.`);
                              if (!confirmed) return;

                              setIsProcessingMonthlyData(true);
                              try {
                                console.log('?? Reprocessing API data with mappings...');

                                const response = await fetch('/api/financials/reprocess-mappings', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    companyId: selectedCompanyId,
                                    targetMonth: apiFinancialTargetMonth,
                                    mode: apiFinancialImportMode,
                                  })
                                });

                                const result = await response.json();

                                if (result.success) {
                                  alert(`${result.message}\n\nSwitching to Data Review tab to show your detailed financial data!`);
                                  // Switch to Data Review tab
                                  setAdminDashboardTab('data-review');
                                  // Trigger data reload by updating qbLastSync (this triggers the useEffect)
                                  setQbLastSync(new Date());
                                } else {
                                  alert(`Failed to reprocess: ${result.error}`);
                                }
                              } catch (error: any) {
                                console.error('Reprocess error:', error);
                                alert('Failed to reprocess data: ' + error.message);
                              } finally {
                                setIsProcessingMonthlyData(false);
                              }
                            }}
                            disabled={isProcessingMonthlyData || aiMappings.length === 0}
                            style={{
                              padding: '8px 16px',
                              background: isProcessingMonthlyData || aiMappings.length === 0 ? '#9ca3af' : '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              cursor: isProcessingMonthlyData || aiMappings.length === 0 ? 'not-allowed' : 'pointer',
                              boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)'
                            }}
                          >
                            {isProcessingMonthlyData
                              ? 'Processing...'
                              : isCsvMappingWorkflow
                                ? 'Process & Save Monthly Data'
                                : 'Apply Mappings to Data'}
                          </button>
                          </>
                          )}
                          
                          <button
                            onClick={async () => {
                              try {
                                console.log('?? Save Mappings Debug:', {
                                  currentCompany,
                                  currentCompanyId: currentCompany?.id,
                                  selectedCompanyId,
                                  aiMappingsCount: aiMappings?.length,
                                  aiMappingsSample: aiMappings?.slice(0, 2),
                                  linesOfBusinessCount: linesOfBusiness?.length
                                });

                                if (!currentCompany?.id) {
                                  alert(`Cannot save mappings: Company not found. Selected: ${selectedCompanyId}, Available companies: ${companies?.length || 0}`);
                                  return;
                                }

                                if (!aiMappings || aiMappings.length === 0) {
                                  alert('No mappings to save. Please generate AI mappings first.');
                                  return;
                                }

                                setIsSavingMappings(true);
                                const response = await fetch('/api/account-mappings', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    companyId: currentCompany.id,
                                    mappings: aiMappings,
                                    linesOfBusiness: linesOfBusiness
                                  })
                                });

                                if (response.ok) {
                                  alert('Account mappings saved successfully!');
                                } else {
                                  const errorBody = await response.json().catch(() => ({}));
                                  alert(`Failed to save account mappings${errorBody?.error ? `: ${errorBody.error}` : ''}${errorBody?.details ? `\n${typeof errorBody.details === 'string' ? errorBody.details : JSON.stringify(errorBody.details)}` : ''}`);
                                }
                              } catch (error) {
                                console.error('Error saving mappings:', error);
                                alert(`Failed to save account mappings: ${error instanceof Error ? error.message : 'Unknown error'}`);
                              } finally {
                                setIsSavingMappings(false);
                              }
                            }}
                            disabled={isSavingMappings}
                            style={{
                              padding: '8px 16px',
                              background: isSavingMappings ? '#9ca3af' : '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '14px',
                              fontWeight: '500',
                              cursor: isSavingMappings ? 'not-allowed' : 'pointer',
                              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                            }}
                          >
                            {isSavingMappings ? 'Saving...' : 'Save Mappings'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Account Preview Section */}
                {(hasCsvData || aiMappings.length > 0) && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                    {hasCsvData && csvTrialBalanceData
                      ? `Account Review - All ${csvTrialBalanceData.accounts?.length || 0} accounts (Most Recent Period)`
                      : `Account Review - All ${aiMappings.length} mapped accounts`}
                  </h2>
                  <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569', minWidth: '80px' }}>Type</th>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569', minWidth: '60px' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#475569', minWidth: '200px' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#475569', minWidth: '100px' }}>Latest Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const parseAmount = (raw: unknown): number => {
                            if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
                            if (typeof raw !== 'string') return 0;
                            const normalized = raw
                              .trim()
                              .replace(/\$/g, '')
                              .replace(/,/g, '')
                              .replace(/\(([^)]+)\)/, '-$1');
                            const parsed = Number.parseFloat(normalized);
                            return Number.isFinite(parsed) ? parsed : 0;
                          };

                          const collectLatestValues = (report: any) => {
                            const valueByKey = new Map<string, number>();
                            const cols = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
                            const latestColIndex = (() => {
                              if (cols.length <= 1) return -1;
                              let bestIndex = -1;
                              let bestTime = Number.NEGATIVE_INFINITY;

                              for (let i = 1; i < cols.length; i += 1) {
                                const title = String(cols[i]?.ColTitle || '').trim();
                                if (!title || title.toLowerCase() === 'total') continue;

                                let parsedTime = Number.NaN;
                                // Common QBO month labels (e.g., "Jan 2026", "2026-01", "2026-01-31").
                                const isoMonth = title.match(/^(\d{4})-(\d{2})$/);
                                if (isoMonth) {
                                  parsedTime = new Date(`${isoMonth[1]}-${isoMonth[2]}-01T00:00:00Z`).getTime();
                                } else {
                                  parsedTime = new Date(title).getTime();
                                }

                                if (Number.isFinite(parsedTime) && parsedTime > bestTime) {
                                  bestTime = parsedTime;
                                  bestIndex = i;
                                }
                              }

                              if (bestIndex >= 1) return bestIndex;

                              for (let i = cols.length - 1; i >= 1; i -= 1) {
                                const title = String(cols[i]?.ColTitle || '').trim().toLowerCase();
                                if (title !== 'total') return i;
                              }

                              return -1;
                            })();

                            const rows = Array.isArray(report?.Rows?.Row) ? report.Rows.Row : [];
                            const visitRows = (inputRows: any[]) => {
                              for (const row of inputRows) {
                                if (row?.type === 'Section') {
                                  const nested = Array.isArray(row?.Rows?.Row) ? row.Rows.Row : [];
                                  if (nested.length > 0) visitRows(nested);
                                  continue;
                                }
                                if (row?.type !== 'Data' || !Array.isArray(row?.ColData) || latestColIndex < 1) continue;

                                const name = String(row.ColData[0]?.value || '').trim();
                                if (!name || name.toLowerCase().includes('total')) continue;

                                // QBO report rows carry account id on the first (name) column.
                                const accountId = String(row.ColData[0]?.id || '').trim();
                                const amount = parseAmount(row.ColData[latestColIndex]?.value);

                                if (accountId) valueByKey.set(`id:${accountId}`, amount);
                                valueByKey.set(`name:${name.toLowerCase()}`, amount);
                              }
                            };

                            if (rows.length > 0) visitRows(rows);
                            return valueByKey;
                          };

                          const plValues = qbRawData?.profitAndLoss ? collectLatestValues(qbRawData.profitAndLoss) : new Map<string, number>();
                          const bsValues = qbRawData?.balanceSheet ? collectLatestValues(qbRawData.balanceSheet) : new Map<string, number>();

                          const mergedValues = new Map<string, number>([
                            ...Array.from(plValues.entries()),
                            ...Array.from(bsValues.entries()),
                          ]);

                          return (hasCsvData && csvTrialBalanceData
                          ? csvTrialBalanceData.accounts?.map((account: any, idx: number) => {
                              const validDates = csvTrialBalanceData.dates?.filter((d: string) => d && d.trim() !== '') || [];
                              const latestDate = validDates[validDates.length - 1];
                              let latestValue = 0;
                              if (account.values) {
                                if (latestDate && account.values[latestDate] !== undefined) {
                                  latestValue = account.values[latestDate];
                                } else {
                                  const valueKeys = Object.keys(account.values).filter(k => k && k.trim() !== '');
                                  if (valueKeys.length > 0) {
                                    const lastKey = valueKeys[valueKeys.length - 1];
                                    latestValue = account.values[lastKey] || 0;
                                  }
                                }
                              }
                              return (
                                <tr key={`csv-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '11px' }}>{account.acctType}</td>
                                  <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>{account.acctId}</td>
                                  <td style={{ padding: '6px 8px', color: '#1e293b', fontSize: '11px' }}>{account.description}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: latestValue >= 0 ? '#10b981' : '#ef4444', fontWeight: '600', fontSize: '11px', fontFamily: 'monospace' }}>
                                    ${Math.abs(latestValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {latestValue < 0 && ' (CR)'}
                                  </td>
                                </tr>
                              );
                            })
                          : aiMappings.map((mapping: any, idx: number) => {
                              const byId = mapping.qbAccountId ? mergedValues.get(`id:${String(mapping.qbAccountId).trim()}`) : undefined;
                              const byCode = mapping.qbAccountCode ? mergedValues.get(`id:${String(mapping.qbAccountCode).trim()}`) : undefined;
                              const byName = mapping.qbAccount ? mergedValues.get(`name:${String(mapping.qbAccount).toLowerCase().trim()}`) : undefined;
                              const latestValue =
                                byId !== undefined ? byId :
                                byCode !== undefined ? byCode :
                                byName !== undefined ? byName :
                                null;
                              return (
                              <tr key={`api-${mapping.qbAccountId || mapping.qbAccount || idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '11px' }}>{mapping.qbAccountClassification || mapping.sourceStatus || 'N/A'}</td>
                                <td style={{ padding: '6px 8px', color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>{mapping.qbAccountCode || mapping.qbAccountId || 'N/A'}</td>
                                <td style={{ padding: '6px 8px', color: '#1e293b', fontSize: '11px' }}>{mapping.qbAccount || 'Unnamed account'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: latestValue == null ? '#64748b' : latestValue >= 0 ? '#10b981' : '#ef4444', fontWeight: '600', fontSize: '11px', fontFamily: 'monospace' }}>
                                  {latestValue == null
                                    ? 'N/A'
                                    : `$${Math.abs(latestValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${latestValue < 0 ? ' (CR)' : ''}`}
                                </td>
                              </tr>
                            );
                          })
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '12px', padding: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                    {hasCsvData && csvTrialBalanceData ? (
                      <p style={{ fontSize: '12px', color: '#0369a1', margin: 0, fontWeight: '500' }}>
                        ℹ️ Showing amounts for most recent period: {csvTrialBalanceData.dates?.[csvTrialBalanceData.dates.length - 1] || 'N/A'}
                      </p>
                    ) : (
                      <p style={{ fontSize: '12px', color: '#0369a1', margin: 0, fontWeight: '500' }}>
                        ℹ️ Showing mapped accounts from {mappedApiSourceLabel}. Latest-value amounts are shown using the latest imported API month when available.
                      </p>
                    )}
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>
                      Total accounts: {hasCsvData && csvTrialBalanceData ? (csvTrialBalanceData.accounts?.length || 0) : aiMappings.length} |
                      Scroll to see all accounts | Use this to verify account mappings and amounts
                    </p>
                  </div>
                </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Company Details Modal */}
      <CompanyDetailsModal
        show={showCompanyDetailsModal}
        onClose={() => setShowCompanyDetailsModal(false)}
        companyAddressStreet={companyAddressStreet}
        setCompanyAddressStreet={setCompanyAddressStreet}
        companyAddressCity={companyAddressCity}
        setCompanyAddressCity={setCompanyAddressCity}
        companyAddressState={companyAddressState}
        setCompanyAddressState={setCompanyAddressState}
        companyAddressZip={companyAddressZip}
        setCompanyAddressZip={setCompanyAddressZip}
        companyAddressCountry={companyAddressCountry}
        setCompanyAddressCountry={setCompanyAddressCountry}
        companyIndustrySector={companyIndustrySector}
        setCompanyIndustrySector={setCompanyIndustrySector}
        accountingSystem={accountingSystem}
        setAccountingSystem={setAccountingSystem}
        companySizeCategory={companySizeCategory}
        setCompanySizeCategory={setCompanySizeCategory}
        industrySectorCategory={industrySectorCategory}
        setIndustrySectorCategory={setIndustrySectorCategory}
        onSave={saveCompanyDetails}
      />

      {/* Consultant: Add Company Modal */}
      <AddCompanyModal
        show={showAddCompanyModal}
        onClose={() => setShowAddCompanyModal(false)}
        companyName={newCompanyName}
        setCompanyName={setNewCompanyName}
        affiliateCode={selectedAffiliateCodeForNewCompany}
        setAffiliateCode={setSelectedAffiliateCodeForNewCompany}
        onSave={addCompanyFromConsultantModal}
        isLoading={isLoading}
      />

      {/* Content Area - Requires Company Selection */}
      {!selectedCompanyId && currentView !== 'admin' && currentView !== 'consultant-dashboard' && currentView !== 'siteadmin' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '64px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>No Company Selected</h2>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '12px' }}>Please select a company from the Consultant Dashboard to continue.</p>
          {currentUser?.role === 'consultant' && (
            <button onClick={() => setCurrentView('consultant-dashboard')} style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Go to Consultant Dashboard</button>
          )}
        </div>
      )}

      {/* Data Review Tab */}
      {currentView === 'admin' && adminDashboardTab === 'data-review' && selectedCompanyId && (
        <DataReviewTab selectedCompanyId={selectedCompanyId} companyName={companyName} accountMappings={aiMappings} />
      )}

      {/* Trend Analysis View */}
      {currentView === 'trend-analysis' && selectedCompanyId && monthly.length > 0 && (
        <TrendAnalysisView
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          monthly={monthly}
          expenseGoals={expenseGoals}
          selectedExpenseItems={selectedExpenseItems}
          setSelectedExpenseItems={setSelectedExpenseItems}
          selectedItemTrends={selectedTrendItems}
          setSelectedItemTrends={setSelectedTrendItems}
        />
      )}

      {/* Financial Score - Introduction View - DISABLED (commented out) */}
      {/* {currentView === 'fs-intro' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '32px', textAlign: 'center' }}>Introduction to the Corelytics Financial Score</h1>
            ...
          </div>
        </div>
      )} */}

      {/* Financial Score Trends View - DISABLED (commented out) */}
      {/* {currentView === 'fs-score' && selectedCompanyId && trendData.length > 0 && (
        <FinancialScoreView
          monthly={monthly}
          trendData={trendData}
          companyName={companyName}
          finalScore={finalScore}
          profitabilityScore={profitabilityScore}
          assetDevScore={assetDevScore}
          baseRGS={baseRGS}
          adjustedRGS={adjustedRGS}
          growth_24mo={growth_24mo}
          growth_6mo={growth_6mo}
          expenseAdjustment={expenseAdjustment}
          alr1={alr1}
          alrGrowth={alrGrowth}
        />
      )} */}

      {/* Formula Popup Modal */}
      {showFormulaPopup && KPI_FORMULAS[showFormulaPopup] && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0, 0, 0, 0.5)', 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowFormulaPopup(null)}
        >
          <div 
            style={{ 
              background: 'white', 
              borderRadius: '16px', 
              padding: '32px', 
              maxWidth: '600px', 
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{showFormulaPopup}</h2>
              <button
                onClick={() => setShowFormulaPopup(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '0',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Formula</h3>
              <div style={{ 
                background: '#f8fafc', 
                padding: '16px', 
                borderRadius: '8px', 
                fontSize: '18px', 
                fontWeight: '600', 
                color: '#1e293b',
                fontFamily: 'monospace',
                border: '2px solid #e2e8f0'
              }}>
                {KPI_FORMULAS[showFormulaPopup].formula}
              </div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period Used</h3>
              <div style={{ 
                background: '#ede9fe', 
                padding: '12px 16px', 
                borderRadius: '8px', 
                fontSize: '15px', 
                color: '#5b21b6',
                fontWeight: '600',
                border: '1px solid #d8b4fe'
              }}>
                {KPI_FORMULAS[showFormulaPopup].period}
              </div>
            </div>
            
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</h3>
              <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#475569', margin: 0 }}>
                {KPI_FORMULAS[showFormulaPopup].description}
              </p>
            </div>
            
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={() => setShowFormulaPopup(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#4f46e5'}
                onMouseOut={(e) => e.currentTarget.style.background = '#667eea'}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Dashboard View */}
      {currentView === 'dashboard' && selectedCompanyId && (
        <DashboardView
          monthly={monthly}
          trendData={trendData}
          companyName={companyName || ''}
          selectedCompanyId={selectedCompanyId}
          selectedDashboardWidgets={selectedDashboardWidgets}
          setSelectedDashboardWidgets={setSelectedDashboardWidgets}
          showDashboardCustomizer={showDashboardCustomizer}
          setShowDashboardCustomizer={setShowDashboardCustomizer}
          sdeMultiplier={sdeMultiplier}
          ebitdaMultiplier={ebitdaMultiplier}
          dcfDiscountRate={dcfDiscountRate}
          dcfTerminalGrowth={dcfTerminalGrowth}
          growth_24mo={growth_24mo}
          benchmarks={benchmarks}
          expenseGoals={expenseGoals}
          onSaveDashboardPrefs={saveDashboardPreferences}
        />
      )}

      {/* KPI Dashboard View */}
      {currentView === 'kpis' && selectedCompanyId && (
        <RatiosTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
          benchmarks={benchmarks}
          onFormulaClick={(formula) => setShowFormulaPopup(formula)}
          initialTab={kpiDashboardTab}
          prefetchedMonthlyData={monthly as any}
        />
      )}

      {/* MD&A View */}
      {currentView === 'mda' && selectedCompanyId && (
        <MDAView
          monthly={monthly}
          trendData={trendData}
          companyName={companyName || ''}
          finalScore={finalScore}
          profitabilityScore={profitabilityScore}
          growth_24mo={growth_24mo}
          expenseAdjustment={expenseAdjustment}
          revExpSpread={revExpSpread}
          assetDevScore={assetDevScore}
          ltmRev={ltmRev}
          benchmarks={benchmarks}
          expenseGoals={expenseGoals}
          sdeMultiplier={sdeMultiplier}
          ebitdaMultiplier={ebitdaMultiplier}
          dcfDiscountRate={dcfDiscountRate}
          dcfTerminalGrowth={dcfTerminalGrowth}
          bestCaseRevMultiplier={bestCaseRevMultiplier}
          bestCaseExpMultiplier={bestCaseExpMultiplier}
          worstCaseRevMultiplier={worstCaseRevMultiplier}
          worstCaseExpMultiplier={worstCaseExpMultiplier}
          onExportToWord={handleExportMdaToWord}
        />
      )}

      {/* AI Analysis View */}
      {currentView === 'ai-analysis' && selectedCompanyId && (
        <AIAnalysisView
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
          monthly={monthly as any}
        />
      )}

      {/* Projections View */}
      {/* Projections View */}
      {currentView === 'projections' && selectedCompanyId && (
        <ProjectionsTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
        />
      )}

      {/* Financial Forecast View (placeholder to be replaced by dedicated forecast page) */}
      {currentView === 'financial-forecast' && selectedCompanyId && (
        <FinancialForecastTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
          industrySectorCategory={company?.industrySectorCategory || null}
          prefetchedMonthlyData={monthly as any}
        />
      )}

      {/* Goals View */}
      {currentView === 'goals' && selectedCompanyId && monthly.length >= 6 && (
        <GoalsView
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          monthly={monthly}
          expenseGoals={expenseGoals}
          setExpenseGoals={setExpenseGoals}
          masterDataCategories={masterDataCategories}
          setMasterDataCategories={setMasterDataCategories}
        />
      )}

      {currentView === 'profile' && selectedCompanyId && (
        <ProfileTab
          selectedCompanyId={selectedCompanyId}
          currentUser={currentUser}
          company={company}
          companyProfiles={companyProfiles}
          setCompanyProfiles={setCompanyProfiles}
          monthly={monthly}
          trendData={trendData}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          setEditingCompanyId={setEditingCompanyId}
          setCompanyAddressStreet={setCompanyAddressStreet}
          setCompanyAddressCity={setCompanyAddressCity}
          setCompanyAddressState={setCompanyAddressState}
          setCompanyAddressZip={setCompanyAddressZip}
          setCompanyAddressCountry={setCompanyAddressCountry}
          setCompanyIndustrySector={setCompanyIndustrySector}
          setAccountingSystem={setAccountingSystem}
          setCompanySizeCategory={setCompanySizeCategory}
          setIndustrySectorCategory={setIndustrySectorCategory}
          setShowCompanyDetailsModal={setShowCompanyDetailsModal}
        />
      )}

      {/* Working Capital View */}
      {/* Working Capital View */}
      {currentView === 'working-capital' && selectedCompanyId && (
        <WorkingCapitalTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
          prefetchedMonthlyData={monthly as any}
        />
      )}

      {currentView === 'pa-overview' && selectedCompanyId && (
        <PerformanceAnalyticsOverview companyId={selectedCompanyId} />
      )}

      {currentView === 'pa-critical-issues' && selectedCompanyId && (
        <OperationsTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          industrySectorCategory={company?.industrySectorCategory || null}
          viewMode="overview-only"
        />
      )}

      {currentView === 'pa-focus-board' && selectedCompanyId && (
        <FocusBoard companyId={selectedCompanyId} />
      )}

      {currentView === 'pa-trend-explorer' && selectedCompanyId && (
        <TrendExplorer companyId={selectedCompanyId} />
      )}

      {currentView === 'pa-anomaly-inbox' && selectedCompanyId && (
        <AnomalyInbox companyId={selectedCompanyId} />
      )}

      {currentView === 'pa-opportunity-workspace' && selectedCompanyId && (
        <OpportunityWorkspace companyId={selectedCompanyId} />
      )}

      {/* Valuation View */}
      {currentView === 'valuation' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Business Valuation</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                id="valuation-save-settings-btn"
                onClick={async () => {
                  console.log('?? Saving valuation settings for company:', selectedCompanyId);
                  setValuationSaveStatus('saving');
                  try {
                    const last12 = monthly.slice(-12);
                    const sumTtmField = (fieldName: string): number =>
                      last12.reduce((sum, month) => sum + (Number((month as any)?.[fieldName]) || 0), 0);
                    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const sumTtmByKeywords = (
                      keywords: string[],
                      breakdownTypes: Array<'expense' | 'revenue'> = ['expense', 'revenue']
                    ): number => {
                      const normalizedKeywords = keywords.map(normalize);
                      return last12.reduce((sum, month) => {
                        const buckets: Array<Record<string, unknown>> = [];
                        if (breakdownTypes.includes('expense') && (month as any)?.expenseBreakdown && typeof (month as any).expenseBreakdown === 'object') {
                          buckets.push((month as any).expenseBreakdown);
                        }
                        if (breakdownTypes.includes('revenue') && (month as any)?.revenueBreakdown && typeof (month as any).revenueBreakdown === 'object') {
                          buckets.push((month as any).revenueBreakdown);
                        }
                        let monthSum = 0;
                        for (const bucket of buckets) {
                          for (const [key, rawValue] of Object.entries(bucket)) {
                            const normalizedKey = normalize(key);
                            if (normalizedKeywords.some((kw) => normalizedKey.includes(kw))) {
                              monthSum += Number(rawValue) || 0;
                            }
                          }
                        }
                        return sum + monthSum;
                      }, 0);
                    };

                    const ttmRevenue = last12.reduce((sum, m) => sum + (m.revenue || 0), 0);
                    const ttmCOGS = last12.reduce((sum, m) => sum + (m.cogsTotal || 0), 0);
                    const ttmExpense = last12.reduce((sum, m) => sum + (m.expense || 0), 0);
                    const ttmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
                    const ttmInterest = last12.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
                    const ttmStateTaxes = last12.reduce((sum, m) => sum + (m.stateIncomeTaxes || 0), 0);
                    const ttmFederalTaxes = last12.reduce((sum, m) => sum + (m.federalIncomeTaxes || 0), 0);
                    const ttmNetIncome = ttmRevenue - ttmCOGS - ttmExpense;
                    const ttmTaxesAnalysis = ttmStateTaxes + ttmFederalTaxes;
                    const ttmNetIncomeAfterTax = ttmNetIncome - ttmTaxesAnalysis;
                    const ttmDepreciationBreakdown = sumTtmByKeywords(['depreciation'], ['expense']);
                    const ttmAmortizationBreakdown = sumTtmByKeywords(['amortization'], ['expense']);
                    const ttmDepreciationOnly = ttmDepreciationBreakdown > 0 ? ttmDepreciationBreakdown : ttmDepreciation;
                    const ttmAmortizationOnly = ttmAmortizationBreakdown > 0 ? ttmAmortizationBreakdown : 0;
                    const ttmEbitdaAnalysis = ttmNetIncomeAfterTax + ttmInterest + ttmTaxesAnalysis + ttmDepreciationOnly + ttmAmortizationOnly;

                    const ownerSalaryAdj = Math.abs(sumTtmField('ownerBasePay'));
                    const ownersDrawAdj = Math.abs(sumTtmField('ownersDraw'));
                    const effectiveMarketReplacementSalary = Math.abs(sdeManualInputs.marketReplacementSalary ?? 0);
                    const effectiveOwnerCompOther = sdeManualInputs.ownerCompOther ?? 0;
                    const coreSellerAdjustment = ownerSalaryAdj + ownersDrawAdj - effectiveMarketReplacementSalary + effectiveOwnerCompOther;

                    const legalSettlements = sumTtmByKeywords(['legalsettlement', 'settlement'], ['expense']);
                    const majorRepairs = sumTtmByKeywords(['majorrepair', 'majorrepairs'], ['expense']);
                    const consultingExpense = sumTtmByKeywords(['consulting'], ['expense']);
                    const erpInstall = sumTtmByKeywords(['erpinstall', 'erpimplementation'], ['expense']);
                    const relocation = sumTtmByKeywords(['relocation', 'movingexpense'], ['expense']);
                    const covidCosts = sumTtmByKeywords(['covid'], ['expense']);
                    const effectiveLegalSettlements = sdeManualInputs.legalSettlements ?? legalSettlements;
                    const effectiveMajorRepairs = sdeManualInputs.majorRepairs ?? majorRepairs;
                    const effectiveConsulting = sdeManualInputs.consulting ?? consultingExpense;
                    const effectiveErpInstall = sdeManualInputs.erpInstall ?? erpInstall;
                    const effectiveRelocation = sdeManualInputs.relocation ?? relocation;
                    const effectiveNonRecurringOther = sdeManualInputs.nonRecurringOther ?? 0;
                    const nonRecurringExpenseAdj =
                      effectiveLegalSettlements +
                      effectiveMajorRepairs +
                      effectiveConsulting +
                      effectiveErpInstall +
                      effectiveRelocation +
                      effectiveNonRecurringOther;

                    const personalTravel = sumTtmByKeywords(['personaltravel'], ['expense']);
                    const familyPayroll = sumTtmByKeywords(['familypayroll'], ['expense']);
                    const autoLeases = sumTtmByKeywords(['autolease', 'vehiclelease'], ['expense']);
                    const mealsAndEntertainmentAdj = sumTtmField('mealsEntertainment');
                    const clubDues = sumTtmByKeywords(['clubdues'], ['expense']);
                    const effectivePersonalTravel = sdeManualInputs.personalTravel ?? personalTravel;
                    const effectiveFamilyPayroll = sdeManualInputs.familyPayroll ?? familyPayroll;
                    const effectiveAutoLeases = sdeManualInputs.autoLeases ?? autoLeases;
                    const effectiveMealsEntertainment = sdeManualInputs.mealsEntertainment ?? mealsAndEntertainmentAdj;
                    const effectiveClubDues = sdeManualInputs.clubDues ?? clubDues;
                    const effectivePersonalOther = sdeManualInputs.personalOther ?? 0;
                    const personalDiscretionaryAdj =
                      effectivePersonalTravel +
                      effectiveFamilyPayroll +
                      effectiveAutoLeases +
                      effectiveMealsEntertainment +
                      effectiveClubDues +
                      effectivePersonalOther;

                    const assetSales = sumTtmByKeywords(['assetsale', 'gainonsale'], ['revenue']);
                    const insuranceProceeds = sumTtmByKeywords(['insuranceproceed'], ['revenue']);
                    const oneTimeContract = sumTtmByKeywords(['onetimecontract'], ['revenue']);
                    const effectiveAssetSales = sdeManualInputs.assetSales ?? assetSales;
                    const effectiveInsuranceProceeds = sdeManualInputs.insuranceProceeds ?? insuranceProceeds;
                    const effectiveOneTimeContract = sdeManualInputs.oneTimeContract ?? oneTimeContract;
                    const effectiveOneTimeRevenueOther = sdeManualInputs.oneTimeRevenueOther ?? 0;
                    const oneTimeRevenueAdj = effectiveAssetSales + effectiveInsuranceProceeds + effectiveOneTimeContract + effectiveOneTimeRevenueOther;

                    const qoeOwnerSalaryAdjustment = coreSellerAdjustment;
                    const qoePersonalAutoLease = personalDiscretionaryAdj;
                    const qoeOneTimeExpenses = nonRecurringExpenseAdj;
                    const qoeOneTimeRevenue = -oneTimeRevenueAdj;
                    const qoeTotalAdjustments = qoeOwnerSalaryAdjustment + qoePersonalAutoLease + qoeOneTimeExpenses + qoeOneTimeRevenue;
                    const qualityOfEarnings = ttmEbitdaAnalysis + qoeTotalAdjustments;

                    const sdeAnalysisTotals = {
                      ttmNetIncomeAfterTax,
                      ttmInterest,
                      ttmTaxesAnalysis,
                      ttmDepreciationOnly,
                      ttmAmortizationOnly,
                      ttmEbitdaAnalysis,
                      ownerSalaryAdj,
                      ownersDrawAdj,
                      marketReplacementSalary: effectiveMarketReplacementSalary,
                      coreSellerAdjustment,
                      personalDiscretionaryAdj,
                      nonRecurringExpenseAdj,
                      oneTimeRevenueAdj,
                      qoeOwnerSalaryAdjustment,
                      qoePersonalAutoLease,
                      qoeOneTimeExpenses,
                      qoeOneTimeRevenue,
                      qoeTotalAdjustments,
                      qualityOfEarnings,
                    };

                    const response = await fetch('/api/valuation-settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        companyId: selectedCompanyId,
                        sdeMultiplier,
                        ebitdaMultiplier,
                        dcfDiscountRate,
                        dcfTerminalGrowth,
                        sdeManualInputs,
                        sdeAnalysisTotals,
                      })
                    });
                    const result = await response.json();
                    console.log('?? Save response:', result);
                    if (response.ok) {
                      setValuationSaveStatus('saved');
                      setTimeout(() => setValuationSaveStatus('idle'), 3000);
                    } else {
                      console.error('? Failed to save valuation settings:', result);
                      setValuationSaveStatus('error');
                      setTimeout(() => setValuationSaveStatus('idle'), 3000);
                    }
                  } catch (error) {
                    console.error('? Error saving valuation settings:', error);
                    setValuationSaveStatus('error');
                    setTimeout(() => setValuationSaveStatus('idle'), 3000);
                  }
                }}
                disabled={valuationSaveStatus === 'saving'}
                style={{
                  padding: '12px 32px',
                  background: valuationSaveStatus === 'saved' ? '#10b981' : valuationSaveStatus === 'error' ? '#ef4444' : valuationSaveStatus === 'saving' ? '#94a3b8' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: valuationSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease'
                }}
              >
                {valuationSaveStatus === 'saving' ? 'Saving...' : valuationSaveStatus === 'saved' ? 'Saved!' : valuationSaveStatus === 'error' ? 'Error' : 'Save Settings'}
              </button>
            </div>
          </div>
          
          {(() => {
            // Calculate trailing 12 months values
            const last12 = monthly.slice(-12);
            const ttmRevenue = last12.reduce((sum, m) => sum + (m.revenue || 0), 0);
            const ttmCOGS = last12.reduce((sum, m) => sum + (m.cogsTotal || 0), 0);
            const ttmExpense = last12.reduce((sum, m) => sum + (m.expense || 0), 0);
            const ttmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
            const ttmInterest = last12.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
            const ttmStateTaxes = last12.reduce((sum, m) => sum + (m.stateIncomeTaxes || 0), 0);
            const ttmFederalTaxes = last12.reduce((sum, m) => sum + (m.federalIncomeTaxes || 0), 0);
            const ttmTotalIncomeTaxes = ttmStateTaxes + ttmFederalTaxes;
            
            // Calculate Net Income correctly: Revenue - COGS - Operating Expenses
            const ttmGrossProfit = ttmRevenue - ttmCOGS;
            const ttmNetIncome = ttmRevenue - ttmCOGS - ttmExpense;
            const ttmNetIncomeAfterTaxForDcf = ttmNetIncome - ttmTotalIncomeTaxes;
            // Calculate EBITDA: Net Income + Interest + Taxes + Depreciation + Amortization
            const ttmEBITDA = ttmNetIncome + ttmDepreciation + ttmInterest;
            // Note: We don't have a separate tax field, so this is technically EBIT if taxes are in 'expense'
            
            // Calculate valuations
            const ebitdaValuation = ttmEBITDA * ebitdaMultiplier;
            
            // Calculate Free Cash Flow (FCF) for DCF
            // FCF = Net Income + Depreciation - Changes in Working Capital - CapEx
            const currentMonth = monthly[monthly.length - 1];
            const month12Ago = monthly.length >= 13 ? monthly[monthly.length - 13] : monthly[0];
            
            // Working capital change over last 12 months
            const currentWC = ((currentMonth.cash || 0) + (currentMonth.ar || 0) + (currentMonth.inventory || 0)) - ((currentMonth.ap || 0) + (currentMonth.loc || 0) + (currentMonth.otherCL || 0));
            const priorWC = ((month12Ago.cash || 0) + (month12Ago.ar || 0) + (month12Ago.inventory || 0)) - ((month12Ago.ap || 0) + (month12Ago.loc || 0) + (month12Ago.otherCL || 0));
            const changeInWC = currentWC - priorWC;
            
            // Capital expenditures (change in fixed assets + depreciation)
            const changeInFixedAssets = (currentMonth.fixedAssets || 0) - (month12Ago.fixedAssets || 0);
            const ttmCapEx = Math.max(0, changeInFixedAssets + ttmDepreciation);
            
            // Free Cash Flow using ACTUAL depreciation
            const ttmFreeCashFlow = ttmNetIncomeAfterTaxForDcf + ttmDepreciation - changeInWC - ttmCapEx;
            
            // DCF calculation with adjustable parameters using FCF
            const growthRate = growth_24mo / 100;
            const discountRate = dcfDiscountRate / 100;
            const terminalGrowthRate = dcfTerminalGrowth / 100;
            let dcfValue = 0;
            for (let year = 1; year <= 5; year++) {
              const projectedFCF = ttmFreeCashFlow * Math.pow(1 + growthRate, year);
              dcfValue += projectedFCF / Math.pow(1 + discountRate, year);
            }
            const terminalValue = (ttmFreeCashFlow * Math.pow(1 + growthRate, 5) * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
            dcfValue += terminalValue / Math.pow(1 + discountRate, 5);

            const sumTtmField = (fieldName: string): number =>
              last12.reduce((sum, month) => sum + (Number((month as any)?.[fieldName]) || 0), 0);

            const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

            const sumTtmByKeywords = (
              keywords: string[],
              breakdownTypes: Array<'expense' | 'revenue'> = ['expense', 'revenue']
            ): number => {
              const normalizedKeywords = keywords.map(normalize);
              return last12.reduce((sum, month) => {
                const buckets: Array<Record<string, unknown>> = [];
                if (breakdownTypes.includes('expense') && (month as any)?.expenseBreakdown && typeof (month as any).expenseBreakdown === 'object') {
                  buckets.push((month as any).expenseBreakdown);
                }
                if (breakdownTypes.includes('revenue') && (month as any)?.revenueBreakdown && typeof (month as any).revenueBreakdown === 'object') {
                  buckets.push((month as any).revenueBreakdown);
                }

                let monthSum = 0;
                for (const bucket of buckets) {
                  for (const [key, rawValue] of Object.entries(bucket)) {
                    const normalizedKey = normalize(key);
                    if (normalizedKeywords.some((kw) => normalizedKey.includes(kw))) {
                      monthSum += Number(rawValue) || 0;
                    }
                  }
                }
                return sum + monthSum;
              }, 0);
            };

            const formatDollars = (value: number): string => {
              if (!Number.isFinite(value) || Math.abs(value) < 0.5) return '$-';
              const roundedAbs = Math.round(Math.abs(value)).toLocaleString();
              return value < 0 ? `($${roundedAbs})` : `$${roundedAbs}`;
            };

            const formatInputDollars = (value: number): string => {
              const rounded = Math.round(Number(value) || 0);
              const abs = Math.abs(rounded).toLocaleString();
              return rounded < 0 ? `-$${abs}` : `$${abs}`;
            };

            const parseInputDollars = (raw: string): number => {
              const cleaned = raw.replace(/[^0-9-]/g, '');
              if (!cleaned || cleaned === '-') return 0;
              return Math.round(Number(cleaned) || 0);
            };

            // SDE analysis values (TTM from active company's monthly master data)
            const ttmDepreciationBreakdown = sumTtmByKeywords(['depreciation'], ['expense']);
            const ttmAmortizationBreakdown = sumTtmByKeywords(['amortization'], ['expense']);
            const ttmTaxesAnalysis = ttmStateTaxes + ttmFederalTaxes;
            const ttmNetIncomeAfterTax = ttmNetIncome - ttmTaxesAnalysis;
            const ttmDepreciationOnly = ttmDepreciationBreakdown > 0 ? ttmDepreciationBreakdown : ttmDepreciation;
            const ttmAmortizationOnly = ttmAmortizationBreakdown > 0 ? ttmAmortizationBreakdown : 0;
            const ttmEbitdaAnalysis = ttmNetIncomeAfterTax + ttmInterest + ttmTaxesAnalysis + ttmDepreciationOnly + ttmAmortizationOnly;

            const ownerSalaryAdj = Math.abs(sumTtmField('ownerBasePay'));
            const ownersDrawAdj = Math.abs(sumTtmField('ownersDraw'));
            const marketReplacementSalaryAdj = 0;
            const effectiveMarketReplacementSalary =
              Math.abs(sdeManualInputs.marketReplacementSalary ?? marketReplacementSalaryAdj);
            const effectiveOwnerCompOther = sdeManualInputs.ownerCompOther ?? 0;
            const coreSellerAdjustment = ownerSalaryAdj + ownersDrawAdj - effectiveMarketReplacementSalary + effectiveOwnerCompOther;

            const legalSettlements = sumTtmByKeywords(['legalsettlement', 'settlement'], ['expense']);
            const majorRepairs = sumTtmByKeywords(['majorrepair', 'majorrepairs'], ['expense']);
            const consultingExpense = sumTtmByKeywords(['consulting'], ['expense']);
            const erpInstall = sumTtmByKeywords(['erpinstall', 'erpimplementation'], ['expense']);
            const relocation = sumTtmByKeywords(['relocation', 'movingexpense'], ['expense']);
            const covidCosts = sumTtmByKeywords(['covid'], ['expense']);
            const effectiveLegalSettlements = sdeManualInputs.legalSettlements ?? legalSettlements;
            const effectiveMajorRepairs = sdeManualInputs.majorRepairs ?? majorRepairs;
            const effectiveConsulting = sdeManualInputs.consulting ?? consultingExpense;
            const effectiveErpInstall = sdeManualInputs.erpInstall ?? erpInstall;
            const effectiveRelocation = sdeManualInputs.relocation ?? relocation;
            const effectiveNonRecurringOther = sdeManualInputs.nonRecurringOther ?? 0;
            const nonRecurringExpenseAdj =
              effectiveLegalSettlements +
              effectiveMajorRepairs +
              effectiveConsulting +
              effectiveErpInstall +
              effectiveRelocation +
              effectiveNonRecurringOther;

            const personalTravel = sumTtmByKeywords(['personaltravel'], ['expense']);
            const familyPayroll = sumTtmByKeywords(['familypayroll'], ['expense']);
            const autoLeases = sumTtmByKeywords(['autolease', 'vehiclelease'], ['expense']);
            const mealsAndEntertainmentAdj = sumTtmField('mealsEntertainment');
            const clubDues = sumTtmByKeywords(['clubdues'], ['expense']);
            const effectivePersonalTravel = sdeManualInputs.personalTravel ?? personalTravel;
            const effectiveFamilyPayroll = sdeManualInputs.familyPayroll ?? familyPayroll;
            const effectiveAutoLeases = sdeManualInputs.autoLeases ?? autoLeases;
            const effectiveMealsEntertainment = sdeManualInputs.mealsEntertainment ?? mealsAndEntertainmentAdj;
            const effectiveClubDues = sdeManualInputs.clubDues ?? clubDues;
            const effectivePersonalOther = sdeManualInputs.personalOther ?? 0;
            const personalDiscretionaryAdj =
              effectivePersonalTravel +
              effectiveFamilyPayroll +
              effectiveAutoLeases +
              effectiveMealsEntertainment +
              effectiveClubDues +
              effectivePersonalOther;

            const assetSales = sumTtmByKeywords(['assetsale', 'gainonsale'], ['revenue']);
            const insuranceProceeds = sumTtmByKeywords(['insuranceproceed'], ['revenue']);
            const oneTimeContract = sumTtmByKeywords(['onetimecontract'], ['revenue']);
            const effectiveAssetSales = sdeManualInputs.assetSales ?? assetSales;
            const effectiveInsuranceProceeds = sdeManualInputs.insuranceProceeds ?? insuranceProceeds;
            const effectiveOneTimeContract = sdeManualInputs.oneTimeContract ?? oneTimeContract;
            const effectiveOneTimeRevenueOther = sdeManualInputs.oneTimeRevenueOther ?? 0;
            const oneTimeRevenueAdj = effectiveAssetSales + effectiveInsuranceProceeds + effectiveOneTimeContract + effectiveOneTimeRevenueOther;

            const qoeOwnerSalaryAdjustment = coreSellerAdjustment;
            const qoePersonalAutoLease = personalDiscretionaryAdj;
            const qoeOneTimeExpenses = nonRecurringExpenseAdj;
            const qoeOneTimeRevenue = -oneTimeRevenueAdj;
            const qoeTotalAdjustments = qoeOwnerSalaryAdjustment + qoePersonalAutoLease + qoeOneTimeExpenses + qoeOneTimeRevenue;
            const qualityOfEarnings = ttmEbitdaAnalysis + qoeTotalAdjustments;
            const ttmSDE = qualityOfEarnings;
            const sdeValuation = ttmSDE * sdeMultiplier;

            const getYearFromMonthValue = (monthValue: unknown): number | null => {
              if (monthValue instanceof Date && !isNaN(monthValue.getTime())) {
                return monthValue.getFullYear();
              }
              if (typeof monthValue === 'string') {
                const yearMatch = monthValue.match(/\b(20\d{2}|19\d{2})\b/);
                if (yearMatch) return Number(yearMatch[1]);
                const parsed = new Date(monthValue);
                if (!isNaN(parsed.getTime())) return parsed.getFullYear();
              }
              return null;
            };

            const annualRevenueEbitdaData = (() => {
              const byYear = new Map<number, { revenue: number; ebitda: number }>();
              for (const m of monthly) {
                const year = getYearFromMonthValue((m as any)?.month);
                if (!year) continue;
                const revenue = Number((m as any)?.revenue) || 0;
                const cogs = Number((m as any)?.cogsTotal) || 0;
                const expense = Number((m as any)?.expense) || 0;
                const interest = Number((m as any)?.interestExpense) || 0;
                const da = Number((m as any)?.depreciationAmortization) || 0;
                const ebitda = revenue - cogs - expense + interest + da;
                const prev = byYear.get(year) || { revenue: 0, ebitda: 0 };
                byYear.set(year, {
                  revenue: prev.revenue + revenue,
                  ebitda: prev.ebitda + ebitda,
                });
              }
              return Array.from(byYear.entries())
                .map(([year, totals]) => ({
                  year,
                  revenue: totals.revenue,
                  ebitdaMargin: totals.revenue !== 0 ? (totals.ebitda / totals.revenue) * 100 : 0,
                }))
                .sort((a, b) => a.year - b.year)
                .slice(-7);
            })();
            
            return (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                  {[
                    { id: 'sde' as const, label: 'SDE' },
                    { id: 'ebitda' as const, label: 'EBITDA Multiple' },
                    { id: 'dcf' as const, label: 'DCF' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setValuationMethodTab(tab.id)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        background: valuationMethodTab === tab.id ? '#667eea' : '#f1f5f9',
                        color: valuationMethodTab === tab.id ? 'white' : '#334155'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                
                {/* SDE Method */}
                {valuationMethodTab === 'sde' && (
                <>
                <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    Seller's Discretionary Earnings (SDE) Method
                  </h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Trailing 12 Months SDE</div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>${(ttmSDE / 1000).toFixed(0)}K</div>
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                        <strong>Calculation:</strong> Quality of Earnings: EBITDA + QoE Adjustments = ${(ttmEbitdaAnalysis / 1000).toFixed(0)}K + ${(qoeTotalAdjustments / 1000).toFixed(0)}K
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                        Estimated Business Value (SDE)
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
                        ${Math.round(sdeValuation).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                        Range: ${Math.round(ttmSDE * 1.5).toLocaleString()} - ${Math.round(ttmSDE * 4.0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      SDE Multiple: {sdeMultiplier.toFixed(1)}x
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      step="0.1" 
                      value={sdeMultiplier} 
                      onChange={(e) => setSdeMultiplier(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '4px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Typical Range: 1.5x - 4.0x</span>
                      <span>Industry Average: 2.5x</span>
                    </div>
                  </div>
                  
                </div>

                <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      SDE Analysis
                    </h2>
                    <button
                      onClick={() => {
                        const saveButton = document.getElementById('valuation-save-settings-btn') as HTMLButtonElement | null;
                        saveButton?.click();
                      }}
                      disabled={valuationSaveStatus === 'saving'}
                      style={{
                        padding: '8px 16px',
                        background: valuationSaveStatus === 'saved' ? '#10b981' : valuationSaveStatus === 'error' ? '#ef4444' : valuationSaveStatus === 'saving' ? '#94a3b8' : '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: valuationSaveStatus === 'saving' ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      {valuationSaveStatus === 'saving' ? 'Saving...' : valuationSaveStatus === 'saved' ? 'Saved!' : valuationSaveStatus === 'error' ? 'Error' : 'Save SDE Analysis'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>EBITDA, Trailing 12 Months</div>
                      {[
                        ['Net Income', formatDollars(ttmNetIncomeAfterTax)],
                        ['Interest', formatDollars(ttmInterest)],
                        ['Taxes', formatDollars(ttmTaxesAnalysis)],
                        ['Depreciation', formatDollars(ttmDepreciationOnly)],
                        ['Amortization', formatDollars(ttmAmortizationOnly)],
                        ['EBITDA', formatDollars(ttmEbitdaAnalysis)],
                      ].map(([label, value]) => {
                        const isAdjustmentRow = label.toLowerCase().includes('adjustment');
                        const isEbitdaRow = label === 'EBITDA';
                        return (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: (isAdjustmentRow || isEbitdaRow) ? 700 : 400 }}>
                            <span>{label}</span>
                            <span style={{ fontWeight: (isAdjustmentRow || isEbitdaRow) ? 700 : 600 }}>{value}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>1. Owner Compensation Adjustment</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Replace owner pay with market salary.</div>
                      {[
                        ['Owner salary', formatDollars(ownerSalaryAdj), 'readonly'],
                        ['Owners Draw', formatDollars(ownersDrawAdj), 'readonly'],
                        ['Market replacement salary', effectiveMarketReplacementSalary, 'input'],
                        ['Other', effectiveOwnerCompOther, 'ownerCompOther'],
                        ['Adjustment', formatDollars(coreSellerAdjustment), 'readonly-adjustment'],
                      ].map(([label, value, rowType]) => {
                        const isAdjustmentRow = label.toLowerCase().includes('adjustment');
                        if (rowType === 'input') {
                          return (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                              <span>{label}</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatInputDollars(Number(value) || 0)}
                                onChange={(e) => {
                                  const parsed = parseInputDollars(e.target.value);
                                  setSdeManualInputs((prev) => ({ ...prev, marketReplacementSalary: Math.abs(parsed) }));
                                }}
                                style={{
                                  width: '130px',
                                  textAlign: 'right',
                                  padding: '3px 6px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 600
                                }}
                              />
                            </div>
                          );
                        }
                        if (rowType === 'ownerCompOther') {
                          return (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                              <span>{label}</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatInputDollars(Number(value) || 0)}
                                onChange={(e) => {
                                  const parsed = parseInputDollars(e.target.value);
                                  setSdeManualInputs((prev) => ({ ...prev, ownerCompOther: parsed }));
                                }}
                                style={{
                                  width: '130px',
                                  textAlign: 'right',
                                  padding: '3px 6px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 600
                                }}
                              />
                            </div>
                          );
                        }
                        return (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: isAdjustmentRow ? 700 : 400 }}>
                            <span>{label}</span>
                            <span style={{ fontWeight: isAdjustmentRow ? 700 : 600 }}>{value}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>2. Personal / Discretionary Expenses</div>
                      {[
                        ['personal travel', effectivePersonalTravel, 'personalTravel'],
                        ['family payroll', effectiveFamilyPayroll, 'familyPayroll'],
                        ['auto leases', effectiveAutoLeases, 'autoLeases'],
                        ['meals & entertainment', effectiveMealsEntertainment, 'mealsEntertainment'],
                        ['club dues', effectiveClubDues, 'clubDues'],
                        ['Other', effectivePersonalOther, 'personalOther'],
                      ].map(([label, value, key]) => (
                        <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                          <span>{label}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatInputDollars(Number(value) || 0)}
                            onChange={(e) => {
                              const parsed = parseInputDollars(e.target.value);
                              setSdeManualInputs((prev) => ({ ...prev, [String(key)]: parsed }));
                            }}
                            style={{
                              width: '130px',
                              textAlign: 'right',
                              padding: '3px 6px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                        <span>Adjustment</span>
                        <span style={{ fontWeight: 700 }}>{formatDollars(personalDiscretionaryAdj)}</span>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>QoE Adjustments</div>
                      {[
                        ['1. Owner Compensation Adjustment', formatDollars(qoeOwnerSalaryAdjustment)],
                        ['2. Personal / Discretionary Expenses', formatDollars(qoePersonalAutoLease)],
                        ['3. Non-Recurring Expenses', formatDollars(qoeOneTimeExpenses)],
                        ['4. One-Time Revenue', formatDollars(qoeOneTimeRevenue)],
                        ['Total adjustments', formatDollars(qoeTotalAdjustments)],
                      ].map(([label, value]) => {
                        const isAdjustmentRow =
                          label.toLowerCase().includes('adjustment') &&
                          label !== '1. Owner Compensation Adjustment';
                        return (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: isAdjustmentRow ? 700 : 400 }}>
                            <span>{label}</span>
                            <span style={{ fontWeight: isAdjustmentRow ? 700 : 600 }}>{value}</span>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Quality of Earnings</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{formatDollars(qualityOfEarnings)}</span>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>3. Non-Recurring Expenses</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>One-time items.</div>
                      {[
                        ['legal settlements', effectiveLegalSettlements, 'legalSettlements'],
                        ['major repairs', effectiveMajorRepairs, 'majorRepairs'],
                        ['consulting', effectiveConsulting, 'consulting'],
                        ['ERP install', effectiveErpInstall, 'erpInstall'],
                        ['relocation', effectiveRelocation, 'relocation'],
                        ['Other', effectiveNonRecurringOther, 'nonRecurringOther'],
                      ].map(([label, value, key]) => (
                        <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                          <span>{label}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatInputDollars(Number(value) || 0)}
                            onChange={(e) => {
                              const parsed = parseInputDollars(e.target.value);
                              setSdeManualInputs((prev) => ({ ...prev, [String(key)]: parsed }));
                            }}
                            style={{
                              width: '130px',
                              textAlign: 'right',
                              padding: '3px 6px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                        <span>Adjustment</span>
                        <span style={{ fontWeight: 700 }}>{formatDollars(nonRecurringExpenseAdj)}</span>
                      </div>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>4. One-Time Revenue</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Remove revenue that will not repeat.</div>
                      {[
                        ['asset sales', effectiveAssetSales, 'assetSales'],
                        ['insurance proceeds', effectiveInsuranceProceeds, 'insuranceProceeds'],
                        ['one-time contract', effectiveOneTimeContract, 'oneTimeContract'],
                        ['Other', effectiveOneTimeRevenueOther, 'oneTimeRevenueOther'],
                      ].map(([label, value, key]) => (
                        <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                          <span>{label}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatInputDollars(Number(value) || 0)}
                            onChange={(e) => {
                              const parsed = parseInputDollars(e.target.value);
                              setSdeManualInputs((prev) => ({ ...prev, [String(key)]: parsed }));
                            }}
                            style={{
                              width: '130px',
                              textAlign: 'right',
                              padding: '3px 6px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                        <span>Adjustment</span>
                        <span style={{ fontWeight: 700 }}>{formatDollars(oneTimeRevenueAdj)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                        EBITDA Margin and Total Revenue
                      </div>
                      {annualRevenueEbitdaData.length > 0 ? (
                        <svg viewBox="0 0 760 320" style={{ width: '100%', height: 'auto' }}>
                          {(() => {
                            const width = 760;
                            const height = 320;
                            const pad = { top: 28, right: 56, bottom: 42, left: 56 };
                            const chartW = width - pad.left - pad.right;
                            const chartH = height - pad.top - pad.bottom;
                            const maxRevenue = Math.max(...annualRevenueEbitdaData.map(d => d.revenue), 1);
                            const maxMargin = Math.max(...annualRevenueEbitdaData.map(d => d.ebitdaMargin), 1);
                            const xStep = chartW / annualRevenueEbitdaData.length;
                            const barW = Math.min(56, xStep * 0.55);
                            const linePoints = annualRevenueEbitdaData.map((d, idx) => {
                              const x = pad.left + xStep * idx + xStep / 2;
                              const y = pad.top + chartH - (Math.max(0, d.ebitdaMargin) / maxMargin) * chartH;
                              return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                            }).join(' ');

                            return (
                              <>
                                <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />
                                <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />
                                <line x1={width - pad.right} y1={pad.top} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="1" />
                                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                                  const y = pad.top + chartH - chartH * pct;
                                  const leftVal = Math.round((maxRevenue * pct) / 1_000_000);
                                  const rightVal = (maxMargin * pct).toFixed(1);
                                  return (
                                    <g key={pct}>
                                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                                      <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">${leftVal}M</text>
                                      <text x={width - pad.right + 8} y={y + 4} textAnchor="start" fontSize="10" fill="#64748b">{rightVal}%</text>
                                    </g>
                                  );
                                })}
                                {annualRevenueEbitdaData.map((d, idx) => {
                                  const centerX = pad.left + xStep * idx + xStep / 2;
                                  const barH = (d.revenue / maxRevenue) * chartH;
                                  const barY = pad.top + chartH - barH;
                                  const marginY = pad.top + chartH - (Math.max(0, d.ebitdaMargin) / maxMargin) * chartH;
                                  return (
                                    <g key={d.year}>
                                      <rect x={centerX - barW / 2} y={barY} width={barW} height={barH} fill="#1d76c3" rx="3" />
                                      <text x={centerX} y={barY + 16} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">
                                        ${Math.round(d.revenue / 1_000_000)}
                                      </text>
                                      <circle cx={centerX} cy={marginY} r="4" fill="#5fbcd3" stroke="white" strokeWidth="1.5" />
                                      <text x={centerX} y={marginY - 8} textAnchor="middle" fontSize="10" fill="#0f766e" fontWeight="700">
                                        {d.ebitdaMargin.toFixed(1)}%
                                      </text>
                                      <text x={centerX} y={height - pad.bottom + 16} textAnchor="middle" fontSize="10" fill="#475569">
                                        {d.year}
                                      </text>
                                    </g>
                                  );
                                })}
                                <path d={linePoints} fill="none" stroke="#5fbcd3" strokeWidth="2.5" />
                              </>
                            );
                          })()}
                        </svg>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#64748b', padding: '24px 0' }}>
                          Not enough data to render chart.
                        </div>
                      )}
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                        QoE Waterfall Bridge
                      </div>
                      <svg viewBox="0 0 760 320" style={{ width: '100%', height: 'auto' }}>
                        {(() => {
                          const width = 760;
                          const height = 320;
                          const pad = { top: 24, right: 20, bottom: 58, left: 70 };
                          const chartW = width - pad.left - pad.right;
                          const chartH = height - pad.top - pad.bottom;
                          const steps = [
                            { label: 'EBITDA', type: 'base' as const, value: ttmEbitdaAnalysis },
                            { label: 'Compensation adj.', type: 'delta' as const, value: qoeOwnerSalaryAdjustment },
                            { label: 'Personal exp.', type: 'delta' as const, value: qoePersonalAutoLease },
                            { label: 'Non-Recurring', type: 'delta' as const, value: qoeOneTimeExpenses },
                            { label: 'One-time rev', type: 'delta' as const, value: qoeOneTimeRevenue },
                            { label: 'Quality of Earnings', type: 'total' as const, value: qualityOfEarnings },
                          ];

                          let running = 0;
                          const bars = steps.map((step) => {
                            if (step.type === 'base') {
                              running = step.value;
                              return { ...step, start: 0, end: step.value };
                            }
                            if (step.type === 'delta') {
                              const start = running;
                              running = running + step.value;
                              return { ...step, start, end: running };
                            }
                            return { ...step, start: 0, end: step.value };
                          });

                          const extentValues = [0, ...bars.flatMap((b) => [b.start, b.end])];
                          const minY = Math.min(...extentValues);
                          const maxY = Math.max(...extentValues);
                          const range = Math.max(1, maxY - minY);
                          const yOf = (v: number) => pad.top + chartH - ((v - minY) / range) * chartH;
                          const zeroY = yOf(0);

                          const xStep = chartW / bars.length;
                          const barW = Math.min(80, xStep * 0.62);

                          return (
                            <>
                              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                                const val = minY + range * pct;
                                const y = yOf(val);
                                return (
                                  <g key={pct}>
                                    <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                                    <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                                      {`$${Math.round(val / 1000).toLocaleString()}K`}
                                    </text>
                                  </g>
                                );
                              })}
                              <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" />
                              <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />

                              {bars.map((bar, idx) => {
                                const cx = pad.left + xStep * idx + xStep / 2;
                                const yTop = yOf(Math.max(bar.start, bar.end));
                                const yBottom = yOf(Math.min(bar.start, bar.end));
                                const isIncrease = bar.end >= bar.start;
                                const fill =
                                  bar.type === 'base' || bar.type === 'total'
                                    ? '#1d76c3'
                                    : isIncrease
                                      ? '#10b981'
                                      : '#ef4444';
                                const delta = bar.end - bar.start;
                                return (
                                  <g key={bar.label}>
                                    <rect
                                      x={cx - barW / 2}
                                      y={yTop}
                                      width={barW}
                                      height={Math.max(2, yBottom - yTop)}
                                      fill={fill}
                                      rx="3"
                                    />
                                    <text
                                      x={cx}
                                      y={yTop - 6}
                                      textAnchor="middle"
                                      fontSize="10"
                                      fill="#334155"
                                      fontWeight="700"
                                    >
                                      {bar.type === 'delta'
                                        ? `${delta >= 0 ? '+' : '-'}$${Math.round(Math.abs(delta) / 1000).toLocaleString()}K`
                                        : `$${Math.round(bar.end / 1000).toLocaleString()}K`}
                                    </text>
                                    <text x={cx} y={height - pad.bottom + 14} textAnchor="middle" fontSize="9" fill="#475569">
                                      {bar.label}
                                    </text>
                                    {idx < bars.length - 1 && (
                                      <line
                                        x1={cx + barW / 2}
                                        y1={yOf(bar.end)}
                                        x2={pad.left + xStep * (idx + 1) + xStep / 2 - barW / 2}
                                        y2={yOf(bar.end)}
                                        stroke="#94a3b8"
                                        strokeWidth="1.5"
                                        strokeDasharray="4,3"
                                      />
                                    )}
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                </div>
                </>
                )}
                
                {/* EBITDA Method */}
                {valuationMethodTab === 'ebitda' && (
                <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    EBITDA Multiple Method
                  </h2>
                  
                  <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Trailing 12 Months EBITDA</div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>${(ttmEBITDA / 1000).toFixed(0)}K</div>
                    </div>
                    
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      <strong>Calculation:</strong> Net Income + Interest + Depreciation & Amortization
                      <br/>
                      = ${(ttmNetIncome / 1000).toFixed(0)}K + ${(ttmInterest / 1000).toFixed(0)}K + ${(ttmDepreciation / 1000).toFixed(0)}K
                      <br/>
                      <em style={{ fontSize: '12px', color: '#64748b' }}>Note: D&A and Interest are added back to Net Income</em>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      EBITDA Multiple: {ebitdaMultiplier.toFixed(1)}x
                    </label>
                    <input 
                      type="range" 
                      min="2" 
                      max="10" 
                      step="0.1" 
                      value={ebitdaMultiplier} 
                      onChange={(e) => setEbitdaMultiplier(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '4px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Typical Range: 3.0x - 8.0x</span>
                      <span>Industry Average: 5.0x</span>
                    </div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      Estimated Business Value (EBITDA)
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#667eea' }}>
                      ${Math.round(ebitdaValuation).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      Range: ${Math.round(ttmEBITDA * 3.0).toLocaleString()} - ${Math.round(ttmEBITDA * 8.0).toLocaleString()}
                    </div>
                  </div>
                </div>
                )}
                
                {/* DCF Method */}
                {valuationMethodTab === 'dcf' && (
                <div style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    Discounted Cash Flow (DCF) Method
                  </h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Historical Growth Rate</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{growth_24mo.toFixed(1)}%</div>
                          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Used for 5-year projection</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Discount Rate</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{dcfDiscountRate.toFixed(1)}%</div>
                          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Risk-adjusted rate</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Terminal Growth</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{dcfTerminalGrowth.toFixed(1)}%</div>
                          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>Perpetuity growth</div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6', marginBottom: '16px' }}>
                        5-year free cash flow projection based on historical growth rate, discounted to present value. Includes terminal value calculation for perpetuity beyond forecast period.
                      </div>
                    </div>
                    
                    {/* Free Cash Flow Calculation */}
                    <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '12px', border: '1px solid #fcd34d' }}>
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '4px', fontWeight: '600' }}>Trailing 12 Months Free Cash Flow</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>${Math.round(ttmFreeCashFlow).toLocaleString()}</div>
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.8' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>TTM Revenue</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmRevenue).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>- COGS</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmCOGS).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>- Operating Expenses</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmExpense).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>- Income Taxes</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmTotalIncomeTaxes).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '6px', borderBottom: '1px solid #fcd34d' }}>
                        <span style={{ fontWeight: '600' }}>= Net Income</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmNetIncomeAfterTaxForDcf).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>+ Depreciation/Amortization</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmDepreciation).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>- Change in Working Capital</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(changeInWC).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid #fcd34d' }}>
                        <span>- Capital Expenditures</span>
                        <span style={{ fontWeight: '600' }}>${Math.round(ttmCapEx).toLocaleString()}</span>
                      </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                          <span style={{ fontWeight: '700' }}>= Free Cash Flow</span>
                          <span style={{ fontWeight: '700', color: '#f59e0b' }}>${Math.round(ttmFreeCashFlow).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Adjustable Parameters */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Discount Rate (WACC): {dcfDiscountRate.toFixed(1)}%
                    </label>
                    <input 
                      type="range" 
                      min="5" 
                      max="20" 
                      step="0.5" 
                      value={dcfDiscountRate} 
                      onChange={(e) => setDcfDiscountRate(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '8px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Lower Risk: 5-8%</span>
                      <span>Typical: 10-12%</span>
                      <span>Higher Risk: 15-20%</span>
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                      Terminal Growth Rate: {dcfTerminalGrowth.toFixed(1)}%
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max="5" 
                      step="0.5" 
                      value={dcfTerminalGrowth} 
                      onChange={(e) => setDcfTerminalGrowth(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '4px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Conservative: 0-2%</span>
                      <span>Typical: 2-3%</span>
                      <span>Optimistic: 3-5%</span>
                    </div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      Estimated Business Value (DCF)
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                      ${Math.round(dcfValue).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      <strong>Note:</strong> DCF based on Free Cash Flow (FCF) projections. Valuations are highly sensitive to assumptions about growth rates, discount rates, working capital, and capital expenditures.
                    </div>
                  </div>
                </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Cash Flow View */}
      {currentView === 'cash-flow' && selectedCompanyId && (
        <CashFlowTab
          selectedCompanyId={selectedCompanyId}
          companyName={companyName || ''}
          initialDisplay={cashFlowDisplay}
          prefetchedMonthlyData={monthly as any}
        />
      )}

      {/* QB-SPECIFIC SECTION REMOVED - Now using unified monthly array approach */}

      {/* Financial Statements View - P&L and Balance Sheet ONLY - DISABLED */}
      {false && currentView === 'financial-statements' && selectedCompanyId && qbRawData && (() => {
        // CRITICAL SECURITY CHECK: Ensure qbRawData matches the selected company
        if (!qbRawData._companyId || qbRawData._companyId !== selectedCompanyId) {
          console.error(`?? SECURITY BLOCK: Data mismatch! Selected: ${selectedCompanyId}, Data companyId: ${qbRawData._companyId || 'MISSING'}`);
          return <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '12px' }}>Loading company data...</div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>Please wait while we fetch the correct financial data.</div>
          </div>;
        }
        
        const currentCompany = Array.isArray(companies) ? companies.find(c => c.id === selectedCompanyId) : undefined;
        const currentCompanyName = currentCompany?.name || 'Unknown';
        console.log(`?? ========================================`);
        console.log(`?? FINANCIAL STATEMENTS RENDERING (Refresh Key: ${dataRefreshKey})`);
        console.log(`?? Selected Company: "${currentCompanyName}" (ID: ${selectedCompanyId})`);
        console.log(`?? QB Data sync date:`, qbRawData.syncDate);
        console.log(`?? Data belongs to company:`, qbRawData._companyId);
        console.log(`?? Record ID:`, qbRawData._recordId);
        console.log(`?? ========================================`);

        // Helper function to recursively extract all rows from QB report
        const extractRows = (data: any, level: number = 0, parentSection: string = ''): any[] => {
          const result: any[] = [];
          if (!data?.Rows?.Row) return result;
          const rows = Array.isArray(data.Rows.Row) ? data.Rows.Row : [data.Rows.Row];
          
          for (const row of rows) {
            if (row.type === 'Section') {
              const headerName = row.Header?.ColData?.[0]?.value || '';
              result.push({
                type: 'header',
                name: headerName,
                level,
                isHeader: true,
                section: headerName
              });
              if (row.Rows?.Row) {
                const childRows = Array.isArray(row.Rows.Row) ? row.Rows.Row : [row.Rows.Row];
                result.push(...extractRows({ Rows: { Row: childRows } }, level + 1, headerName));
              }
              if (row.Summary?.ColData) {
                const summaryName = row.Summary.ColData[0]?.value || `Total ${headerName}`;
                const value = row.Summary.ColData[row.Summary.ColData.length - 1]?.value;
                let calculatedTotal = 0;
                const dataRows = result.filter(r => r.section === headerName && r.type === 'data');
                if (dataRows.length > 0) {
                  calculatedTotal = dataRows.reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0);
                } else {
                  calculatedTotal = parseFloat(value) || 0;
                }
                if (summaryName && !isNaN(calculatedTotal)) {
                  result.push({
                    type: 'total',
                    name: summaryName,
                    value: calculatedTotal,
                    level,
                    isTotal: true
                  });
                }
              }
            } else if (row.type === 'Data' && row.ColData) {
              const name = row.ColData[0]?.value || '';
              let value = '0';
              for (let i = row.ColData.length - 1; i >= 1; i--) {
                const colValue = row.ColData[i]?.value;
                if (colValue !== undefined && colValue !== '' && !isNaN(parseFloat(colValue))) {
                  value = colValue;
                  break;
                }
              }
              result.push({
                type: 'data',
                name,
                value: parseFloat(value) || 0,
                level,
                section: parentSection,
                colData: row.ColData
              });
            }
          }
          return result;
        };

        const plRows = qbRawData.profitAndLoss?.Rows?.Row ? extractRows(qbRawData.profitAndLoss) : [];
        const bsRows = qbRawData.balanceSheet?.Rows?.Row ? extractRows(qbRawData.balanceSheet) : [];
        
        return (
          <div key={`financial-statements-${selectedCompanyId}-${dataRefreshKey}`} style={{ maxWidth: '1800px', margin: '0 auto', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Statements</h1>
              {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
            </div>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
              QuickBooks Data - Synced: {qbRawData.syncDate ? new Date(qbRawData.syncDate).toLocaleString() : 'Unknown'}
            </p>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
              <button
                onClick={() => setFinancialStatementsTab('aggregated')}
                style={{
                  padding: '12px 24px',
                  background: financialStatementsTab === 'aggregated' ? '#667eea' : 'transparent',
                  color: financialStatementsTab === 'aggregated' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: financialStatementsTab === 'aggregated' ? '3px solid #667eea' : '3px solid transparent',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s'
                }}
              >
                Aggregated Financials
              </button>
              <button
                onClick={() => setFinancialStatementsTab('line-of-business')}
                style={{
                  padding: '12px 24px',
                  background: financialStatementsTab === 'line-of-business' ? '#667eea' : 'transparent',
                  color: financialStatementsTab === 'line-of-business' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: financialStatementsTab === 'line-of-business' ? '3px solid #667eea' : '3px solid transparent',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s'
                }}
              >
                Line of Business Reporting
              </button>
            </div>

            {/* Aggregated Financials Tab */}
            {financialStatementsTab === 'aggregated' && (
            <>
            {/* Statement Controls */}
            <div style={{ marginBottom: '32px', padding: '24px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                {/* Type of Statement */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    Type of Statement
                  </label>
                  <select 
                    value={statementType}
                    onChange={(e) => setStatementType(e.target.value as 'income-statement' | 'balance-sheet')}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      fontSize: '14px',
                      color: '#1e293b',
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="income-statement">Income Statement</option>
                    <option value="balance-sheet">Balance Sheet</option>
                  </select>
                </div>

                {/* Period */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    Period
                  </label>
                  <select 
                    value={statementPeriod}
                    onChange={(e) => setStatementPeriod(e.target.value as any)}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      fontSize: '14px',
                      color: '#1e293b',
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="current-month">Current Month</option>
                    <option value="current-quarter">Current Quarter</option>
                    <option value="last-12-months">Last 12 months</option>
                    <option value="ytd">YTD</option>
                    <option value="last-year">Last Year</option>
                    <option value="last-3-years">Last 3 Years</option>
                  </select>
                </div>

                {/* Display As */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    Display As
                  </label>
                  <select 
                    value={statementDisplay}
                    onChange={(e) => setStatementDisplay(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #cbd5e1', 
                      borderRadius: '6px', 
                      fontSize: '14px',
                      color: '#1e293b',
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Statement Content Area */}
            <AggregatedFinancialsTab
              selectedCompanyId={selectedCompanyId}
              statementType={statementType}
              statementPeriod={statementPeriod}
              statementDisplay={statementDisplay}
            />
            </>
          )}

          {/* Line of Business Reporting Tab */}
          {financialStatementsTab === 'line-of-business' && (
            <LOBReportingTab
              company={company}
              selectedCompanyId={selectedCompanyId}
              accountMappings={aiMappings}
              statementType={statementType}
              selectedLineOfBusiness={selectedLineOfBusiness}
              statementPeriod={statementPeriod}
              statementDisplay={statementDisplay}
              onStatementTypeChange={setStatementType}
              onLineOfBusinessChange={setSelectedLineOfBusiness}
              onPeriodChange={setStatementPeriod}
              onDisplayChange={setStatementDisplay}
              onNavigateToAccountMappings={() => {
                setCurrentView('admin');
                setAdminDashboardTab('data-mapping');
              }}
            />
          )}

            {/* Line of Business Reporting Tab */}
            {financialStatementsTab === 'line-of-business' && (
              <LOBReportingTab
                company={company}
                selectedCompanyId={selectedCompanyId}
                accountMappings={aiMappings}
                statementType={statementType}
                selectedLineOfBusiness={selectedLineOfBusiness}
                statementPeriod={statementPeriod}
                statementDisplay={statementDisplay}
                onStatementTypeChange={setStatementType}
                onLineOfBusinessChange={setSelectedLineOfBusiness}
                onPeriodChange={setStatementPeriod}
                onDisplayChange={setStatementDisplay}
              />
            )}
          </div>
        );
      })()}

      {/* Financial Statements View - Works with CSV or QB data via monthly array */}
      {currentView === 'financial-statements' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '32px' }}>
          <style>{`
            @media print {
              @page {
                margin: 0.2in 0.3in;
              }
              
              /* Hide all navigation and controls */
              .no-print,
              header,
              nav,
              aside,
              button,
              [role="navigation"] {
                display: none !important;
              }
              
              /* Remove all visual styling that takes space */
              * {
                box-shadow: none !important;
                border-radius: 0 !important;
              }
              
              /* Aggressively compress spacing */
              body, html {
                margin: 0 !important;
                padding: 0 !important;
              }
              
              /* Reduce all padding and margins */
              div {
                padding-top: 2px !important;
                padding-bottom: 2px !important;
                margin-top: 2px !important;
                margin-bottom: 2px !important;
              }
              
              /* Compress header section */
              div[style*="marginBottom: '32px'"] {
                margin-bottom: 4px !important;
                padding-bottom: 4px !important;
              }
              
              /* Compress blue/colored boxes (Gross Profit, Operating Income, etc) */
              div[style*="background: '#dbeafe'"],
              div[style*="background: '#dcfce7'"],
              div[style*="background: '#fef3c7'"] {
                padding: 4px 8px !important;
                margin: 2px 0 !important;
              }
              
              /* Reduce font sizes across the board */
              h2 {
                font-size: 14px !important;
                margin: 0 0 2px 0 !important;
                padding: 0 !important;
              }
              
              div[style*="fontSize: '24px'"] {
                font-size: 14px !important;
              }
              
              div[style*="fontSize: '14px'"],
              span[style*="fontSize: '14px'"] {
                font-size: 10px !important;
              }
              
              div[style*="fontSize: '13px'"],
              span[style*="fontSize: '13px'"] {
                font-size: 9px !important;
              }
              
              /* Reduce line item spacing */
              div[style*="padding: '6px 0 6px 20px'"],
              div[style*="padding: '8px 0'"] {
                padding: 2px 0 2px 12px !important;
                line-height: 1.1 !important;
              }
              
              /* Remove extra spacing from sections */
              div[style*="marginBottom: '12px'"] {
                margin-bottom: 2px !important;
              }
              
              /* Compress section headers */
              div[style*="marginBottom: '8px'"] {
                margin-bottom: 2px !important;
              }
              
              /* Keep sections together */
              div[style*="Cost of Goods Sold"],
              div[style*="Operating Expenses"],
              div[style*="Other Income"] {
                page-break-inside: avoid !important;
              }
            }
          `}</style>
          
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Statements</h1>
            {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          </div>
          <p className="no-print" style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
            Based on imported financial data
          </p>

          {/* Tab Navigation */}
          <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
            <button
              onClick={() => setFinancialStatementsTab('aggregated')}
              style={{
                padding: '12px 24px',
                background: financialStatementsTab === 'aggregated' ? '#667eea' : 'transparent',
                color: financialStatementsTab === 'aggregated' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: financialStatementsTab === 'aggregated' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Aggregated Financials
            </button>
            <button
              onClick={() => setFinancialStatementsTab('line-of-business')}
              style={{
                padding: '12px 24px',
                background: financialStatementsTab === 'line-of-business' ? '#667eea' : 'transparent',
                color: financialStatementsTab === 'line-of-business' ? 'white' : '#64748b',
                border: 'none',
                borderBottom: financialStatementsTab === 'line-of-business' ? '3px solid #667eea' : '3px solid transparent',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              Line of Business Reporting
            </button>
          </div>

          {/* Aggregated Financials Tab */}
          {financialStatementsTab === 'aggregated' && (
          <>
          {/* Statement Controls */}
          <div className="no-print" style={{ marginBottom: '32px', padding: '24px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
              {/* Type of Statement */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                  Type of Statement
                </label>
                <select 
                  value={statementType}
                  onChange={(e) => setStatementType(e.target.value as any)}
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '6px', 
                    fontSize: '14px',
                    color: '#1e293b',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="income-statement">Income Statement</option>
                  <option value="income-statement-percent">Income Stmt as % of Revenue</option>
                  <option value="balance-sheet">Balance Sheet</option>
                </select>
              </div>

              {/* Period */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                  Period
                </label>
                <select 
                  value={statementPeriod}
                  onChange={(e) => setStatementPeriod(e.target.value as any)}
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '6px', 
                    fontSize: '14px',
                    color: '#1e293b',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="current-month">Current Month</option>
                  <option value="current-quarter">Current Quarter</option>
                  <option value="last-12-months">Last 12 months</option>
                  <option value="ytd">YTD</option>
                  <option value="last-year">Last Year</option>
                  <option value="last-3-years">Last 3 Years</option>
                </select>
              </div>

              {/* Display As */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                  Display As
                </label>
                <select 
                  value={statementDisplay}
                  onChange={(e) => setStatementDisplay(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                  style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '6px', 
                    fontSize: '14px',
                    color: '#1e293b',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              
              {/* Print Button */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <select
                  className="no-print"
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value as 'portrait' | 'landscape')}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e293b',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
                <button
                  onClick={() => window.print()}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  🖨️ Print
                </button>
              </div>
            </div>
          </div>

          {/* Statement Content Area */}
          {(() => {
            console.log('?? Financial Statement Render Check (CSV/Monthly Data):', {
              statementType,
              statementPeriod,
              monthlyLength: monthly?.length || 0,
              monthlyFirst: monthly?.[0],
              condition: statementType === 'income-statement' && statementPeriod === 'current-month'
            });

            const buildIncomeStatementDetails = (monthsInput: any[]) => {
              const months = Array.isArray(monthsInput) ? monthsInput : [];
              const revenue = months.reduce((sum, m) => sum + (Number(m?.revenue) || 0), 0);

              const revenueDetails: Record<string, number> = {};
              const cogsDetails: Record<string, number> = {
                cogsPayroll: months.reduce((sum, m) => sum + (Number(m?.cogsPayroll) || 0), 0),
                cogsOwnerPay: months.reduce((sum, m) => sum + (Number(m?.cogsOwnerPay) || 0), 0),
                cogsContractors: months.reduce((sum, m) => sum + (Number(m?.cogsContractors) || 0), 0),
                cogsMaterials: months.reduce((sum, m) => sum + (Number(m?.cogsMaterials) || 0), 0),
                cogsCommissions: months.reduce((sum, m) => sum + (Number(m?.cogsCommissions) || 0), 0),
                cogsOther: months.reduce((sum, m) => sum + (Number(m?.cogsOther) || 0), 0),
              };

              months.forEach((m) => {
                const monthObj = m || {};
                const keys = Object.keys(monthObj);
                const hasFlatRevenue = keys.some((key) => key.startsWith('rev_'));
                const hasFlatSectorCogs = keys.some((key) => key.startsWith('cogs_') && key !== 'cogs_total');
                const hasLegacyCogs = ['cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials', 'cogsCommissions', 'cogsOther']
                  .some((key) => (Number(monthObj[key]) || 0) !== 0);

                keys.forEach((key) => {
                  if (key.startsWith('rev_')) {
                    revenueDetails[key] = (Number(revenueDetails[key]) || 0) + (Number(monthObj[key]) || 0);
                  }
                  if (key.startsWith('cogs_') && key !== 'cogs_total') {
                    cogsDetails[key] = (Number(cogsDetails[key]) || 0) + (Number(monthObj[key]) || 0);
                  }
                });

                if (!hasFlatRevenue && monthObj.revenueBreakdown && typeof monthObj.revenueBreakdown === 'object') {
                  Object.entries(monthObj.revenueBreakdown).forEach(([key, value]) => {
                    revenueDetails[key] = (Number(revenueDetails[key]) || 0) + (Number(value) || 0);
                  });
                }
                if (!hasFlatSectorCogs && !hasLegacyCogs && monthObj.cogsBreakdown && typeof monthObj.cogsBreakdown === 'object') {
                  Object.entries(monthObj.cogsBreakdown).forEach(([key, value]) => {
                    cogsDetails[key] = (Number(cogsDetails[key]) || 0) + (Number(value) || 0);
                  });
                }
              });

              const cogsFromTotal = months.reduce((sum, m) => sum + (Number(m?.cogsTotal) || 0), 0);
              const cogsFromDetails = Object.values(cogsDetails).reduce((sum, value) => sum + (Number(value) || 0), 0);
              const cogs = cogsFromTotal !== 0 ? cogsFromTotal : cogsFromDetails;

              const revenueDetailFields = Object.keys(revenueDetails).filter((field) => (Number(revenueDetails[field]) || 0) !== 0);
              const cogsDetailFields = Object.keys(cogsDetails).filter((field) => (Number(cogsDetails[field]) || 0) !== 0);

              return { revenue, cogs, revenueDetails, cogsDetails, revenueDetailFields, cogsDetailFields };
            };
            const operatingExpenseFieldDefinitions = [
              { key: 'payroll', label: 'Payroll' },
              { key: 'ownerBasePay', label: "Owner's Base Pay" },
              { key: 'ownersRetirement', label: "Owner's Retirement" },
              { key: 'benefits', label: 'Benefits' },
              { key: 'insurance', label: 'Insurance' },
              { key: 'professionalFees', label: 'Professional Services' },
              { key: 'subcontractors', label: 'Subcontractors' },
              { key: 'rent', label: 'Rent/Lease' },
              { key: 'taxLicense', label: 'Tax & License' },
              { key: 'phoneComm', label: 'Phone & Communication' },
              { key: 'infrastructure', label: 'Infrastructure/Utilities' },
              { key: 'autoTravel', label: 'Auto & Travel' },
              { key: 'salesExpense', label: 'Sales & Marketing' },
              { key: 'marketing', label: 'Marketing' },
              { key: 'trainingCert', label: 'Training & Certification' },
              { key: 'mealsEntertainment', label: 'Meals & Entertainment' },
              { key: 'depreciationAmortization', label: 'Depreciation & Amortization' },
              { key: 'otherExpense', label: 'Other Expenses' },
            ] as const;
            
            if (statementType === 'income-statement' && statementPeriod === 'current-month') {
              // Sort by date to ensure we get the most recent month (in case data isn't sorted)
              const sortedMonthly = [...monthly].sort((a, b) => {
                const dateA = new Date(a.date || a.month || 0).getTime();
                const dateB = new Date(b.date || b.month || 0).getTime();
                return dateA - dateB;
              });
              const currentMonth = sortedMonthly[sortedMonthly.length - 1];
              const monthDate = new Date(currentMonth.date || currentMonth.month);
              const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

              const {
                revenue,
                cogs,
                revenueDetails,
                cogsDetails,
                revenueDetailFields,
                cogsDetailFields,
              } = buildIncomeStatementDetails([currentMonth]);

              const grossProfit = revenue - cogs;
              const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

              // Operating Expenses - All fields that have data from DataReviewTab
              const payroll = currentMonth.payroll || 0;
              const benefits = currentMonth.benefits || 0;
              const insurance = currentMonth.insurance || 0;
              const professionalFees = currentMonth.professionalFees || 0;
              const subcontractors = currentMonth.subcontractors || 0;
              const rent = currentMonth.rent || 0;
              const taxLicense = currentMonth.taxLicense || 0;
              const phoneComm = currentMonth.phoneComm || 0;
              const infrastructure = currentMonth.infrastructure || 0;
              const autoTravel = currentMonth.autoTravel || 0;
              const salesExpense = currentMonth.salesExpense || 0;
              const marketing = currentMonth.marketing || 0;
              const mealsEntertainment = currentMonth.mealsEntertainment || 0;
              const otherExpense = currentMonth.otherExpense || 0;

              // Calculate total operating expenses including all expense fields from DataReviewTab
              const totalOpex = payroll + benefits + insurance + professionalFees + subcontractors +
                               rent + taxLicense + phoneComm + infrastructure + autoTravel +
                               salesExpense + marketing + mealsEntertainment + otherExpense;

              const operatingIncome = grossProfit - totalOpex;
              const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
              
              // Other Income/Expense
              const interestExpense = currentMonth.interestExpense || 0;
              const nonOperatingIncome = currentMonth.nonOperatingIncome || 0;
              const extraordinaryItems = currentMonth.extraordinaryItems || 0;
              
              const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
              // Parse as numbers in case they come as strings
              const stateIncomeTaxes = Number(currentMonth.stateIncomeTaxes) || 0;
              const federalIncomeTaxes = Number(currentMonth.federalIncomeTaxes) || 0;
              const netIncome = incomeBeforeTax - stateIncomeTaxes - federalIncomeTaxes;
              const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
              
              return (
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                  <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement</h2>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>For the Month Ended {monthName}</div>
                  </div>

                  {/* Revenue Section */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>Revenue</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                    {revenueDetailFields.map((field) => (
                      <div key={field} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569' }}>${(Number(revenueDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>

                  {/* COGS Section */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Cost of Goods Sold</div>
                    {cogsDetailFields.map((field) => (
                      <div key={field} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569' }}>${(Number(cogsDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>Total COGS</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>${cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', color: '#1e40af' }}>Gross Profit</span>
                      <span style={{ fontWeight: '700', color: '#1e40af' }}>${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
                      {grossMargin.toFixed(1)}% margin
                    </div>
                  </div>

                  {/* Operating Expenses - Dynamic Rendering from monthly data */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Operating Expenses</div>
                    {(() => {
                      // Define all possible expense fields with their display names
                      const expenseFields = [
                        // Operating Expenses - Complete list in correct order
                        { key: 'payroll', label: 'Payroll' },
                        { key: 'benefits', label: 'Benefits' },
                        { key: 'insurance', label: 'Insurance' },
                        { key: 'professionalFees', label: 'Professional Services' },
                        { key: 'subcontractors', label: 'Subcontractors' },
                        { key: 'rent', label: 'Rent/Lease' },
                        { key: 'taxLicense', label: 'Tax & License' },
                        { key: 'phoneComm', label: 'Phone & Communication' },
                        { key: 'infrastructure', label: 'Infrastructure/Utilities' },
                        { key: 'autoTravel', label: 'Auto & Travel' },
                        { key: 'salesExpense', label: 'Sales & Marketing' },
                        { key: 'marketing', label: 'Marketing' },
                        { key: 'mealsEntertainment', label: 'Meals & Entertainment' },
                        { key: 'otherExpense', label: 'Other Expenses' }
                      ];

                      // Calculate total operating expenses dynamically
                      const totalOpex = expenseFields.reduce((sum, field) => {
                        return sum + (currentMonth[field.key as keyof typeof currentMonth] || 0);
                      }, 0);

                      return (
                        <>
                          {expenseFields.map(field => {
                            const value = currentMonth[field.key as keyof typeof currentMonth] || 0;
                            if (value > 0) {
                              return (
                                <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                                  <span style={{ color: '#475569' }}>{field.label}</span>
                                  <span style={{ color: '#475569' }}>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                </div>
                              );
                            }
                            return null;
                          })}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                            <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</span>
                            <span style={{ fontWeight: '600', color: '#1e293b' }}>${totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Operating Income */}
                  <div style={{ marginBottom: '12px', background: '#f0fdf4', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', color: '#166534' }}>Operating Income</span>
                      <span style={{ fontWeight: '700', color: '#166534' }}>${operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#166534', textAlign: 'right' }}>
                      {operatingMargin.toFixed(1)}% margin
                    </div>
                  </div>

                  {/* Other Income/Expense */}
                  {(interestExpense > 0 || nonOperatingIncome > 0 || extraordinaryItems !== 0) && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Other Income/(Expense)</div>
                      {nonOperatingIncome > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Non-Operating Income</span>
                          <span style={{ color: '#10b981' }}>${nonOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {interestExpense > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Interest Expense</span>
                          <span style={{ color: '#ef4444' }}>($  {interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                        </div>
                      )}
                      {extraordinaryItems !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Extraordinary Items</span>
                          <span style={{ color: extraordinaryItems >= 0 ? '#10b981' : '#ef4444' }}>
                            {extraordinaryItems >= 0 ? '$' : '($'}{Math.abs(extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{extraordinaryItems < 0 ? ')' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Income Before Tax */}
                  <div style={{ marginBottom: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>Income Before Tax</span>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>${incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* Income Taxes */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Income Taxes</div>
                    {stateIncomeTaxes > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>State Income Taxes</span>
                        <span style={{ color: '#ef4444' }}>($  {stateIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                      </div>
                    )}
                    {federalIncomeTaxes > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Federal Income Taxes</span>
                        <span style={{ color: '#ef4444' }}>($  {federalIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                      </div>
                    )}
                    {stateIncomeTaxes === 0 && federalIncomeTaxes === 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px', color: '#94a3b8', fontStyle: 'italic' }}>
                        <span>No income taxes recorded</span>
                        <span>$0</span>
                      </div>
                    )}
                  </div>

                  {/* Net Income */}
                  <div style={{ background: netIncome >= 0 ? '#dcfce7' : '#fee2e2', padding: '16px', borderRadius: '8px', marginTop: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>Net Income</span>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>
                        ${netIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: netIncome >= 0 ? '#166534' : '#991b1b', textAlign: 'right' }}>
                      {netMargin.toFixed(1)}% net margin
                    </div>
                  </div>
                </div>
              );
            } else if (statementType === 'income-statement-percent' && statementPeriod === 'current-month') {
              // Copy the entire common size logic from QB version
              const currentMonth = monthly[monthly.length - 1];
              const monthDate = new Date(currentMonth.date || currentMonth.month);
              const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              
              // Revenue
              const {
                revenue,
                cogs,
                revenueDetails,
                cogsDetails,
                revenueDetailFields,
                cogsDetailFields,
              } = buildIncomeStatementDetails([currentMonth]);
              
              const grossProfit = revenue - cogs;
              const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
              
              // Operating Expenses - All fields that have data from DataReviewTab
              const payroll = currentMonth.payroll || 0;
              const benefits = currentMonth.benefits || 0;
              const insurance = currentMonth.insurance || 0;
              const professionalFees = currentMonth.professionalFees || 0;
              const subcontractors = currentMonth.subcontractors || 0;
              const rent = currentMonth.rent || 0;
              const taxLicense = currentMonth.taxLicense || 0;
              const phoneComm = currentMonth.phoneComm || 0;
              const infrastructure = currentMonth.infrastructure || 0;
              const autoTravel = currentMonth.autoTravel || 0;
              const salesExpense = currentMonth.salesExpense || 0;
              const marketing = currentMonth.marketing || 0;
              const mealsEntertainment = currentMonth.mealsEntertainment || 0;
              const otherExpense = currentMonth.otherExpense || 0;
              const ownerBasePay = currentMonth.ownerBasePay || 0;
              const ownersRetirement = currentMonth.ownersRetirement || 0;
              const depreciationAmortization = currentMonth.depreciationAmortization || 0;

              // Calculate total operating expenses - include all expense fields
              const totalOpex = payroll + ownerBasePay + ownersRetirement + benefits + insurance + 
                               professionalFees + subcontractors + rent + taxLicense + phoneComm + 
                               infrastructure + autoTravel + salesExpense + marketing + 
                               mealsEntertainment + depreciationAmortization + otherExpense;
              
              const operatingIncome = grossProfit - totalOpex;
              const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
              
              // Other Income/Expense
              const interestExpense = currentMonth.interestExpense || 0;
              const nonOperatingIncome = currentMonth.nonOperatingIncome || 0;
              const extraordinaryItems = currentMonth.extraordinaryItems || 0;
              
              const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
              const stateIncomeTaxes = currentMonth.stateIncomeTaxes || 0;
              const federalIncomeTaxes = currentMonth.federalIncomeTaxes || 0;
              const netIncome = incomeBeforeTax - stateIncomeTaxes - federalIncomeTaxes;
              const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
              
              // Helper function to calculate percentage
              const pct = (amount: number) => revenue > 0 ? (amount / revenue) * 100 : 0;
              
              return (
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                  <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement - Common Size Analysis</h2>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>For the Month Ended {monthName} - All items shown as % of Revenue</div>
                  </div>

                  {/* Column Headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderBottom: '2px solid #cbd5e1', marginBottom: '12px', fontWeight: '600', fontSize: '13px', color: '#475569' }}>
                    <div>Line Item</div>
                    <div style={{ textAlign: 'right' }}>Amount</div>
                    <div style={{ textAlign: 'right' }}>% of Revenue</div>
                  </div>

                  {/* Revenue Section */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>Revenue</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>100.0%</span>
                    </div>
                    {revenueDetailFields.map((field) => (
                      <div key={field} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${(Number(revenueDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(Number(revenueDetails[field]) || 0).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* COGS Section */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Cost of Goods Sold</div>
                    {cogsDetailFields.map((field) => (
                      <div key={field} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${(Number(cogsDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(Number(cogsDetails[field]) || 0).toFixed(1)}%</span>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b', paddingLeft: '20px' }}>Total COGS</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>${cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>{pct(cogs).toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr' }}>
                      <span style={{ fontWeight: '700', color: '#1e40af' }}>Gross Profit</span>
                      <span style={{ fontWeight: '700', color: '#1e40af', textAlign: 'right' }}>${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '700', color: '#1e40af', textAlign: 'right' }}>{grossMargin.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Operating Expenses */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Operating Expenses</div>
                    {(payroll && payroll > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Payroll</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${payroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(payroll).toFixed(1)}%</span>
                      </div>
                    )}
                    {ownerBasePay > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Owner Base Pay</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${ownerBasePay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(ownerBasePay).toFixed(1)}%</span>
                      </div>
                    )}
                    {ownersRetirement > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Owner's Retirement</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${ownersRetirement.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(ownersRetirement).toFixed(1)}%</span>
                      </div>
                    )}
                    {(benefits && benefits > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Benefits</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${benefits.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(benefits).toFixed(1)}%</span>
                      </div>
                    )}
                    {(insurance && insurance > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Insurance</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${insurance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(insurance).toFixed(1)}%</span>
                      </div>
                    )}
                    {(professionalFees && professionalFees > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Professional Services</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${professionalFees.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(professionalFees).toFixed(1)}%</span>
                      </div>
                    )}
                    {(subcontractors && subcontractors > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Subcontractors</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${subcontractors.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(subcontractors).toFixed(1)}%</span>
                      </div>
                    )}
                    {(rent && rent > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Rent/Lease</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${rent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(rent).toFixed(1)}%</span>
                      </div>
                    )}
                    {taxLicense > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Tax & License</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${taxLicense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(taxLicense).toFixed(1)}%</span>
                      </div>
                    )}
                    {phoneComm > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Phone & Communication</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${phoneComm.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(phoneComm).toFixed(1)}%</span>
                      </div>
                    )}
                    {(infrastructure && infrastructure > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Infrastructure/Utilities</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${infrastructure.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(infrastructure).toFixed(1)}%</span>
                      </div>
                    )}
                    {(autoTravel && autoTravel > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Auto & Travel</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${autoTravel.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(autoTravel).toFixed(1)}%</span>
                      </div>
                    )}
                    {(salesExpense && salesExpense > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Sales & Marketing</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${salesExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(salesExpense).toFixed(1)}%</span>
                      </div>
                    )}
                    {marketing > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Marketing</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${marketing.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(marketing).toFixed(1)}%</span>
                      </div>
                    )}
                    {mealsEntertainment > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Meals & Entertainment</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${mealsEntertainment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(mealsEntertainment).toFixed(1)}%</span>
                      </div>
                    )}
                    {(depreciationAmortization && depreciationAmortization > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Depreciation & Amortization</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${depreciationAmortization.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(depreciationAmortization).toFixed(1)}%</span>
                      </div>
                    )}
                    {otherExpense > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569', paddingLeft: '20px' }}>Other Expenses</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>${otherExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span style={{ color: '#475569', textAlign: 'right' }}>{pct(otherExpense).toFixed(1)}%</span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                      <span style={{ fontWeight: '600', color: '#1e293b', paddingLeft: '20px' }}>Total Operating Expenses</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>${totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>{pct(totalOpex).toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Operating Income */}
                  <div style={{ marginBottom: '12px', background: '#f0fdf4', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr' }}>
                      <span style={{ fontWeight: '700', color: '#166534' }}>Operating Income</span>
                      <span style={{ fontWeight: '700', color: '#166534', textAlign: 'right' }}>${operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '700', color: '#166534', textAlign: 'right' }}>{operatingMargin.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Other Income/Expense */}
                  {(interestExpense > 0 || nonOperatingIncome > 0 || extraordinaryItems !== 0) && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Other Income/(Expense)</div>
                      {nonOperatingIncome > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                          <span style={{ color: '#475569', paddingLeft: '20px' }}>Non-Operating Income</span>
                          <span style={{ color: '#10b981', textAlign: 'right' }}>${nonOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <span style={{ color: '#10b981', textAlign: 'right' }}>{pct(nonOperatingIncome).toFixed(1)}%</span>
                        </div>
                      )}
                      {interestExpense > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                          <span style={{ color: '#475569', paddingLeft: '20px' }}>Interest Expense</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>($  {interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>({pct(interestExpense).toFixed(1)}%)</span>
                        </div>
                      )}
                      {extraordinaryItems !== 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                          <span style={{ color: '#475569', paddingLeft: '20px' }}>Extraordinary Items</span>
                          <span style={{ color: extraordinaryItems >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                            {extraordinaryItems >= 0 ? '$' : '($'}{Math.abs(extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{extraordinaryItems < 0 ? ')' : ''}
                          </span>
                          <span style={{ color: extraordinaryItems >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                            {extraordinaryItems >= 0 ? '' : '('}{pct(Math.abs(extraordinaryItems)).toFixed(1)}%{extraordinaryItems < 0 ? ')' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Income Before Tax */}
                  <div style={{ marginBottom: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>Income Before Tax</span>
                      <span style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>${incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      <span style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>{pct(incomeBeforeTax).toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Income Taxes */}
                  {(stateIncomeTaxes > 0 || federalIncomeTaxes > 0) && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Income Taxes</div>
                      {stateIncomeTaxes > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                          <span style={{ color: '#475569', paddingLeft: '20px' }}>State Income Taxes</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>($  {stateIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>({pct(stateIncomeTaxes).toFixed(1)}%)</span>
                        </div>
                      )}
                      {federalIncomeTaxes > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 0', fontSize: '14px' }}>
                          <span style={{ color: '#475569', paddingLeft: '20px' }}>Federal Income Taxes</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>($  {federalIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                          <span style={{ color: '#ef4444', textAlign: 'right' }}>({pct(federalIncomeTaxes).toFixed(1)}%)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Net Income */}
                  <div style={{ background: netIncome >= 0 ? '#dcfce7' : '#fee2e2', padding: '16px', borderRadius: '8px', marginTop: '32px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr' }}>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>Net Income</span>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b', textAlign: 'right' }}>
                        ${netIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b', textAlign: 'right' }}>
                        {netMargin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            } else if (statementType === 'balance-sheet' && statementPeriod === 'current-month') {
              const currentMonth = monthly[monthly.length - 1];
              const monthDate = new Date(currentMonth.date || currentMonth.month);
              const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              
                // Assets - Use imported totals directly from CSV
                const cash = currentMonth.cash || 0;
                const ar = currentMonth.ar || 0;
                const inventory = currentMonth.inventory || 0;
                const otherCA = currentMonth.otherCA || 0;
                const tca = currentMonth.tca || 0;  // Use imported total, don't calculate
                
                const fixedAssets = currentMonth.fixedAssets || 0;
                const otherAssets = currentMonth.otherAssets || 0;
                const totalAssets = currentMonth.totalAssets || 0;  // Use imported total, don't calculate
                
                // Liabilities - Use imported totals directly from CSV
                const ap = currentMonth.ap || 0;
                const loc = currentMonth.loc || 0;
                const otherCL = currentMonth.otherCL || 0;
                const tcl = currentMonth.tcl || 0;  // Use imported total, don't calculate
                
                const ltd = currentMonth.ltd || 0;
                const totalLiabilities = currentMonth.totalLiab || 0;  // Use imported total, don't calculate
              
              // Equity - Get detail fields
              const ownersCapital = currentMonth.ownersCapital || 0;
              const ownersDraw = currentMonth.ownersDraw || 0;
              const commonStock = currentMonth.commonStock || 0;
              const preferredStock = currentMonth.preferredStock || 0;
              const retainedEarnings = currentMonth.retainedEarnings || 0;
              const additionalPaidInCapital = currentMonth.additionalPaidInCapital || 0;
              const treasuryStock = currentMonth.treasuryStock || 0;
              
              // Calculate total equity from components to match Data Review page (do NOT use imported totalEquity)
              const totalEquity = ownersCapital + ownersDraw + commonStock + preferredStock + retainedEarnings + additionalPaidInCapital + treasuryStock;
              
              // Calculate Total Liabilities & Equity to match Data Review page (do NOT use imported totalLAndE)
              const totalLAndE = totalLiabilities + totalEquity;
              
              return (
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Balance Sheet</h2>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>As of {monthName}</div>
                  </div>

                  {/* ASSETS */}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #667eea' }}>ASSETS</div>
                    
                    {/* Current Assets */}
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Current Assets</div>
                      {cash !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Cash</span>
                          <span style={{ color: '#475569' }}>${cash.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {ar !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Accounts Receivable</span>
                          <span style={{ color: '#475569' }}>${ar.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {inventory !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Inventory</span>
                          <span style={{ color: '#475569' }}>${inventory.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {otherCA !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Other Current Assets</span>
                          <span style={{ color: '#475569' }}>${otherCA.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 8px 20px', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Current Assets</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>${tca.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>

                    {/* Non-Current Assets */}
                    {fixedAssets !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Fixed Assets</span>
                        <span style={{ color: '#475569' }}>${fixedAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {otherAssets !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Other Assets</span>
                        <span style={{ color: '#475569' }}>${otherAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #667eea', marginTop: '8px', background: '#f8fafc' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>TOTAL ASSETS</span>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* LIABILITIES */}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #f59e0b' }}>LIABILITIES</div>
                    
                    {/* Current Liabilities */}
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', fontSize: '15px' }}>Current Liabilities</div>
                      {ap !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Accounts Payable</span>
                          <span style={{ color: '#475569' }}>${ap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {loc !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Line of Credit</span>
                          <span style={{ color: '#475569' }}>${loc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {otherCL !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Other Current Liabilities</span>
                          <span style={{ color: '#475569' }}>${otherCL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 8px 20px', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Current Liabilities</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>${tcl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>

                    {/* Long-term Debt */}
                    {ltd !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Long-term Debt</span>
                        <span style={{ color: '#475569' }}>${ltd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #f59e0b', marginTop: '8px', background: '#fef3c7' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>TOTAL LIABILITIES</span>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>${totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* EQUITY */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #10b981' }}>EQUITY</div>
                    
                    {/* Equity Detail Fields */}
                    {ownersCapital !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Owner's Capital</span>
                        <span style={{ color: '#475569' }}>${ownersCapital.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {ownersDraw !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Owner's Draw</span>
                        <span style={{ color: '#475569' }}>${ownersDraw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {commonStock !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Common Stock</span>
                        <span style={{ color: '#475569' }}>${commonStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {preferredStock !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Preferred Stock</span>
                        <span style={{ color: '#475569' }}>${preferredStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {retainedEarnings !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Retained Earnings</span>
                        <span style={{ color: '#475569' }}>${retainedEarnings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {additionalPaidInCapital !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Additional Paid-In Capital</span>
                        <span style={{ color: '#475569' }}>${additionalPaidInCapital.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    {treasuryStock !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>Treasury Stock</span>
                        <span style={{ color: '#475569' }}>${treasuryStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #10b981', marginTop: '4px', background: '#d1fae5' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>TOTAL EQUITY</span>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e293b' }}>${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* TOTAL LIABILITIES & EQUITY */}
                  <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px', marginTop: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b' }}>TOTAL LIABILITIES & EQUITY</span>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b' }}>
                        ${totalLAndE.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    {Math.abs(totalAssets - totalLAndE) > 0.01 && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px', textAlign: 'right' }}>
                  ⚖️ Balance check: Assets - (Liabilities + Equity) = ${(totalAssets - totalLAndE).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            // Multi-period logic (Current Quarter, Last 12 Months, YTD, Last Year, Last 3 Years)
            else if (monthly.length > 0 && statementPeriod !== 'current-month') {
              // Helper function to get months for the selected period
              const getMonthsForPeriod = () => {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth(); // 0-11
                
                switch (statementPeriod) {
                  case 'current-quarter':
                    // Last 3 months
                    return monthly.slice(-3);
                  
                  case 'last-12-months':
                    // Last 12 months
                    return monthly.slice(-12);
                  
                  case 'ytd':
                    // Year to date - from January of current year to now
                    return monthly.filter(m => {
                      const mDate = new Date(m.date || m.month);
                      return mDate.getFullYear() === currentYear;
                    });
                  
                  case 'last-year':
                    // Full previous year
                    return monthly.filter(m => {
                      const mDate = new Date(m.date || m.month);
                      return mDate.getFullYear() === currentYear - 1;
                    });
                  
                  case 'last-3-years':
                    // Last 36 months
                    return monthly.slice(-36);
                  
                  default:
                    return [];
                }
              };
              
              const periodMonths = getMonthsForPeriod();
              
              if (periodMonths.length === 0) {
                return (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '48px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', minHeight: '400px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
                      📋 No Data Available
                    </div>
                    <p style={{ fontSize: '14px', color: '#94a3b8' }}>
                      No financial data available for the selected period.
                    </p>
                  </div>
                );
              }
              
              // Get period label
              const getPeriodLabel = () => {
                const firstMonth = periodMonths[0];
                const lastMonth = periodMonths[periodMonths.length - 1];
                const firstDate = new Date(firstMonth.date || firstMonth.month);
                const lastDate = new Date(lastMonth.date || lastMonth.month);
                
                switch (statementPeriod) {
                  case 'current-quarter':
                    return `Current Quarter (${firstDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
                  case 'last-12-months':
                    return `Last 12 Months (${firstDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
                  case 'ytd':
                    return `Year to Date ${lastDate.getFullYear()} (Jan - ${lastDate.toLocaleDateString('en-US', { month: 'short' })})`;
                  case 'last-year':
                    return `Fiscal Year ${firstDate.getFullYear()}`;
                  case 'last-3-years':
                    return `Last 3 Years (${firstDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
                  default:
                    return '';
                }
              };
              
              const periodLabel = getPeriodLabel();
              const latestMonth = periodMonths[periodMonths.length - 1];
              
              // Helper function to group months by display period
              const groupMonthsByDisplay = () => {
                if (statementDisplay === 'monthly') {
                  // Each month is its own period
                  return periodMonths.map((m, idx) => {
                    const dateValue = m.date || m.month;
                    const dateObj = dateValue ? new Date(dateValue) : new Date();
                    const label = !isNaN(dateObj.getTime()) 
                      ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      : 'Unknown';
                    
                    // DEBUG: Log first 3 periods
                    if (idx < 3) {
                      console.log(`?? Period ${idx}:`, { 
                        dateValue, 
                        dateObj, 
                        isValid: !isNaN(dateObj.getTime()), 
                        label,
                        fullMonth: m
                      });
                    }
                    
                    return { label, months: [m] };
                  });
                } else if (statementDisplay === 'quarterly') {
                  // Group by quarter
                  const quarters: { [key: string]: any[] } = {};
                  periodMonths.forEach(m => {
                    const dateValue = m.date || m.month;
                    const date = dateValue ? new Date(dateValue) : new Date();
                    if (!isNaN(date.getTime())) {
                      const year = date.getFullYear();
                      const quarter = Math.floor(date.getMonth() / 3) + 1;
                      const key = `Q${quarter} ${year}`;
                      if (!quarters[key]) quarters[key] = [];
                      quarters[key].push(m);
                    }
                  });
                  return Object.entries(quarters).map(([key, months]) => ({
                    label: key,
                    months
                  }));
                } else {
                  // Annual - group by year
                  const years: { [key: string]: any[] } = {};
                  periodMonths.forEach(m => {
                    const dateValue = m.date || m.month;
                    const date = dateValue ? new Date(dateValue) : new Date();
                    if (!isNaN(date.getTime())) {
                      const year = date.getFullYear().toString();
                      if (!years[year]) years[year] = [];
                      years[year].push(m);
                    }
                  });
                  return Object.entries(years).map(([year, months]) => ({
                    label: year,
                    months
                  }));
                }
              };
              
              const displayPeriods = groupMonthsByDisplay();
              
              // INCOME STATEMENT - Aggregate across period
              if (statementType === 'income-statement') {
                // Check if we're showing multiple periods side-by-side
                if (displayPeriods.length > 1) {
                // Multi-column comparative income statement
                const calculatePeriodData = (months: any[]) => {
                  const { revenue, cogs, revenueDetails, cogsDetails } = buildIncomeStatementDetails(months);
                  const grossProfit = revenue - cogs;

                  const expenses: { [key: string]: number } = {};
                  operatingExpenseFieldDefinitions.forEach(({ key }) => {
                    expenses[key] = months.reduce((sum, m) => sum + (Number(m[key]) || 0), 0);
                  });

                  // Calculate total operating expenses dynamically
                  const totalOpex = Object.values(expenses).reduce((sum, value) => sum + value, 0);
                  const operatingIncome = grossProfit - totalOpex;
                  
                  // Other Income/Expense
                  const interestExpense = months.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
                  const nonOperatingIncome = months.reduce((sum, m) => sum + (m.nonOperatingIncome || 0), 0);
                  const extraordinaryItems = months.reduce((sum, m) => sum + (m.extraordinaryItems || 0), 0);
                  const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
                  // Parse income taxes - handle null, undefined, strings, and numbers
                  const stateIncomeTaxes = months.reduce((sum, m) => {
                    const val = m.stateIncomeTaxes;
                    if (val === null || val === undefined) return sum;
                    const numVal = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val) : 0);
                    return sum + (isNaN(numVal) ? 0 : numVal);
                  }, 0);
                  const federalIncomeTaxes = months.reduce((sum, m) => {
                    const val = m.federalIncomeTaxes;
                    if (val === null || val === undefined) return sum;
                    const numVal = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val) : 0);
                    return sum + (isNaN(numVal) ? 0 : numVal);
                  }, 0);
                  const netIncome = incomeBeforeTax - stateIncomeTaxes - federalIncomeTaxes;
                  
                  return {
                    revenue,
                    revenueDetails,
                    cogsDetails,
                    cogs,
                    grossProfit,
                    ...expenses, // Include all expense fields dynamically
                    totalOpex,
                    operatingIncome,
                    interestExpense, nonOperatingIncome, extraordinaryItems,
                    incomeBeforeTax,
                    stateIncomeTaxes,
                    federalIncomeTaxes,
                    netIncome
                  };
                };
                  
                  const periodsData = displayPeriods.map(p => ({
                    ...calculatePeriodData(p.months),
                    label: p.label
                  }));
                  const comparativeCogsFields = Array.from(
                    new Set(periodsData.flatMap((p: any) => Object.keys(p.cogsDetails || {}))),
                  ).filter((field) =>
                    periodsData.some((p: any) => (Number((p.cogsDetails || {})[field]) || 0) !== 0),
                  );
                  const comparativeRevenueFields = Array.from(
                    new Set(periodsData.flatMap((p: any) => Object.keys(p.revenueDetails || {}))),
                  ).filter((field) =>
                    periodsData.some((p: any) => (Number((p.revenueDetails || {})[field]) || 0) !== 0),
                  );
                  
                  return (
                    <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                      <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement</h2>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>{periodLabel} - {statementDisplay === 'monthly' ? 'Monthly' : statementDisplay === 'quarterly' ? 'Quarterly' : 'Annual'}</div>
                      </div>
                      
                      {/* Table with multiple columns */}
                      <div style={{ minWidth: `${200 + (periodsData.length * 110)}px` }}>
                        {/* Header Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0', borderBottom: '2px solid #1e293b', fontWeight: '600', color: '#1e293b', position: 'sticky', top: 0, background: 'white', fontSize: '13px' }}>
                          <div>Line Item</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#1e293b' }}>{p.label || 'N/A'}</div>
                          ))}
                        </div>
                        
                        {/* Revenue */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>
                          <div style={{ color: '#1e293b' }}>Revenue</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#1e293b' }}>${p.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          ))}
                        </div>
                        {comparativeRevenueFields.map((field) => (
                          <div key={field} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                            <div style={{ color: '#64748b', paddingLeft: '20px' }}>{getFieldDisplayName(field)}</div>
                            {periodsData.map((p, i) => (
                              <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                                ${(Number((p.revenueDetails || {})[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </div>
                            ))}
                          </div>
                        ))}
                        
                        {/* COGS Section Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>
                          <div style={{ color: '#475569' }}>Cost of Goods Sold</div>
                          {periodsData.map((p, i) => <div key={i}></div>)}
                        </div>
                        
                        {/* COGS Details */}
                        {comparativeCogsFields.map((field) => (
                          <div key={field} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                            <div style={{ color: '#64748b', paddingLeft: '20px' }}>{getFieldDisplayName(field)}</div>
                            {periodsData.map((p, i) => (
                              <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                                ${(Number((p.cogsDetails || {})[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </div>
                            ))}
                          </div>
                        ))}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '6px 0', fontSize: '14px', fontWeight: '600', borderTop: '1px solid #cbd5e1', marginTop: '4px' }}>
                          <div style={{ color: '#475569' }}>Total COGS</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#475569' }}>${p.cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          ))}
                        </div>
                        
                        {/* Gross Profit */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '10px 8px', background: '#dbeafe', borderRadius: '4px', marginTop: '8px', fontWeight: '700' }}>
                          <div style={{ color: '#1e40af' }}>Gross Profit</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#1e40af' }}>${p.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          ))}
                        </div>
                        
                        {/* Operating Expenses Section Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', fontWeight: '600', marginTop: '12px' }}>
                          <div style={{ color: '#475569' }}>Operating Expenses</div>
                          {periodsData.map((p, i) => <div key={i}></div>)}
                        </div>
                        
                        {/* Operating Expenses Details - Dynamic Rendering */}
                        {(() => {
                          // Render only fields that have values in at least one period
                          return operatingExpenseFieldDefinitions.map(fieldDef => {
                            const hasValue = periodsData.some(p => (p[fieldDef.key as keyof typeof p] as number) > 0);
                            if (hasValue) {
                              return (
                                <div key={fieldDef.key} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                  <div style={{ color: '#64748b', paddingLeft: '20px' }}>{fieldDef.label}</div>
                                  {periodsData.map((p, i) => (
                                    <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                                      ${(p[fieldDef.key as keyof typeof p] as number).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          });
                        })()}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '6px 0', fontSize: '14px', fontWeight: '600', borderTop: '1px solid #cbd5e1', marginTop: '4px' }}>
                          <div style={{ color: '#475569' }}>Total Operating Expenses</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#475569' }}>${p.totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          ))}
                        </div>
                        
                        {/* Operating Income */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '10px 8px', background: '#dbeafe', borderRadius: '4px', marginTop: '8px', fontWeight: '700' }}>
                          <div style={{ color: '#1e40af' }}>Operating Income</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#1e40af' }}>${p.operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          ))}
                        </div>
                        
                        {/* Other Income/Expense Section */}
                        {periodsData.some(p => p.interestExpense > 0 || p.nonOperatingIncome > 0 || p.extraordinaryItems !== 0) && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', fontWeight: '600', marginTop: '12px' }}>
                              <div style={{ color: '#475569' }}>Other Income/(Expense)</div>
                              {periodsData.map((p, i) => <div key={i}></div>)}
                            </div>
                            {periodsData.some(p => p.interestExpense > 0) && (
                              <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                <div style={{ color: '#64748b', paddingLeft: '20px' }}>Interest Expense</div>
                                {periodsData.map((p, i) => (
                                  <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>(${ p.interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                                ))}
                              </div>
                            )}
                            {periodsData.some(p => p.nonOperatingIncome > 0) && (
                              <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                <div style={{ color: '#64748b', paddingLeft: '20px' }}>Non-Operating Income</div>
                                {periodsData.map((p, i) => (
                                  <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>${p.nonOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                ))}
                              </div>
                            )}
                            {periodsData.some(p => p.extraordinaryItems !== 0) && (
                              <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                <div style={{ color: '#64748b', paddingLeft: '20px' }}>Extraordinary Items</div>
                                {periodsData.map((p, i) => (
                                  <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                                    {p.extraordinaryItems >= 0 ? '$' : '($'}{Math.abs(p.extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{p.extraordinaryItems < 0 ? ')' : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        
                        {/* Income Before Tax */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '10px 8px', background: '#f1f5f9', borderRadius: '4px', marginTop: '12px', fontWeight: '700' }}>
                          <div style={{ color: '#0f172a' }}>Income Before Tax</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#0f172a' }}>
                              ${p.incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          ))}
                        </div>

                        {/* Income Taxes */}
                        {periodsData.some(p => {
                          const stateTax = Number(p.stateIncomeTaxes) || 0;
                          const federalTax = Number(p.federalIncomeTaxes) || 0;
                          return stateTax !== 0 || federalTax !== 0;
                        }) ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', fontWeight: '600', marginTop: '12px' }}>
                              <div style={{ color: '#475569' }}>Income Taxes</div>
                              {periodsData.map((p, i) => <div key={i}></div>)}
                            </div>
                            {periodsData.some(p => {
                              const stateTax = Number(p.stateIncomeTaxes) || 0;
                              return stateTax !== 0;
                            }) && (
                              <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                <div style={{ color: '#64748b', paddingLeft: '20px' }}>State Income Taxes</div>
                                {periodsData.map((p, i) => {
                                  const stateTax = Number(p.stateIncomeTaxes) || 0;
                                  return (
                                    <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>(${Math.abs(stateTax).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                                  );
                                })}
                              </div>
                            )}
                            {periodsData.some(p => {
                              const federalTax = Number(p.federalIncomeTaxes) || 0;
                              return federalTax !== 0;
                            }) && (
                              <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                                <div style={{ color: '#64748b', paddingLeft: '20px' }}>Federal Income Taxes</div>
                                {periodsData.map((p, i) => {
                                  const federalTax = Number(p.federalIncomeTaxes) || 0;
                                  return (
                                    <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>(${Math.abs(federalTax).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', marginTop: '12px' }}>
                            <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Income Taxes</div>
                            {periodsData.map((p, i) => (
                              <div key={i} style={{ textAlign: 'right', color: '#94a3b8', fontStyle: 'italic' }}>No income taxes recorded</div>
                            ))}
                          </div>
                        )}
                        
                        {/* Net Income */}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 8px', background: '#dcfce7', borderRadius: '4px', marginTop: '12px', fontWeight: '700', fontSize: '15px' }}>
                          <div style={{ color: '#166534' }}>Net Income</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: p.netIncome >= 0 ? '#166534' : '#991b1b' }}>
                              {p.netIncome >= 0 ? '$' : '($'}{Math.abs(p.netIncome).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{p.netIncome < 0 ? ')' : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // Single period aggregation (original logic)
                const {
                  revenue,
                  cogs,
                  revenueDetails,
                  cogsDetails,
                  revenueDetailFields,
                  cogsDetailFields,
                } = buildIncomeStatementDetails(periodMonths);
                
                const grossProfit = revenue - cogs;
                const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
                
                const expenses: { [key: string]: number } = {};
                operatingExpenseFieldDefinitions.forEach(({ key }) => {
                  expenses[key] = periodMonths.reduce((sum, m) => sum + (Number(m[key]) || 0), 0);
                });
                const totalOpex = Object.values(expenses).reduce((sum, value) => sum + value, 0);
                
                const operatingIncome = grossProfit - totalOpex;
                const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
                
                const interestExpense = periodMonths.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
                const nonOperatingIncome = periodMonths.reduce((sum, m) => sum + (m.nonOperatingIncome || 0), 0);
                const extraordinaryItems = periodMonths.reduce((sum, m) => sum + (m.extraordinaryItems || 0), 0);
                const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
                const stateIncomeTaxes = periodMonths.reduce((sum, m) => {
                  const raw = (m as any).stateIncomeTaxes;
                  if (raw === null || raw === undefined) return sum;
                  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                  return sum + (Number.isFinite(parsed) ? parsed : 0);
                }, 0);
                const federalIncomeTaxes = periodMonths.reduce((sum, m) => {
                  const raw = (m as any).federalIncomeTaxes;
                  if (raw === null || raw === undefined) return sum;
                  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
                  return sum + (Number.isFinite(parsed) ? parsed : 0);
                }, 0);
                const netIncome = incomeBeforeTax - stateIncomeTaxes - federalIncomeTaxes;
                const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
                
                return (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                      <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement</h2>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>For the Period: {periodLabel}</div>
                      </div>

                      {/* Revenue Section */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>Revenue</span>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                    {revenueDetailFields.map((field) => (
                      <div key={field} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569' }}>${(Number(revenueDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                      </div>

                      {/* COGS Section */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Cost of Goods Sold</div>
                    {cogsDetailFields.map((field) => (
                      <div key={field} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                        <span style={{ color: '#475569' }}>{getFieldDisplayName(field)}</span>
                        <span style={{ color: '#475569' }}>${(Number(cogsDetails[field]) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>Total COGS</span>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>${cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>

                      {/* Gross Profit */}
                      <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '700', color: '#1e40af' }}>Gross Profit</span>
                          <span style={{ fontWeight: '700', color: '#1e40af' }}>${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
                          {grossMargin.toFixed(1)}% margin
                        </div>
                      </div>

                      {/* Operating Expenses */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Operating Expenses</div>
                        {operatingExpenseFieldDefinitions.map((field) => {
                          const value = Number(expenses[field.key]) || 0;
                          if (value <= 0) return null;
                          return (
                            <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                              <span style={{ color: '#475569' }}>{field.label}</span>
                              <span style={{ color: '#475569' }}>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                            </div>
                          );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</span>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>${totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>

                      {/* Operating Income */}
                      <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '700', color: '#1e40af' }}>Operating Income</span>
                          <span style={{ fontWeight: '700', color: '#1e40af' }}>${operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
                          {operatingMargin.toFixed(1)}% operating margin
                        </div>
                      </div>

                      {/* Other Income/Expense */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Other Income/(Expense)</div>
                        {interestExpense > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#475569' }}>Interest Expense</span>
                            <span style={{ color: '#475569' }}>(${ interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                          </div>
                        )}
                        {nonOperatingIncome > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#475569' }}>Non-Operating Income</span>
                            <span style={{ color: '#475569' }}>${nonOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {extraordinaryItems !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#475569' }}>Extraordinary Items</span>
                            <span style={{ color: '#475569' }}>{extraordinaryItems >= 0 ? '$' : '($'}{Math.abs(extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{extraordinaryItems < 0 ? ')' : ''}</span>
                          </div>
                        )}
                      </div>

                      {/* Income Before Tax */}
                      <div style={{ marginBottom: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>Income Before Tax</span>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>
                            ${incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>

                      {/* Income Taxes */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Income Taxes</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>State Income Taxes</span>
                          <span style={{ color: '#475569' }}>
                            ({Math.abs(stateIncomeTaxes).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#475569' }}>Federal Income Taxes</span>
                          <span style={{ color: '#475569' }}>
                            ({Math.abs(federalIncomeTaxes).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                          </span>
                        </div>
                      </div>

                      {/* Net Income */}
                      <div style={{ background: netIncome >= 0 ? '#dcfce7' : '#fee2e2', padding: '16px', borderRadius: '8px', marginTop: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>Net Income</span>
                          <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>
                            {netIncome >= 0 ? '$' : '($'}{Math.abs(netIncome).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{netIncome < 0 ? ')' : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', color: netIncome >= 0 ? '#166534' : '#991b1b', textAlign: 'right' }}>
                          {netMargin.toFixed(1)}% net margin
                        </div>
                      </div>
                  </div>
                );
              }
              
              // COMMON SIZE INCOME STATEMENT - Aggregate with percentages
              else if (statementType === 'income-statement-percent') {
                // Check if showing multiple periods side-by-side
                if (displayPeriods.length > 1) {
                  const calc = (months: any[], field: string) => months.reduce((sum, m) => sum + (m[field] || 0), 0);
                  const periodsData = displayPeriods.map(p => {
                    const m = p.months;
                    const detailData = buildIncomeStatementDetails(m);
                    const revenue = detailData.revenue;
                    const cogs = detailData.cogs;
                    const payroll = calc(m, 'payroll');
                    const ownerBasePay = calc(m, 'ownerBasePay');
                    const ownersRetirement = calc(m, 'ownersRetirement');
                    const professionalFees = calc(m, 'professionalFees');
                    const rent = calc(m, 'rent');
                    const infrastructure = calc(m, 'infrastructure');
                    const autoTravel = calc(m, 'autoTravel');
                    const insurance = calc(m, 'insurance');
                    const salesExpense = calc(m, 'salesExpense');
                    const subcontractors = calc(m, 'subcontractors');
                    const depreciationAmortization = calc(m, 'depreciationAmortization');
                    const marketing = calc(m, 'marketing');
                    const interestExpense = calc(m, 'interestExpense');
                    const nonOperatingIncome = calc(m, 'nonOperatingIncome');
                    const extraordinaryItems = calc(m, 'extraordinaryItems');
                    // Calculate all operating expenses - include all expense fields
                    const benefits = calc(m, 'benefits');
                    const taxLicense = calc(m, 'taxLicense');
                    const stateIncomeTaxes = calc(m, 'stateIncomeTaxes');
                    const federalIncomeTaxes = calc(m, 'federalIncomeTaxes');
                    const phoneComm = calc(m, 'phoneComm');
                    const mealsEntertainment = calc(m, 'mealsEntertainment');
                    const otherExpense = calc(m, 'otherExpense');
                    const totalOpex = payroll + ownerBasePay + ownersRetirement + professionalFees + rent + infrastructure + autoTravel + insurance + salesExpense + subcontractors + depreciationAmortization + marketing + benefits + taxLicense + phoneComm + mealsEntertainment + otherExpense;
                    const grossProfit = revenue - cogs;
                    const operatingIncome = grossProfit - totalOpex;
                    const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
                    const totalIncomeTaxes = stateIncomeTaxes + federalIncomeTaxes;
                    const netIncome = incomeBeforeTax - totalIncomeTaxes;
                    return {
                      label: p.label,
                      revenue,
                      cogs,
                      revenueDetails: detailData.revenueDetails,
                      cogsDetails: detailData.cogsDetails,
                      grossProfit,
                      payroll,
                      ownerBasePay,
                      ownersRetirement,
                      professionalFees,
                      rent,
                      infrastructure,
                      autoTravel,
                      insurance,
                      salesExpense,
                      subcontractors,
                      depreciationAmortization,
                      marketing,
                      benefits,
                      taxLicense,
                      phoneComm,
                      mealsEntertainment,
                      otherExpense,
                      totalOpex,
                      operatingIncome,
                      interestExpense,
                      nonOperatingIncome,
                      extraordinaryItems,
                      incomeBeforeTax,
                      stateIncomeTaxes,
                      federalIncomeTaxes,
                      totalIncomeTaxes,
                      netIncome
                    };
                  });
                  const cogsDetailFields = Array.from(
                    new Set(periodsData.flatMap((p: any) => Object.keys(p.cogsDetails || {}))),
                  ).filter((field) =>
                    periodsData.some((p: any) => (Number((p.cogsDetails || {})[field]) || 0) !== 0),
                  );
                  const revenueDetailFields = Array.from(
                    new Set(periodsData.flatMap((p: any) => Object.keys(p.revenueDetails || {}))),
                  ).filter((field) =>
                    periodsData.some((p: any) => (Number((p.revenueDetails || {})[field]) || 0) !== 0),
                  );
                  const RowWithPercent = ({ label, values, indent = 0, bold = false }: any) => (
                    <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '4px 0', fontSize: bold ? '14px' : '13px', fontWeight: bold ? '600' : 'normal' }}>
                      <div style={{ color: bold ? '#475569' : '#64748b', paddingLeft: `${indent}px` }}>{label}</div>
                      {values.map((v: number, i: number) => {
                        const pct = periodsData[i].revenue > 0 ? (v / periodsData[i].revenue) * 100 : 0;
                        return (
                          <div key={i} style={{ display: 'contents' }}>
                            <div style={{ textAlign: 'right', color: bold ? '#475569' : '#64748b' }}>${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            <div style={{ textAlign: 'right', color: '#64748b', fontSize: '12px' }}>{pct.toFixed(1)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                  return (
                    <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                      <div style={{ marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Comparative Common Size Income Statement</h2>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>{periodLabel} - {statementDisplay === 'monthly' ? 'Monthly' : statementDisplay === 'quarterly' ? 'Quarterly' : 'Annual'}</div>
                      </div>
                      <div style={{ minWidth: `${200 + (periodsData.length * 150)}px` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '12px 0', borderBottom: '2px solid #1e293b', fontWeight: '600', color: '#1e293b' }}>
                          <div>Line Item</div>
                          {periodsData.map((p, i) => (
                            <div key={i} style={{ display: 'contents' }}>
                              <div style={{ textAlign: 'right' }}>{p.label}</div>
                              <div style={{ textAlign: 'right', fontSize: '12px' }}>% of Rev</div>
                            </div>
                          ))}
                        </div>
                        <RowWithPercent label="Revenue" values={periodsData.map(p => p.revenue)} bold />
                        {revenueDetailFields.map((field) => (
                          <RowWithPercent
                            key={field}
                            label={getFieldDisplayName(field)}
                            values={periodsData.map((p: any) => Number((p.revenueDetails || {})[field]) || 0)}
                            indent={20}
                          />
                        ))}
                        <div style={{ margin: '8px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Cost of Goods Sold</div>
                        {cogsDetailFields.map((field) => (
                          <RowWithPercent
                            key={field}
                            label={getFieldDisplayName(field)}
                            values={periodsData.map((p: any) => Number((p.cogsDetails || {})[field]) || 0)}
                            indent={20}
                          />
                        ))}
                        <RowWithPercent label="Total COGS" values={periodsData.map(p => p.cogs)} bold />
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '10px 8px', background: '#dbeafe', borderRadius: '4px', margin: '8px 0', fontWeight: '700', color: '#1e40af' }}>
                          <div>Gross Profit</div>
                          {periodsData.map((p, i) => {
                            const pct = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : 0;
                            return (
                              <div key={i} style={{ display: 'contents' }}>
                                <div style={{ textAlign: 'right' }}>${p.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div style={{ textAlign: 'right', fontSize: '12px' }}>{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Operating Expenses</div>
                        {(() => {
                          // Define all possible expense fields with their display names
                          const expenseFieldDefinitions = [
                            // Operating Expenses - Complete list in correct order
                            { key: 'payroll', label: 'Payroll' },
                            { key: 'benefits', label: 'Benefits' },
                            { key: 'insurance', label: 'Insurance' },
                            { key: 'professionalFees', label: 'Professional Services' },
                            { key: 'subcontractors', label: 'Subcontractors' },
                            { key: 'rent', label: 'Rent/Lease' },
                            { key: 'taxLicense', label: 'Tax & License' },
                            { key: 'phoneComm', label: 'Phone & Communication' },
                            { key: 'infrastructure', label: 'Infrastructure/Utilities' },
                            { key: 'autoTravel', label: 'Auto & Travel' },
                            { key: 'salesExpense', label: 'Sales & Marketing' },
                            { key: 'marketing', label: 'Marketing' },
                            { key: 'mealsEntertainment', label: 'Meals & Entertainment' },
                            { key: 'otherExpense', label: 'Other Expenses' }
                          ];

                          // Render only fields that have values in at least one period
                          return expenseFieldDefinitions.map(fieldDef => {
                            const hasValue = periodsData.some(p => (p[fieldDef.key as keyof typeof p] as number) > 0);
                            if (hasValue) {
                              return (
                                <RowWithPercent
                                  key={fieldDef.key}
                                  label={fieldDef.label}
                                  values={periodsData.map(p => p[fieldDef.key as keyof typeof p] as number)}
                                  indent={20}
                                />
                              );
                            }
                            return null;
                          });
                        })()}
                        <RowWithPercent label="Total Operating Expenses" values={periodsData.map(p => p.totalOpex)} bold />
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '10px 8px', background: '#dbeafe', borderRadius: '4px', margin: '8px 0', fontWeight: '700', color: '#1e40af' }}>
                          <div>Operating Income</div>
                          {periodsData.map((p, i) => {
                            const pct = p.revenue > 0 ? (p.operatingIncome / p.revenue) * 100 : 0;
                            return (
                              <div key={i} style={{ display: 'contents' }}>
                                <div style={{ textAlign: 'right' }}>${p.operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div style={{ textAlign: 'right', fontSize: '12px' }}>{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>
                        {periodsData.some(p => p.interestExpense > 0 || p.nonOperatingIncome > 0 || p.extraordinaryItems !== 0) && (
                          <>
                            <div style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Other Income/(Expense)</div>
                            {periodsData.some(p => p.interestExpense > 0) && <RowWithPercent label="Interest Expense" values={periodsData.map(p => -p.interestExpense)} indent={20} />}
                            {periodsData.some(p => p.nonOperatingIncome > 0) && <RowWithPercent label="Non-Operating Income" values={periodsData.map(p => p.nonOperatingIncome)} indent={20} />}
                            {periodsData.some(p => p.extraordinaryItems !== 0) && <RowWithPercent label="Extraordinary Items" values={periodsData.map(p => p.extraordinaryItems)} indent={20} />}
                          </>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '10px 8px', background: '#f1f5f9', borderRadius: '4px', margin: '12px 0 0', fontWeight: '700', color: '#0f172a' }}>
                          <div>Income Before Tax</div>
                          {periodsData.map((p, i) => {
                            const pct = p.revenue > 0 ? (p.incomeBeforeTax / p.revenue) * 100 : 0;
                            return (
                              <div key={i} style={{ display: 'contents' }}>
                                <div style={{ textAlign: 'right' }}>${p.incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                <div style={{ textAlign: 'right', fontSize: '12px' }}>{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>

                        {periodsData.some(p => {
                          const stateTax = Number(p.stateIncomeTaxes) || 0;
                          const federalTax = Number(p.federalIncomeTaxes) || 0;
                          return stateTax !== 0 || federalTax !== 0;
                        }) ? (
                          <>
                            <div style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Income Taxes</div>
                            {periodsData.some(p => {
                              const stateTax = Number(p.stateIncomeTaxes) || 0;
                              return stateTax !== 0;
                            }) && <RowWithPercent label="State Income Taxes" values={periodsData.map(p => {
                              const stateTax = Number(p.stateIncomeTaxes) || 0;
                              return -Math.abs(stateTax);
                            })} indent={20} />}
                            {periodsData.some(p => {
                              const federalTax = Number(p.federalIncomeTaxes) || 0;
                              return federalTax !== 0;
                            }) && <RowWithPercent label="Federal Income Taxes" values={periodsData.map(p => {
                              const federalTax = Number(p.federalIncomeTaxes) || 0;
                              return -Math.abs(federalTax);
                            })} indent={20} />}
                          </>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 110px)`, gap: '4px', padding: '12px 0 4px 0', fontSize: '14px', marginTop: '12px' }}>
                            <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Income Taxes</div>
                            {periodsData.map((p, i) => (
                              <div key={i} style={{ textAlign: 'right', color: '#94a3b8', fontStyle: 'italic' }}>No income taxes recorded</div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${periodsData.length}, 90px 60px)`, gap: '4px', padding: '12px 8px', background: '#dcfce7', borderRadius: '4px', margin: '12px 0 0', fontWeight: '700', fontSize: '15px' }}>
                          <div style={{ color: '#166534' }}>Net Income</div>
                          {periodsData.map((p, i) => {
                            const pct = p.revenue > 0 ? (p.netIncome / p.revenue) * 100 : 0;
                            return (
                              <div key={i} style={{ display: 'contents' }}>
                                <div style={{ textAlign: 'right', color: p.netIncome >= 0 ? '#166534' : '#991b1b' }}>
                                  {p.netIncome >= 0 ? '$' : '($'}{Math.abs(p.netIncome).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{p.netIncome < 0 ? ')' : ''}
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '12px', color: p.netIncome >= 0 ? '#166534' : '#991b1b' }}>{pct.toFixed(1)}%</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                const {
                  revenue,
                  cogs,
                  revenueDetails,
                  cogsDetails,
                  revenueDetailFields,
                  cogsDetailFields,
                } = buildIncomeStatementDetails(periodMonths);
                
                const grossProfit = revenue - cogs;

                // Dynamically calculate operating expense fields only - Complete list matching DataReviewTab
                const expenseFields = [
                  'payroll', 'ownerBasePay', 'ownersRetirement', 'benefits', 'insurance', 
                  'professionalFees', 'subcontractors', 'rent', 'taxLicense', 'phoneComm', 
                  'infrastructure', 'autoTravel', 'salesExpense', 'marketing', 
                  'mealsEntertainment', 'depreciationAmortization', 'otherExpense'
                ];

                const expenses: { [key: string]: number } = {};
                expenseFields.forEach(field => {
                  expenses[field] = periodMonths.reduce((sum, m) => sum + (m[field] || 0), 0);
                });

                // Calculate total operating expenses dynamically
                const totalOpex = Object.values(expenses).reduce((sum, value) => sum + value, 0);
                
                const operatingIncome = grossProfit - totalOpex;
                
                const interestExpense = periodMonths.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
                const nonOperatingIncome = periodMonths.reduce((sum, m) => sum + (m.nonOperatingIncome || 0), 0);
                const extraordinaryItems = periodMonths.reduce((sum, m) => sum + (m.extraordinaryItems || 0), 0);
                
                const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
                const stateIncomeTaxes = periodMonths.reduce((sum, m) => sum + (m.stateIncomeTaxes || 0), 0);
                const federalIncomeTaxes = periodMonths.reduce((sum, m) => sum + (m.federalIncomeTaxes || 0), 0);
                const totalIncomeTaxes = stateIncomeTaxes + federalIncomeTaxes;
                const netIncome = incomeBeforeTax - totalIncomeTaxes;
                
                const calcPercent = (value: number) => revenue > 0 ? ((value / revenue) * 100).toFixed(1) + '%' : '0.0%';
                
                return (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                      <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Common Size Income Statement</h2>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>For the Period: {periodLabel}</div>
                      </div>

                      {/* Header Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '12px 0', borderBottom: '2px solid #1e293b', marginBottom: '16px', fontWeight: '600', color: '#1e293b' }}>
                        <div>Line Item</div>
                        <div style={{ textAlign: 'right' }}>Amount</div>
                        <div style={{ textAlign: 'right' }}>% of Revenue</div>
                      </div>

                      {/* Revenue */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>
                        <div style={{ color: '#1e293b' }}>Revenue</div>
                        <div style={{ textAlign: 'right', color: '#1e293b' }}>${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                        <div style={{ textAlign: 'right', color: '#1e293b' }}>100.0%</div>
                      </div>
                      {revenueDetailFields.map((field) => {
                        const value = Number(revenueDetails[field]) || 0;
                        return (
                          <div key={field} style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                            <div style={{ color: '#64748b' }}>{getFieldDisplayName(field)}</div>
                            <div style={{ textAlign: 'right', color: '#64748b' }}>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            <div style={{ textAlign: 'right', color: '#64748b' }}>{calcPercent(value)}</div>
                          </div>
                        );
                      })}

                      {/* COGS */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px', fontSize: '14px' }}>Cost of Goods Sold</div>
                        {cogsDetailFields.map((field) => {
                          const value = Number(cogsDetails[field]) || 0;
                          return (
                            <div key={field} style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>{getFieldDisplayName(field)}</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>{calcPercent(value)}</div>
                            </div>
                          );
                        })}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '8px 0', borderTop: '1px solid #cbd5e1', marginTop: '4px', fontWeight: '600' }}>
                          <div style={{ color: '#475569' }}>Total COGS</div>
                          <div style={{ textAlign: 'right', color: '#475569' }}>${cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          <div style={{ textAlign: 'right', color: '#475569' }}>{calcPercent(cogs)}</div>
                        </div>
                      </div>

                      {/* Gross Profit */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '12px 8px', background: '#dbeafe', borderRadius: '6px', margin: '16px 0', fontWeight: '700', color: '#1e40af' }}>
                        <div>Gross Profit</div>
                        <div style={{ textAlign: 'right' }}>${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                        <div style={{ textAlign: 'right' }}>{calcPercent(grossProfit)}</div>
                      </div>

                      {/* Operating Expenses */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px', fontSize: '14px' }}>Operating Expenses</div>
                        {(() => {
                          // Define all possible expense fields with their display names
                          const expenseFieldDefinitions = [
                            // Operating Expenses - Complete list in correct order
                            { key: 'payroll', label: 'Payroll' },
                            { key: 'benefits', label: 'Benefits' },
                            { key: 'insurance', label: 'Insurance' },
                            { key: 'professionalFees', label: 'Professional Services' },
                            { key: 'subcontractors', label: 'Subcontractors' },
                            { key: 'rent', label: 'Rent/Lease' },
                            { key: 'taxLicense', label: 'Tax & License' },
                            { key: 'phoneComm', label: 'Phone & Communication' },
                            { key: 'infrastructure', label: 'Infrastructure/Utilities' },
                            { key: 'autoTravel', label: 'Auto & Travel' },
                            { key: 'salesExpense', label: 'Sales & Marketing' },
                            { key: 'marketing', label: 'Marketing' },
                            { key: 'mealsEntertainment', label: 'Meals & Entertainment' },
                            { key: 'otherExpense', label: 'Other Expenses' }
                          ];

                          // Render only fields that have values > 0
                          return expenseFieldDefinitions.map(fieldDef => {
                            const value = expenses[fieldDef.key] || 0;
                            if (value > 0) {
                              return (
                                <div key={fieldDef.key} style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                                  <div style={{ color: '#64748b' }}>{fieldDef.label}</div>
                                  <div style={{ textAlign: 'right', color: '#64748b' }}>${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                  <div style={{ textAlign: 'right', color: '#64748b' }}>{calcPercent(value)}</div>
                                </div>
                              );
                            }
                            return null;
                          });
                        })()}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '8px 0', borderTop: '1px solid #cbd5e1', marginTop: '4px', fontWeight: '600' }}>
                          <div style={{ color: '#475569' }}>Total Operating Expenses</div>
                          <div style={{ textAlign: 'right', color: '#475569' }}>${totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          <div style={{ textAlign: 'right', color: '#475569' }}>{calcPercent(totalOpex)}</div>
                        </div>
                      </div>

                      {/* Operating Income */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '12px 8px', background: '#dbeafe', borderRadius: '6px', margin: '16px 0', fontWeight: '700', color: '#1e40af' }}>
                        <div>Operating Income</div>
                        <div style={{ textAlign: 'right' }}>${operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                        <div style={{ textAlign: 'right' }}>{calcPercent(operatingIncome)}</div>
                      </div>

                      {/* Other Income/Expense */}
                      {(interestExpense > 0 || nonOperatingIncome > 0 || extraordinaryItems !== 0) && (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px', fontSize: '14px' }}>Other Income/(Expense)</div>
                          {interestExpense > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>Interest Expense</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>(${ interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>({calcPercent(interestExpense)})</div>
                            </div>
                          )}
                          {nonOperatingIncome > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>Non-Operating Income</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>${nonOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>{calcPercent(nonOperatingIncome)}</div>
                            </div>
                          )}
                          {extraordinaryItems !== 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>Extraordinary Items</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>
                                {extraordinaryItems >= 0 ? '$' : '($'}{Math.abs(extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{extraordinaryItems < 0 ? ')' : ''}
                              </div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>
                                {extraordinaryItems >= 0 ? calcPercent(extraordinaryItems) : `(${calcPercent(Math.abs(extraordinaryItems))})`}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Income Before Tax */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '12px 8px', background: '#f1f5f9', borderRadius: '6px', marginTop: '16px', fontWeight: '700', color: '#0f172a' }}>
                        <div>Income Before Tax</div>
                        <div style={{ textAlign: 'right' }}>${incomeBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                        <div style={{ textAlign: 'right' }}>{calcPercent(incomeBeforeTax)}</div>
                      </div>

                      {/* Income Taxes */}
                      {(stateIncomeTaxes > 0 || federalIncomeTaxes > 0) && (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px', fontSize: '14px' }}>Income Taxes</div>
                          {stateIncomeTaxes > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>State Income Taxes</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>(${stateIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>({calcPercent(stateIncomeTaxes)})</div>
                            </div>
                          )}
                          {federalIncomeTaxes > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '4px 0 4px 20px', fontSize: '13px' }}>
                              <div style={{ color: '#64748b' }}>Federal Income Taxes</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>(${federalIncomeTaxes.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</div>
                              <div style={{ textAlign: 'right', color: '#64748b' }}>({calcPercent(federalIncomeTaxes)})</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Net Income */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.7fr', gap: '16px', padding: '16px 8px', background: netIncome >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: '6px', marginTop: '24px', fontWeight: '700', fontSize: '16px', color: netIncome >= 0 ? '#166534' : '#991b1b' }}>
                        <div>Net Income</div>
                        <div style={{ textAlign: 'right' }}>
                          {netIncome >= 0 ? '$' : '($'}{Math.abs(netIncome).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{netIncome < 0 ? ')' : ''}
                        </div>
                        <div style={{ textAlign: 'right' }}>{calcPercent(netIncome)}</div>
                      </div>
                  </div>
                );
              }
              
              // BALANCE SHEET - Latest point in time
              else if (statementType === 'balance-sheet') {
                // Check if showing multiple periods side-by-side
                if (displayPeriods.length > 1) {
                  const balanceData = displayPeriods.map(p => {
                    const latest = p.months[p.months.length - 1];
                    
                    // Assets - Use Data Review fields and imported totals
                    const cash = latest.cash || 0;
                    const ar = latest.ar || 0;
                    const inventory = latest.inventory || 0;
                    const otherCA = latest.otherCA || 0;
                    const tca = latest.tca || 0;  // Use imported total
                    
                    const fixedAssets = latest.fixedAssets || 0;
                    const otherAssets = latest.otherAssets || 0;
                    const totalAssets = latest.totalAssets || 0;  // Use imported total
                    
                    // Liabilities - Use Data Review fields and imported totals
                    const ap = latest.ap || 0;
                    const loc = latest.loc || 0;
                    const otherCL = latest.otherCL || 0;
                    const tcl = latest.tcl || 0;  // Use imported total
                    
                    const ltd = latest.ltd || 0;
                    const totalLiabilities = latest.totalLiab || 0;  // Use imported total
                    
                    // Equity - All detail fields
                    const ownersCapital = latest.ownersCapital || 0;
                    const ownersDraw = latest.ownersDraw || 0;
                    const commonStock = latest.commonStock || 0;
                    const preferredStock = latest.preferredStock || 0;
                    const retainedEarnings = latest.retainedEarnings || 0;
                    const additionalPaidInCapital = latest.additionalPaidInCapital || 0;
                    const treasuryStock = latest.treasuryStock || 0;
                    const paidInCapital = latest.paidInCapital || 0;
                    // Calculate Total Equity from detail fields to match Data Review page
                    const totalEquity = ownersCapital + ownersDraw + commonStock + preferredStock + retainedEarnings + additionalPaidInCapital + treasuryStock;
                    
                    // Calculate Total Liabilities & Equity to match Data Review page (do NOT use imported totalLAndE)
                    const totalLAndE = totalLiabilities + totalEquity;
                    
                    return { label: p.label, cash, ar, inventory, otherCA, tca, fixedAssets, otherAssets, totalAssets, ap, loc, otherCL, tcl, ltd, totalLiabilities, ownersCapital, ownersDraw, commonStock, preferredStock, retainedEarnings, additionalPaidInCapital, treasuryStock, paidInCapital, totalEquity, totalLAndE };
                  });
                  const Row = ({ label, values, indent = 0, bold = false }: any) => (
                    <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: bold ? '14px' : '13px', fontWeight: bold ? '600' : 'normal' }}>
                      <div style={{ color: bold ? '#475569' : '#64748b', paddingLeft: `${indent}px` }}>{label}</div>
                      {values.map((v: number, i: number) => (
                        <div key={i} style={{ textAlign: 'right', color: bold ? '#475569' : '#64748b' }}>${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      ))}
                    </div>
                  );
                  return (
                    <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
                      <div style={{ marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Comparative Balance Sheet</h2>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>{periodLabel} - {statementDisplay === 'monthly' ? 'Monthly' : statementDisplay === 'quarterly' ? 'Quarterly' : 'Annual'}</div>
                      </div>
                      <div style={{ minWidth: `${200 + (balanceData.length * 110)}px` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '12px 0', borderBottom: '2px solid #1e293b', fontWeight: '600', color: '#1e293b' }}>
                          <div>Line Item</div>
                          {balanceData.map((p, i) => <div key={i} style={{ textAlign: 'right' }}>{p.label}</div>)}
                        </div>
                        <div style={{ margin: '8px 0 4px', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>ASSETS</div>
                        <div style={{ margin: '8px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Current Assets</div>
                        {balanceData.some(p => p.cash !== 0) && <Row label="Cash" values={balanceData.map(p => p.cash)} indent={20} />}
                        {balanceData.some(p => p.ar !== 0) && <Row label="Accounts Receivable" values={balanceData.map(p => p.ar)} indent={20} />}
                        {balanceData.some(p => p.inventory !== 0) && <Row label="Inventory" values={balanceData.map(p => p.inventory)} indent={20} />}
                        {balanceData.some(p => p.otherCA !== 0) && <Row label="Other Current Assets" values={balanceData.map(p => p.otherCA)} indent={20} />}
                        <Row label="Total Current Assets" values={balanceData.map(p => p.tca)} bold />
                        {balanceData.some(p => p.fixedAssets !== 0) && <Row label="Fixed Assets" values={balanceData.map(p => p.fixedAssets)} />}
                        {balanceData.some(p => p.otherAssets !== 0) && <Row label="Other Assets" values={balanceData.map(p => p.otherAssets)} />}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '10px 8px', background: '#dbeafe', borderRadius: '4px', margin: '8px 0', fontWeight: '700', color: '#1e40af' }}>
                          <div>TOTAL ASSETS</div>
                          {balanceData.map((p, i) => <div key={i} style={{ textAlign: 'right' }}>${p.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>)}
                        </div>
                        <div style={{ margin: '12px 0 4px', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>LIABILITIES</div>
                        <div style={{ margin: '8px 0 4px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Current Liabilities</div>
                        {balanceData.some(p => p.ap !== 0) && <Row label="Accounts Payable" values={balanceData.map(p => p.ap)} indent={20} />}
                        {balanceData.some(p => p.loc !== 0) && <Row label="Line of Credit" values={balanceData.map(p => p.loc)} indent={20} />}
                        {balanceData.some(p => p.otherCL !== 0) && <Row label="Other Current Liabilities" values={balanceData.map(p => p.otherCL)} indent={20} />}
                        <Row label="Total Current Liabilities" values={balanceData.map(p => p.tcl)} bold />
                        {balanceData.some(p => p.ltd !== 0) && <Row label="Long-Term Debt" values={balanceData.map(p => p.ltd)} />}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '10px 8px', background: '#fef3c7', borderRadius: '4px', margin: '8px 0', fontWeight: '700', color: '#92400e' }}>
                          <div>TOTAL LIABILITIES</div>
                          {balanceData.map((p, i) => <div key={i} style={{ textAlign: 'right' }}>${p.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>)}
                        </div>
                        <div style={{ margin: '12px 0 4px', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>EQUITY</div>
                        {balanceData.some(p => p.ownersCapital !== 0) && <Row label="Owner's Capital" values={balanceData.map(p => p.ownersCapital)} indent={20} />}
                        {balanceData.some(p => p.ownersDraw !== 0) && <Row label="Owner's Draw" values={balanceData.map(p => p.ownersDraw)} indent={20} />}
                        {balanceData.some(p => p.commonStock !== 0) && <Row label="Common Stock" values={balanceData.map(p => p.commonStock)} indent={20} />}
                        {balanceData.some(p => p.preferredStock !== 0) && <Row label="Preferred Stock" values={balanceData.map(p => p.preferredStock)} indent={20} />}
                        {balanceData.some(p => p.retainedEarnings !== 0) && (
                          <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '4px 0', fontSize: '13px' }}>
                            <div style={{ color: '#64748b', paddingLeft: '20px' }}>Retained Earnings</div>
                            {balanceData.map((p, i) => (
                              <div key={i} style={{ textAlign: 'right', color: '#64748b' }}>
                                {p.retainedEarnings >= 0 ? '$' : '($'}{Math.abs(p.retainedEarnings).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{p.retainedEarnings < 0 ? ')' : ''}
                              </div>
                            ))}
                          </div>
                        )}
                        {balanceData.some(p => p.additionalPaidInCapital !== 0) && <Row label="Additional Paid-In Capital" values={balanceData.map(p => p.additionalPaidInCapital)} indent={20} />}
                        {balanceData.some(p => p.treasuryStock !== 0) && <Row label="Treasury Stock" values={balanceData.map(p => p.treasuryStock)} indent={20} />}
                        {balanceData.some(p => p.paidInCapital !== 0) && <Row label="Paid-in Capital" values={balanceData.map(p => p.paidInCapital)} indent={20} />}
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '12px 8px', background: '#dcfce7', borderRadius: '4px', margin: '12px 0 0', fontWeight: '700', fontSize: '15px' }}>
                          <div style={{ color: '#166534' }}>TOTAL EQUITY</div>
                          {balanceData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: p.totalEquity >= 0 ? '#166534' : '#991b1b' }}>
                              {p.totalEquity >= 0 ? '$' : '($'}{Math.abs(p.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{p.totalEquity < 0 ? ')' : ''}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${balanceData.length}, 110px)`, gap: '4px', padding: '12px 8px', background: '#f1f5f9', borderRadius: '4px', margin: '16px 0 0', fontWeight: '700', fontSize: '15px' }}>
                          <div style={{ color: '#1e293b' }}>TOTAL LIABILITIES & EQUITY</div>
                          {balanceData.map((p, i) => (
                            <div key={i} style={{ textAlign: 'right', color: '#1e293b' }}>
                              ${p.totalLAndE.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // For balance sheet, use Data Review fields and imported totals
                const cash = latestMonth.cash || 0;
                const ar = latestMonth.ar || 0;
                const inventory = latestMonth.inventory || 0;
                const otherCA = latestMonth.otherCA || 0;
                const tca = latestMonth.tca || 0;  // Use imported total
                
                const fixedAssets = latestMonth.fixedAssets || 0;
                const otherAssets = latestMonth.otherAssets || 0;
                const totalAssets = latestMonth.totalAssets || 0;  // Use imported total
                
                const ap = latestMonth.ap || 0;
                const loc = latestMonth.loc || 0;
                const otherCL = latestMonth.otherCL || 0;
                const tcl = latestMonth.tcl || 0;  // Use imported total
                
                const ltd = latestMonth.ltd || 0;
                const totalLiabilities = latestMonth.totalLiab || 0;  // Use imported total
                
                // All equity detail fields
                // Equity - Use imported total
                const ownersCapital = latestMonth.ownersCapital || 0;
                const ownersDraw = latestMonth.ownersDraw || 0;
                const commonStock = latestMonth.commonStock || 0;
                const preferredStock = latestMonth.preferredStock || 0;
                const retainedEarnings = latestMonth.retainedEarnings || 0;
                const additionalPaidInCapital = latestMonth.additionalPaidInCapital || 0;
                const treasuryStock = latestMonth.treasuryStock || 0;
                const paidInCapital = latestMonth.paidInCapital || 0;
                const totalEquity = latestMonth.totalEquity || 0;  // Use imported total
                
                const totalLAndE = latestMonth.totalLAndE || 0;  // Use imported total
                
                const latestDate = new Date(latestMonth.date || latestMonth.month);
                const asOfDate = latestDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                
                return (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Balance Sheet</h2>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>As of {asOfDate} (Period: {periodLabel})</div>
                    </div>

                    {/* ASSETS */}
                    <div style={{ marginBottom: '32px' }}>
                      <div style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b', marginBottom: '12px' }}>ASSETS</div>
                      
                      {/* Current Assets */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Current Assets</div>
                        {cash !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Cash</span>
                            <span style={{ color: '#64748b' }}>${cash.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {ar !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Accounts Receivable</span>
                            <span style={{ color: '#64748b' }}>${ar.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {inventory !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Inventory</span>
                            <span style={{ color: '#64748b' }}>${inventory.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {otherCA !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Other Current Assets</span>
                            <span style={{ color: '#64748b' }}>${otherCA.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 8px 10px', borderTop: '1px solid #cbd5e1', marginTop: '4px', fontWeight: '600' }}>
                          <span style={{ color: '#475569' }}>Total Current Assets</span>
                          <span style={{ color: '#475569' }}>${tca.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>

                      {/* Non-Current Assets */}
                      {fixedAssets !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Fixed Assets</span>
                          <span style={{ color: '#64748b' }}>${fixedAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {otherAssets !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Other Assets</span>
                          <span style={{ color: '#64748b' }}>${otherAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}

                      {/* TOTAL ASSETS */}
                      <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e40af' }}>TOTAL ASSETS</span>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#1e40af' }}>
                            ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* LIABILITIES */}
                    <div style={{ marginBottom: '32px' }}>
                      <div style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b', marginBottom: '12px' }}>LIABILITIES</div>
                      
                      {/* Current Liabilities */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Current Liabilities</div>
                        {ap !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Accounts Payable</span>
                            <span style={{ color: '#64748b' }}>${ap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {loc !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Line of Credit</span>
                            <span style={{ color: '#64748b' }}>${loc.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {otherCL !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                            <span style={{ color: '#64748b' }}>Other Current Liabilities</span>
                            <span style={{ color: '#64748b' }}>${otherCL.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 8px 10px', borderTop: '1px solid #cbd5e1', marginTop: '4px', fontWeight: '600' }}>
                          <span style={{ color: '#475569' }}>Total Current Liabilities</span>
                          <span style={{ color: '#475569' }}>${tcl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>

                      {/* Long-Term Debt */}
                      {ltd !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Long-Term Debt</span>
                          <span style={{ color: '#64748b' }}>${ltd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}

                      {/* TOTAL LIABILITIES */}
                      <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#92400e' }}>TOTAL LIABILITIES</span>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#92400e' }}>
                            ${totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* EQUITY */}
                    <div style={{ marginBottom: '32px' }}>
                      <div style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b', marginBottom: '12px' }}>EQUITY</div>
                      {ownersCapital !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Owner's Capital</span>
                          <span style={{ color: '#64748b' }}>${ownersCapital.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {ownersDraw !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Owner's Draw</span>
                          <span style={{ color: '#64748b' }}>${ownersDraw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {commonStock !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Common Stock</span>
                          <span style={{ color: '#64748b' }}>${commonStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {preferredStock !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Preferred Stock</span>
                          <span style={{ color: '#64748b' }}>${preferredStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {retainedEarnings !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Retained Earnings</span>
                          <span style={{ color: '#64748b' }}>
                            {retainedEarnings >= 0 ? '$' : '($'}{Math.abs(retainedEarnings).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{retainedEarnings < 0 ? ')' : ''}
                          </span>
                        </div>
                      )}
                      {additionalPaidInCapital !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Additional Paid-In Capital</span>
                          <span style={{ color: '#64748b' }}>${additionalPaidInCapital.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {treasuryStock !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Treasury Stock</span>
                          <span style={{ color: '#64748b' }}>${treasuryStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      {paidInCapital > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 4px 20px', fontSize: '14px' }}>
                          <span style={{ color: '#64748b' }}>Paid-in Capital</span>
                          <span style={{ color: '#64748b' }}>${paidInCapital.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      )}

                      {/* TOTAL EQUITY */}
                      <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#166534' }}>TOTAL EQUITY</span>
                          <span style={{ fontWeight: '700', fontSize: '16px', color: '#166534' }}>
                            {totalEquity >= 0 ? '$' : '($'}{Math.abs(totalEquity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{totalEquity < 0 ? ')' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* TOTAL LIABILITIES & EQUITY */}
                    <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px', marginTop: '32px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b' }}>TOTAL LIABILITIES & EQUITY</span>
                        <span style={{ fontWeight: '700', fontSize: '18px', color: '#1e293b' }}>
                          ${totalLAndE.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      {Math.abs(totalAssets - totalLAndE) > 0.01 && (
                        <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px', textAlign: 'right' }}>
                  ⚖️ Balance check: Assets - (Liabilities + Equity) = ${(totalAssets - totalLAndE).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            }
            
            else {
              return (
                <div style={{ background: 'white', borderRadius: '12px', padding: '48px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', minHeight: '400px', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
                    📄 Financial Statement Viewer
                  </div>
                  <p style={{ fontSize: '14px', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
                    Select options above to view financial statements.
                  </p>
                </div>
              );
            }
          })()}
          </>
          )}

          {/* Line of Business Reporting Tab */}
          {financialStatementsTab === 'line-of-business' && (
            <LOBReportingTab
              company={company}
              selectedCompanyId={selectedCompanyId}
              accountMappings={aiMappings}
              statementType={statementType}
              selectedLineOfBusiness={selectedLineOfBusiness}
              statementPeriod={statementPeriod}
              statementDisplay={statementDisplay}
              onStatementTypeChange={setStatementType}
              onLineOfBusinessChange={setSelectedLineOfBusiness}
              onPeriodChange={setStatementPeriod}
              onDisplayChange={setStatementDisplay}
              onNavigateToAccountMappings={() => {
                setCurrentView('admin');
                setAdminDashboardTab('data-mapping');
              }}
            />
          )}
        </div>
      )}

      {/* Financial Statements View - No Data Available */}
      {currentView === 'financial-statements' && selectedCompanyId && monthly.length === 0 && (
        <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Statements</h1>
            {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '48px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', minHeight: '400px', textAlign: 'center', marginTop: '32px' }}>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>
              📋 No Financial Data Available
            </div>
            <p style={{ fontSize: '14px', color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
              Please import financial data via CSV or sync from QuickBooks to view financial statements.
            </p>
          </div>
        </div>
      )}

      {/* Team Assessment - Questionnaire View */}
      {(() => {
        const hasCompanyId = selectedCompanyId || currentUser?.companyId;
        const hasCorrectRole = (currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant';
        const canView = currentView === 'ma-questionnaire' && hasCompanyId && hasCorrectRole;
        
        console.log('?? Questionnaire render check:', {
          currentView,
          isQuestionnaireView: currentView === 'ma-questionnaire',
          selectedCompanyId,
          userCompanyId: currentUser?.companyId,
          hasCompanyId,
          role: currentUser?.role,
          userType: currentUser?.userType,
          hasCorrectRole,
          canView
        });
        
        return canView;
      })() && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Team Assessment Questionnaire</h1>
            {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          </div>
          
          {currentUser?.role === 'consultant' && (
            <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '12px', padding: '20px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>Consultant View Only</h3>
              <p style={{ fontSize: '14px', color: '#78350f', margin: 0 }}>
                As a consultant, you can view this questionnaire but cannot fill it out. Only company users can complete assessments. 
                Navigate to "View Assessments" in the Administrator Dashboard to see user responses.
              </p>
            </div>
          )}
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: currentUser?.role === 'consultant' ? 0.6 : 1, pointerEvents: currentUser?.role === 'consultant' ? 'none' : 'auto' }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>Rating Scale</h3>
              <div style={{ fontSize: '13px', color: '#0c4a6e', lineHeight: '1.6' }}>
                <strong>1:</strong> No evidence to support practices or any knowledge of subject<br />
                <strong>2:</strong> Limited practices in place, limited knowledge of subject<br />
                <strong>3:</strong> Basic practices in place, basic awareness of subject<br />
                <strong>4:</strong> Clear practices in place, above average knowledge of subject<br />
                <strong>5:</strong> Extensive practices in place, extensive knowledge of subject
              </div>
            </div>

            {assessmentData.map((category) => (
              <div key={category.id} style={{ marginBottom: '32px', background: '#f8fafc', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
                  {category.id}. {category.name}
                </h2>
                
                {category.questions.map((question) => (
                  <div key={question.id} style={{ marginBottom: '16px', background: 'white', borderRadius: '8px', padding: '16px', border: unansweredQuestions.includes(question.id) ? '2px solid #ef4444' : '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: '500' }}>
                      {question.text}
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <label key={rating} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '8px 12px', background: assessmentResponses[question.id] === rating ? '#667eea' : '#f1f5f9', color: assessmentResponses[question.id] === rating ? 'white' : '#475569', borderRadius: '6px', fontSize: '14px', fontWeight: '600', border: assessmentResponses[question.id] === rating ? '2px solid #667eea' : '1px solid #cbd5e1', transition: 'all 0.2s' }}>
                          <input 
                            type="radio" 
                            name={question.id} 
                            value={rating} 
                            checked={assessmentResponses[question.id] === rating}
                            onChange={() => setAssessmentResponses(prev => ({ ...prev, [question.id]: rating }))}
                            style={{ display: 'none' }}
                          />
                          {rating}
                        </label>
                      ))}
                    </div>
                    {unansweredQuestions.includes(question.id) && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                        ⭐ Please select a rating
                      </div>
                    )}
                  </div>
                ))}
                
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    Notes for {category.name}:
                  </label>
                  <textarea
                    value={assessmentNotes[category.id] || ''}
                    onChange={(e) => setAssessmentNotes(prev => ({ ...prev, [category.id]: e.target.value }))}
                    style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                    placeholder="Add notes or action items..."
                  />
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
              <button 
                onClick={async () => {
                  const allQuestions = assessmentData.flatMap(cat => cat.questions.map(q => q.id));
                  const unanswered = allQuestions.filter(qId => !assessmentResponses[qId]);
                  setUnansweredQuestions(unanswered);
                  
                  if (unanswered.length === 0) {
                    setIsLoading(true);
                    try {
                      const totalScore = Object.values(assessmentResponses).reduce((sum, val) => sum + val, 0) / Object.keys(assessmentResponses).length;
                      
                      const { record } = await assessmentsApi.create({
                        userId: currentUser!.id,
                        companyId: selectedCompanyId,
                        responses: assessmentResponses,
                        notes: assessmentNotes,
                        overallScore: totalScore,
                        isCompleted: true
                      });
                      
                      // Add to local state with proper structure
                      const assessmentRecord: AssessmentRecord = {
                        id: record.id,
                        userEmail: currentUser?.email || '',
                        userName: currentUser?.name || '',
                        companyId: selectedCompanyId,
                        companyName: company?.name || '',
                        responses: assessmentResponses,
                        notes: assessmentNotes,
                        completedDate: record.completedAt,
                        overallScore: totalScore
                      };
                      
                      setAssessmentRecords(prev => [...prev, assessmentRecord]);
                      alert('Assessment saved successfully!');
                      setCurrentView('ma-your-results');
                    } catch (error) {
                      alert(error instanceof ApiError ? error.message : 'Failed to save assessment');
                    } finally {
                      setIsLoading(false);
                    }
                  } else {
                    alert(`Please answer all ${unanswered.length} unanswered question(s) before saving.`);
                  }
                }}
                disabled={isLoading}
                style={{ padding: '14px 32px', background: isLoading ? '#94a3b8' : '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(102,126,234,0.3)', opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? 'Saving...' : 'Save Assessment'}
              </button>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to reset all responses?')) {
                    setAssessmentResponses({});
                    setAssessmentNotes({});
                    setUnansweredQuestions([]);
                  }
                }}
                style={{ padding: '14px 32px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
          </>
          )}

      {/* Team Assessment - Your Results View */}
      {currentView === 'ma-your-results' && selectedCompanyId && ((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
        <MAYourResultsView
          selectedCompanyId={selectedCompanyId}
          currentUser={currentUser}
          companyName={companyName}
          assessmentRecords={assessmentRecords}
          assessmentData={assessmentData}
          assessmentResponses={assessmentResponses}
          setCurrentView={setCurrentView}
        />
      )}

      {/* Team Assessment Views - Available to all users including assessment users */}
          {/* Team Assessment - Welcome View */}
      {currentView === 'ma-welcome' && ((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
        <MAWelcomeView
          companyName={companyName}
          assessmentData={assessmentData}
          setCurrentView={setCurrentView}
        />
      )}

      {/* Team Assessment - Scores Summary View */}
      {currentView === 'ma-scores-summary' && selectedCompanyId && ((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
        <MAScoresSummaryView
          selectedCompanyId={selectedCompanyId}
          assessmentData={assessmentData}
          assessmentRecords={assessmentRecords}
        />
      )}

      {/* Team Assessment - Scoring Guide View */}
      {currentView === 'ma-scoring-guide' && ((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
        <MAScoringGuideView />
      )}

      {/* Team Assessment - Charts View */}
      {currentView === 'ma-charts' && selectedCompanyId && ((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Assessment Charts</h1>
          
          {(currentUser?.role === 'consultant' ? assessmentRecords.filter(r => r.companyId === selectedCompanyId).length === 0 : Object.keys(assessmentResponses).length === 0) ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>No Assessment Data</h2>
              <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '12px' }}>
                {currentUser?.role === 'consultant' ? 'No users have completed assessments for this company yet.' : 'Please complete the questionnaire first to view charts.'}
              </p>
              {currentUser?.role !== 'consultant' && (
                <button 
                  onClick={() => setCurrentView('ma-questionnaire')}
                  style={{ padding: '12px 32px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Go to Questionnaire
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                  {currentUser?.role === 'consultant' ? 'Average Category Scores - All Participants' : 'Category Scores - Bar Chart'}
                </h2>
                
                <div style={{ padding: '20px' }}>
              {assessmentData.map((category) => {
                const categoryQuestions = category.questions.map(q => q.id);
                
                let avgScore = 0;
                if (currentUser?.role === 'consultant') {
                  // Calculate average across all assessment records for this company
                  const companyRecords = assessmentRecords.filter(r => r.companyId === selectedCompanyId);
                  const allCategoryScores = companyRecords.map(record => {
                    const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                    return categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                  }).filter(s => s > 0);
                  avgScore = allCategoryScores.length > 0 ? allCategoryScores.reduce((sum, val) => sum + val, 0) / allCategoryScores.length : 0;
                } else {
                  // Use current user's responses
                  const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                  avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                }
                
                const percentage = (avgScore / 5) * 100;
                
                return (
                  <div key={category.id} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{category.name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(2)} / 5.0</span>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '24px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)', height: '100%', width: `${percentage}%`, transition: 'width 0.5s', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>
                        {percentage > 15 && <span style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>{percentage.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Category Scores - Radar Chart</h2>
            
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <svg width="500" height="500" viewBox="0 0 500 500">
                <g transform="translate(250, 250)">
                  {/* Draw concentric circles */}
                  {[1, 2, 3, 4, 5].map((level) => (
                    <circle
                      key={level}
                      cx="0"
                      cy="0"
                      r={level * 40}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                  ))}
                  
                  {/* Draw axis lines and labels */}
                  {assessmentData.map((category, idx) => {
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    const x2 = Math.cos(angle) * 200;
                    const y2 = Math.sin(angle) * 200;
                    const labelX = Math.cos(angle) * 220;
                    const labelY = Math.sin(angle) * 220;
                    
                    return (
                      <g key={category.id}>
                        <line x1="0" y1="0" x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="1" />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#475569"
                          dominantBaseline="middle"
                        >
                          {category.name.length > 20 ? category.name.substring(0, 18) + '...' : category.name}
                        </text>
                      </g>
                    );
                  })}
                  
                  {/* Draw data polygon */}
                  <polygon
                    points={assessmentData.map((category, idx) => {
                      const categoryQuestions = category.questions.map(q => q.id);
                      
                      let avgScore = 0;
                      if (currentUser?.role === 'consultant') {
                        // Calculate average across all assessment records for this company
                        const companyRecords = assessmentRecords.filter(r => r.companyId === selectedCompanyId);
                        const allCategoryScores = companyRecords.map(record => {
                          const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                          return categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                        }).filter(s => s > 0);
                        avgScore = allCategoryScores.length > 0 ? allCategoryScores.reduce((sum, val) => sum + val, 0) / allCategoryScores.length : 0;
                      } else {
                        // Use current user's responses
                        const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                        avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                      }
                      
                      const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                      const radius = (avgScore / 5) * 200;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="rgba(102, 126, 234, 0.2)"
                    stroke="#667eea"
                    strokeWidth="3"
                  />
                  
                  {/* Draw data points */}
                  {assessmentData.map((category, idx) => {
                    const categoryQuestions = category.questions.map(q => q.id);
                    
                    let avgScore = 0;
                    if (currentUser?.role === 'consultant') {
                      // Calculate average across all assessment records for this company
                      const companyRecords = assessmentRecords.filter(r => r.companyId === selectedCompanyId);
                      const allCategoryScores = companyRecords.map(record => {
                        const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                        return categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                      }).filter(s => s > 0);
                      avgScore = allCategoryScores.length > 0 ? allCategoryScores.reduce((sum, val) => sum + val, 0) / allCategoryScores.length : 0;
                    } else {
                      // Use current user's responses
                      const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                      avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                    }
                    
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    const radius = (avgScore / 5) * 200;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    
                    return (
                      <circle key={category.id} cx={x} cy={y} r="6" fill="#667eea" stroke="white" strokeWidth="2">
                        <title>{category.name}: {avgScore.toFixed(2)}</title>
                      </circle>
                    );
                  })}
                  
                  {/* Center circle with legend */}
                  <circle cx="0" cy="0" r="30" fill="white" stroke="#cbd5e1" strokeWidth="1" />
                  <text x="0" y="-5" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">Scale</text>
                  <text x="0" y="8" textAnchor="middle" fontSize="10" fill="#64748b">1 to 5</text>
                </g>
              </svg>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* Custom Print View - For Consultants and Company Users */}
      {currentView === 'custom-print' && (currentUser?.role === 'consultant' || (currentUser?.role === 'user' && currentUser?.userType === 'company')) && (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>Custom Print Package</h1>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '20px' }}>
              Select the reports you want to include in your custom print package
            </p>

            <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' }}>
              <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>Financial Data Reports</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.mda} onChange={(e) => updatePrintSelection('mda', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      MD&A
                    </label>
                    <select value={printPackageOrientations.mda} onChange={(e) => updatePrintOrientation('mda', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.priorityRatios} onChange={(e) => updatePrintSelection('priorityRatios', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Priority Ratios
                    </label>
                    <select value={printPackageOrientations.priorityRatios} onChange={(e) => updatePrintOrientation('priorityRatios', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.workingCapital} onChange={(e) => updatePrintSelection('workingCapital', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Working Capital
                    </label>
                    <select value={printPackageOrientations.workingCapital} onChange={(e) => updatePrintOrientation('workingCapital', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.dashboard} onChange={(e) => updatePrintSelection('dashboard', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Dashboard
                    </label>
                    <select value={printPackageOrientations.dashboard} onChange={(e) => updatePrintOrientation('dashboard', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>

                  <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>Cash Flow</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.cashFlow4Quarters} onChange={(e) => updatePrintSelection('cashFlow4Quarters', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Last 4 Quarters
                    </label>
                    <select value={printPackageOrientations.cashFlow4Quarters} onChange={(e) => updatePrintOrientation('cashFlow4Quarters', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.cashFlow3Years} onChange={(e) => updatePrintSelection('cashFlow3Years', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Last 3 Years
                    </label>
                    <select value={printPackageOrientations.cashFlow3Years} onChange={(e) => updatePrintOrientation('cashFlow3Years', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>

                  <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>Financial Statements</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.incomeStatement12MonthsQuarterly} onChange={(e) => updatePrintSelection('incomeStatement12MonthsQuarterly', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Income Statement - 12M Quarterly
                    </label>
                    <select value={printPackageOrientations.incomeStatement12MonthsQuarterly} onChange={(e) => updatePrintOrientation('incomeStatement12MonthsQuarterly', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.incomeStatement3YearsAnnual} onChange={(e) => updatePrintSelection('incomeStatement3YearsAnnual', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Income Statement - 3Y Annual
                    </label>
                    <select value={printPackageOrientations.incomeStatement3YearsAnnual} onChange={(e) => updatePrintOrientation('incomeStatement3YearsAnnual', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.balanceSheet12MonthsQuarterly} onChange={(e) => updatePrintSelection('balanceSheet12MonthsQuarterly', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Balance Sheet - 12M Quarterly
                    </label>
                    <select value={printPackageOrientations.balanceSheet12MonthsQuarterly} onChange={(e) => updatePrintOrientation('balanceSheet12MonthsQuarterly', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.balanceSheet3YearsAnnual} onChange={(e) => updatePrintSelection('balanceSheet3YearsAnnual', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Balance Sheet - 3Y Annual
                    </label>
                    <select value={printPackageOrientations.balanceSheet3YearsAnnual} onChange={(e) => updatePrintOrientation('balanceSheet3YearsAnnual', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.profile} onChange={(e) => updatePrintSelection('profile', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Company Profile
                    </label>
                    <select value={printPackageOrientations.profile} onChange={(e) => updatePrintOrientation('profile', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>Operations Reports</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsDashboard} onChange={(e) => updatePrintSelection('opsDashboard', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Ops Dashboard
                    </label>
                    <select value={printPackageOrientations.opsDashboard} onChange={(e) => updatePrintOrientation('opsDashboard', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ marginTop: '2px', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>Cash Forecast</div>
                  <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>Income Statement Forecast (Cash Basis)</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsCashBasisIncomeStatementForecast} onChange={(e) => updatePrintSelection('opsCashBasisIncomeStatementForecast', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Income Statement Forecast
                      </label>
                      <select value={printPackageOrientations.opsCashBasisIncomeStatementForecast} onChange={(e) => updatePrintOrientation('opsCashBasisIncomeStatementForecast', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsCashBasisCashForecast} onChange={(e) => updatePrintSelection('opsCashBasisCashForecast', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Cash Forecast
                      </label>
                      <select value={printPackageOrientations.opsCashBasisCashForecast} onChange={(e) => updatePrintOrientation('opsCashBasisCashForecast', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsCashBasisGraphs} onChange={(e) => updatePrintSelection('opsCashBasisGraphs', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Graphs
                      </label>
                      <select value={printPackageOrientations.opsCashBasisGraphs} onChange={(e) => updatePrintOrientation('opsCashBasisGraphs', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155', marginTop: '4px' }}>Accrual Basis</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsAccrualIncomeStatementForecast} onChange={(e) => updatePrintSelection('opsAccrualIncomeStatementForecast', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Income Statement Forecast
                      </label>
                      <select value={printPackageOrientations.opsAccrualIncomeStatementForecast} onChange={(e) => updatePrintOrientation('opsAccrualIncomeStatementForecast', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsAccrualCashForecast} onChange={(e) => updatePrintSelection('opsAccrualCashForecast', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Cash Forecast
                      </label>
                      <select value={printPackageOrientations.opsAccrualCashForecast} onChange={(e) => updatePrintOrientation('opsAccrualCashForecast', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                        <input type="checkbox" checked={printPackageSelections.opsAccrualGraphs} onChange={(e) => updatePrintSelection('opsAccrualGraphs', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                        Graphs
                      </label>
                      <select value={printPackageOrientations.opsAccrualGraphs} onChange={(e) => updatePrintOrientation('opsAccrualGraphs', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsCustomers} onChange={(e) => updatePrintSelection('opsCustomers', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Customers
                    </label>
                    <select value={printPackageOrientations.opsCustomers} onChange={(e) => updatePrintOrientation('opsCustomers', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsARAging} onChange={(e) => updatePrintSelection('opsARAging', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      AR Aging
                    </label>
                    <select value={printPackageOrientations.opsARAging} onChange={(e) => updatePrintOrientation('opsARAging', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsAPAging} onChange={(e) => updatePrintSelection('opsAPAging', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      AP Aging
                    </label>
                    <select value={printPackageOrientations.opsAPAging} onChange={(e) => updatePrintOrientation('opsAPAging', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsProducts} onChange={(e) => updatePrintSelection('opsProducts', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Products
                    </label>
                    <select value={printPackageOrientations.opsProducts} onChange={(e) => updatePrintOrientation('opsProducts', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsInventory} onChange={(e) => updatePrintSelection('opsInventory', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Inventory
                    </label>
                    <select value={printPackageOrientations.opsInventory} onChange={(e) => updatePrintOrientation('opsInventory', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                      <input type="checkbox" checked={printPackageSelections.opsDailyFinancials} onChange={(e) => updatePrintSelection('opsDailyFinancials', e.target.checked)} style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer' }} />
                      Daily Financials
                    </label>
                    <select value={printPackageOrientations.opsDailyFinancials} onChange={(e) => updatePrintOrientation('opsDailyFinancials', e.target.value as 'portrait' | 'landscape')} style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
              <button
                onClick={handleGeneratePrintPackage}
                style={{
                  padding: '14px 32px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#5568d3'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#667eea'}
              >
                🖨️ Generate Print Package
              </button>
              <button
                onClick={() => {
                  setPrintPackageSelections(defaultPrintPackageSelections);
                  setPrintPackageOrientations(defaultPrintPackageOrientations);
                }}
                style={{
                  padding: '14px 32px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e2e8f0';
                  e.currentTarget.style.borderColor = '#94a3b8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
              >
                Clear All
              </button>
            </div>

            {/* Info Box */}
            <div style={{ marginTop: '32px', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertCircle size={20} color="#1e40af" />
                <div style={{ fontSize: '14px', color: '#1e40af', lineHeight: '1.6' }}>
                  <strong>How it works:</strong> Select the reports you want to include, then click "Generate Print Package" to create a combined PDF with all selected reports in a single document ready for printing.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </main>
      </div>

      {/* Delete Company Confirmation Modal - Global (accessible from all views) */}
      {showDeleteConfirmation && companyToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '500px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Delete Company</h2>
              <p style={{ fontSize: '16px', color: '#64748b', lineHeight: '1.6' }}>
                Are you sure you want to delete <strong style={{ color: '#ef4444' }}>"{companyToDelete.companyName}"</strong>?
              </p>
              <p style={{ fontSize: '14px', color: '#ef4444', marginTop: '12px', fontWeight: '600' }}>
                This action cannot be undone. All data associated with this company will be permanently deleted.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirmation(false);
                  setCompanyToDelete(null);
                }}
                style={{
                  padding: '12px 24px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCompany}
                style={{
                  padding: '12px 24px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                Delete Company
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Dynamic import to disable SSR for this complex component
const DynamicFinancialScorePage = dynamic(() => Promise.resolve(FinancialScorePage), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

export default DynamicFinancialScorePage;


