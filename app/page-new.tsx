'use client';

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload } from 'lucide-react';
import { User, Company, Consultant, MonthlyDataRow, Mappings, FinancialDataRecord } from './types';
import { US_STATES } from './constants/states';
import { authApi, companiesApi, financialsApi } from '@/lib/api-client';
import InactivityLogout from './components/InactivityLogout';
import SimpleChart from './components/SimpleChart';
import { parseDateLike, monthKey, sum, pctChange } from './utils/financial';
import { exportMonthlyData, exportRatios } from './utils/excel-export';

export default function FinancialScorePage() {
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
  const [isLoading, setIsLoading] = useState(false);
  
  // State - Companies
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  
  // State - Current View
  const [currentView, setCurrentView] = useState<'upload' | 'admin' | 'siteadmin' | 'dashboard' | 'kpis' | 'financial-statements' | 'cash-flow' | string>('upload');
  
  // State - Data Management
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mappings>({ date: '' });
  const [monthly, setMonthly] = useState<MonthlyDataRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploadStep, setUploadStep] = useState<'upload' | 'mapping' | 'review'>('upload');
  const [savedFinancials, setSavedFinancials] = useState<FinancialDataRecord[]>([]);

  // Handle Login
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both email and password');
      return;
    }
    
    setIsLoading(true);
    setLoginError('');
    
    try {
      const user = await authApi.login(loginEmail.toLowerCase().trim(), loginPassword);
      setCurrentUser(user);
      setIsLoggedIn(true);
      setLoginEmail('');
      setLoginPassword('');
      
      // Set appropriate view based on user role
      if (user.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else if (user.role === 'consultant') {
        setCurrentView('admin');
        // Load companies for consultant
        companiesApi.getByConsultant(user.email).then(data => {
          if (data.companies) {
            setCompanies(data.companies);
            if (data.companies.length > 0) {
              setSelectedCompanyId(data.companies[0].id);
            }
          }
        });
      } else {
        setCurrentView('upload');
        setSelectedCompanyId(user.companyId || '');
      }
    } catch (error: any) {
      setLoginError(error.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentView('upload');
    setCompanies([]);
    setSelectedCompanyId('');
    setMonthly([]);
    setRawRows([]);
    setColumns([]);
    setMapping({ date: '' });
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      
      if (data.length > 0) {
        const cols = Object.keys(data[0] as any);
        setColumns(cols);
        setRawRows(data);
        setUploadStep('mapping');
      }
    };
    
    reader.readAsBinaryString(file);
  };

  // Process raw data into monthly format
  const processData = () => {
    if (!mapping.date || rawRows.length === 0) {
      alert('Please complete the column mapping first');
      return;
    }

    const N = (key: string | undefined) => {
      if (!key) return 0;
      const val = (row as any)[key];
      if (val == null || val === '') return 0;
      const num = Number(val);
      return Number.isFinite(num) ? num : 0;
    };

    const processedRows: any[] = [];
    
    for (const row of rawRows) {
      if (!row || typeof row !== 'object') continue;
      const dateVal = (row as any)[mapping.date];
      if (dateVal == null || dateVal === '') continue;
      const date = parseDateLike(dateVal);
      if (!date) continue;

      processedRows.push({
        date,
        month: monthKey(date),
        revenue: N(mapping.revenue),
        expense: N(mapping.expense),
        cogsPayroll: N(mapping.cogsPayroll),
        cogsOwnerPay: N(mapping.cogsOwnerPay),
        cogsContractors: N(mapping.cogsContractors),
        cogsMaterials: N(mapping.cogsMaterials),
        cogsCommissions: N(mapping.cogsCommissions),
        cogsOther: N(mapping.cogsOther),
        cogsTotal: N(mapping.cogsTotal),
        opexSalesMarketing: N(mapping.opexSalesMarketing),
        rentLease: N(mapping.rentLease),
        utilities: N(mapping.utilities),
        equipment: N(mapping.equipment),
        travel: N(mapping.travel),
        professionalServices: N(mapping.professionalServices),
        insurance: N(mapping.insurance),
        opexOther: N(mapping.opexOther),
        opexPayroll: N(mapping.opexPayroll),
        ownersBasePay: N(mapping.ownersBasePay),
        ownersRetirement: N(mapping.ownersRetirement),
        contractorsDistribution: N(mapping.contractorsDistribution),
        interestExpense: N(mapping.interestExpense),
        depreciationExpense: N(mapping.depreciationExpense),
        operatingExpenseTotal: N(mapping.operatingExpenseTotal),
        nonOperatingIncome: N(mapping.nonOperatingIncome),
        extraordinaryItems: N(mapping.extraordinaryItems),
        netProfit: N(mapping.netProfit),
        cash: N(mapping.cash),
        ar: N(mapping.ar),
        inventory: N(mapping.inventory),
        otherCA: N(mapping.otherCA),
        tca: N(mapping.tca),
        fixedAssets: N(mapping.fixedAssets),
        otherAssets: N(mapping.otherAssets),
        totalAssets: N(mapping.totalAssets),
        ap: N(mapping.ap),
        otherCL: N(mapping.otherCL),
        tcl: N(mapping.tcl),
        ltd: N(mapping.ltd),
        totalLiab: N(mapping.totalLiab),
        ownersCapital: N(mapping.ownersCapital),
        ownersDraw: N(mapping.ownersDraw),
        commonStock: N(mapping.commonStock),
        preferredStock: N(mapping.preferredStock),
        retainedEarnings: N(mapping.retainedEarnings),
        additionalPaidInCapital: N(mapping.additionalPaidInCapital),
        treasuryStock: N(mapping.treasuryStock),
        totalEquity: N(mapping.totalEquity),
        totalLAndE: N(mapping.totalLAndE),
      });
    }

    // Aggregate by month
    const acc = new Map<string, any>();
    for (const r of processedRows) {
      const k = r.month;
      let v: any;
      if (acc.has(k)) {
        v = acc.get(k)!;
        for (const key of Object.keys(r)) {
          if (key === 'date' || key === 'month') continue;
          v[key] = (v[key] || 0) + (r[key] || 0);
        }
      } else {
        v = { ...r };
      }
      acc.set(k, v);
    }
    
    const months = Array.from(acc.keys()).sort();
    const monthlyData = months.map(m => acc.get(m)!);
    
    setMonthly(monthlyData);
    return monthlyData;
  };

  // Save financial data to backend
  const saveFinancialData = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first');
      return;
    }

    const monthlyData = processData();
    if (!monthlyData || monthlyData.length === 0) {
      alert('No data to save');
      return;
    }

    try {
      await financialsApi.create({
        companyId: selectedCompanyId,
        rawRows,
        mapping,
        fileName
      });
      
      alert('Financial data saved successfully!');
      setUploadStep('review');
    } catch (error: any) {
      alert('Error saving data: ' + (error.message || 'Unknown error'));
    }
  };

  // Get current company
  const getCurrentCompany = () => {
    if (!selectedCompanyId) return null;
    return companies.find(c => c.id === selectedCompanyId) || null;
  };

  // Render column selector helper
  const renderColumnSelector = (label: string, mappingKey: keyof Mappings, required: boolean = false) => (
    <div style={{ marginBottom: '15px' }}>
      <label style={{ display: 'block', fontWeight: '500', marginBottom: '5px', color: '#475569' }}>
        {label}{required && ' *'}:
      </label>
      <select 
        value={mapping[mappingKey] || ''} 
        onChange={(e) => setMapping({ ...mapping, [mappingKey]: e.target.value })} 
        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
      >
        <option value="">-- Select --</option>
        {columns.map(col => <option key={col} value={col}>{col}</option>)}
      </select>
    </div>
  );

  // Load financials for selected company
  useEffect(() => {
    if (selectedCompanyId && isLoggedIn) {
      financialsApi.getByCompany(selectedCompanyId)
        .then(data => {
          if (data.financials && data.financials.length > 0) {
            setSavedFinancials(data.financials);
            // Auto-load most recent financial data
            const mostRecent = data.financials[0];
            if (mostRecent) {
              setRawRows(mostRecent.rawRows || []);
              setMapping(mostRecent.mapping || { date: '' });
              setFileName(mostRecent.fileName || 'Saved Data');
              // Process data here if needed
            }
          }
        })
        .catch(err => console.error('Error loading financials:', err));
    }
  }, [selectedCompanyId, isLoggedIn]);

  // Handle Register Consultant
  const handleRegisterConsultant = async () => {
    setIsLoading(true);
    setLoginError('');
    
    try {
      // Validation
      if (!loginName.trim() || !loginEmail.trim() || !loginPhone.trim() || 
          !loginCompanyName.trim() || !loginCompanyAddress1.trim() || 
          !loginCompanyCity.trim() || !loginCompanyState || !loginCompanyZip.trim() || 
          !loginPassword.trim()) {
        setLoginError('Please fill in all required fields (marked with *)');
        setIsLoading(false);
        return;
      }

      await authApi.registerConsultant({
        fullName: loginName,
        email: loginEmail.toLowerCase().trim(),
        phone: loginPhone,
        companyName: loginCompanyName,
        companyAddress1: loginCompanyAddress1,
        companyAddress2: loginCompanyAddress2,
        companyCity: loginCompanyCity,
        companyState: loginCompanyState,
        companyZip: loginCompanyZip,
        companyWebsite: loginCompanyWebsite,
        password: loginPassword
      });

      // Auto-login after registration
      const user = await authApi.login(loginEmail.toLowerCase().trim(), loginPassword);
      setCurrentUser(user);
      setIsLoggedIn(true);
      setCurrentView('admin');
      
      // Reset form
      setLoginName('');
      setLoginEmail('');
      setLoginPhone('');
      setLoginCompanyName('');
      setLoginCompanyAddress1('');
      setLoginCompanyAddress2('');
      setLoginCompanyCity('');
      setLoginCompanyState('');
      setLoginCompanyZip('');
      setLoginCompanyWebsite('');
      setLoginPassword('');
      setIsRegistering(false);
    } catch (error: any) {
      setLoginError(error.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  // LOGIN VIEW
  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '40px 20px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: '#667eea', marginBottom: '16px', letterSpacing: '-1px' }}>
              Corelytics<sup style={{ fontSize: '18px', fontWeight: '400' }}>TM</sup>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Business Evaluation Tool</h1>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Professional financial analysis for consultants and businesses</p>
          </div>

          {loginError && (
            <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', border: '1px solid #fecaca' }}>
              {loginError}
            </div>
          )}

          {showForgotPassword ? (
            <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Reset Password</h2>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>Enter your email address and we'll send you instructions to reset your password.</p>
              
              {resetSuccess && (
                <div style={{ padding: '12px 16px', background: '#d1fae5', color: '#065f46', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', border: '1px solid #6ee7b7' }}>
                  {resetSuccess}
                </div>
              )}
              
              <input 
                type="text" 
                placeholder="Email Address" 
                value={resetEmail} 
                onChange={(e) => { setResetEmail(e.target.value); setLoginError(''); }} 
                autoComplete="off"
                style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <button 
                onClick={async () => {
                  if (!resetEmail.trim()) {
                    setLoginError('Please enter your email address');
                    return;
                  }
                  setIsLoading(true);
                  setLoginError('');
                  setResetSuccess('');
                  try {
                    const response = await fetch('/api/auth/reset-password', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: resetEmail.toLowerCase().trim() })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                      throw new Error(data.error || 'Failed to send reset email');
                    }
                    
                    if (data.dev_info?.resetLink) {
                      setResetSuccess(`Password reset link: `);
                      setTimeout(() => {
                        window.open(data.dev_info.resetLink, '_blank');
                      }, 500);
                    } else {
                      setResetSuccess('Password reset instructions sent! Check your email.');
                    }
                    setResetEmail('');
                  } catch (error) {
                    setLoginError(error instanceof Error ? error.message : 'Failed to send reset email');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? 'Sending...' : 'Send Reset Instructions'}
              </button>
              <button 
                type="button"
                onClick={() => { setShowForgotPassword(false); setLoginError(''); setResetSuccess(''); setResetEmail(''); }} 
                disabled={isLoading}
                style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}
              >
                Back to Login
              </button>
            </form>
          ) : isRegistering ? (
            <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleRegisterConsultant(); }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Register as Consultant</h2>
              <input 
                type="text" 
                placeholder="Full Name *" 
                value={loginName} 
                onChange={(e) => setLoginName(e.target.value)} 
                autoComplete="off" 
                required
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <input 
                type="text" 
                placeholder="Email *" 
                value={loginEmail} 
                onChange={(e) => setLoginEmail(e.target.value)} 
                autoComplete="off" 
                required
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <input 
                type="tel" 
                placeholder="Phone Number *" 
                value={loginPhone} 
                onChange={(e) => setLoginPhone(e.target.value)} 
                autoComplete="off" 
                required
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <input 
                type="text" 
                placeholder="Company Name *" 
                value={loginCompanyName} 
                onChange={(e) => setLoginCompanyName(e.target.value)} 
                autoComplete="off" 
                required
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              
              {/* Company Address Fields */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company Address</label>
                <input 
                  type="text" 
                  placeholder="Address Line 1 *" 
                  value={loginCompanyAddress1} 
                  onChange={(e) => setLoginCompanyAddress1(e.target.value)} 
                  autoComplete="off" 
                  required
                  style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
                <input 
                  type="text" 
                  placeholder="Address Line 2 (Optional)" 
                  value={loginCompanyAddress2} 
                  onChange={(e) => setLoginCompanyAddress2(e.target.value)} 
                  autoComplete="off" 
                  style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="City *" 
                    value={loginCompanyCity} 
                    onChange={(e) => setLoginCompanyCity(e.target.value)} 
                    autoComplete="off" 
                    required
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                  />
                  <select 
                    value={loginCompanyState} 
                    onChange={(e) => setLoginCompanyState(e.target.value)} 
                    required
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: 'white' }}
                  >
                    {US_STATES.map(state => (
                      <option key={state.code} value={state.code}>{state.name}</option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    placeholder="ZIP Code *" 
                    value={loginCompanyZip} 
                    onChange={(e) => setLoginCompanyZip(e.target.value)} 
                    autoComplete="off" 
                    required
                    maxLength={10}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                  />
                </div>
              </div>
              
              <input 
                type="url" 
                placeholder="Company Website (Optional)" 
                value={loginCompanyWebsite} 
                onChange={(e) => setLoginCompanyWebsite(e.target.value)} 
                autoComplete="off" 
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              
              {/* Password field with toggle */}
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password *" 
                  value={loginPassword} 
                  onChange={(e) => setLoginPassword(e.target.value)} 
                  autoComplete="new-password"
                  required
                  style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '4px' }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              
              <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: isLoading ? 0.7 : 1 }}>
                {isLoading ? 'Registering...' : 'Register'}
              </button>
              <button type="button" onClick={() => { setIsRegistering(false); setLoginError(''); setShowPassword(false); }} disabled={isLoading} style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>Back to Login</button>
            </form>
          ) : (
            <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (!isLoading) handleLogin(); }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sign In</h2>
              <input 
                type="text" 
                placeholder="Email" 
                value={loginEmail} 
                onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }} 
                autoComplete="off" 
                style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              
              {/* Password field with toggle */}
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Password" 
                  value={loginPassword} 
                  onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }} 
                  autoComplete="new-password"
                  style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '4px' }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              
              {/* Forgot Password Link */}
              <div style={{ textAlign: 'right', marginBottom: '12px' }}>
                <button 
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setLoginError(''); setShowPassword(false); }} 
                  style={{ background: 'none', border: 'none', color: '#667eea', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Forgot Password?
                </button>
              </div>
              
              <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '16px', opacity: isLoading ? 0.7 : 1 }}>
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
              <button type="button" onClick={() => { setIsRegistering(true); setLoginError(''); setShowPassword(false); }} disabled={isLoading} style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px' }}>Register as Consultant</button>
              <button type="button" onClick={() => window.location.href = '/register-business'} disabled={isLoading} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}>
                🏢 Register Your Business
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Get company name
  const company = getCurrentCompany();
  const companyName = company ? company.name : '';

  // LOGGED-IN VIEW
  return (
    <div style={{ height: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <InactivityLogout 
        isLoggedIn={isLoggedIn}
        userEmail={currentUser?.email}
        onLogout={handleLogout}
      />
      
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
          <div 
            style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', cursor: 'pointer', letterSpacing: '-0.5px' }}
            onClick={() => setCurrentView(currentUser?.role === 'siteadmin' ? 'siteadmin' : currentUser?.role === 'consultant' ? 'admin' : 'dashboard')}
          >
            Corelytics<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
          </div>
          
          {/* Navigation for regular users/consultants */}
          {currentUser?.role !== 'siteadmin' && (
            <nav style={{ display: 'flex', gap: '24px' }}>
              <button 
                onClick={() => setCurrentView('dashboard')}
                style={{ 
                  padding: '8px 16px', 
                  background: currentView === 'dashboard' ? '#4338ca' : 'transparent', 
                  color: currentView === 'dashboard' ? 'white' : '#64748b',
                  border: 'none', 
                  borderRadius: '6px', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setCurrentView('upload')}
                style={{ 
                  padding: '8px 16px', 
                  background: currentView === 'upload' ? '#4338ca' : 'transparent', 
                  color: currentView === 'upload' ? 'white' : '#64748b',
                  border: 'none', 
                  borderRadius: '6px', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Upload Data
              </button>
              {currentUser?.role === 'consultant' && (
                <button 
                  onClick={() => setCurrentView('admin')}
                  style={{ 
                    padding: '8px 16px', 
                    background: currentView === 'admin' ? '#4338ca' : 'transparent', 
                    color: currentView === 'admin' ? 'white' : '#64748b',
                    border: 'none', 
                    borderRadius: '6px', 
                    fontSize: '14px', 
                    fontWeight: '600', 
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Admin
                </button>
              )}
            </nav>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {companyName && <span style={{ fontSize: '14px', color: '#4338ca', fontWeight: '600' }}>{companyName}</span>}
          <span style={{ fontSize: '14px', color: '#64748b' }}>{currentUser?.name || currentUser?.email}</span>
          <button 
            onClick={handleLogout} 
            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ flex: 1, marginTop: '80px', overflow: 'auto' }}>
        {/* Upload View */}
        {currentView === 'upload' && (
          <div style={{ padding: '32px' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Upload Financial Data
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
                Upload your Excel or CSV file containing financial data
              </p>
              
              {uploadStep === 'upload' && (
                <div style={{ background: 'white', padding: '48px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                  <Upload size={64} style={{ color: '#4338ca', margin: '0 auto 24px' }} />
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    Choose a file to upload
                  </h2>
                  <p style={{ color: '#64748b', marginBottom: '24px' }}>
                    Supports Excel (.xlsx, .xls) and CSV files
                  </p>
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    id="file-upload"
                  />
                  <label 
                    htmlFor="file-upload"
                    style={{ 
                      display: 'inline-block',
                      padding: '12px 24px', 
                      background: '#4338ca', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Select File
                  </label>
                </div>
              )}
              
              {uploadStep === 'mapping' && (
                <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                    Map Your Columns
                  </h2>
                  <p style={{ color: '#64748b', marginBottom: '24px' }}>
                    Detected {columns.length} columns in {fileName}. Map them to financial categories below.
                  </p>
                  
                  <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Required Fields
                    </h3>
                    {renderColumnSelector('Date', 'date', true)}
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Income Statement
                    </h3>
                    {renderColumnSelector('Revenue', 'revenue')}
                    {renderColumnSelector('Total Expenses', 'expense')}
                    {renderColumnSelector('Net Profit', 'netProfit')}
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Cost of Goods Sold (COGS)
                    </h3>
                    {renderColumnSelector('COGS - Payroll', 'cogsPayroll')}
                    {renderColumnSelector('COGS - Owner Pay', 'cogsOwnerPay')}
                    {renderColumnSelector('COGS - Contractors', 'cogsContractors')}
                    {renderColumnSelector('COGS - Materials', 'cogsMaterials')}
                    {renderColumnSelector('COGS - Commissions', 'cogsCommissions')}
                    {renderColumnSelector('COGS - Other', 'cogsOther')}
                    {renderColumnSelector('COGS - Total', 'cogsTotal')}
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Operating Expenses
                    </h3>
                    {renderColumnSelector('Sales & Marketing', 'opexSalesMarketing')}
                    {renderColumnSelector('Rent/Lease', 'rentLease')}
                    {renderColumnSelector('Utilities', 'utilities')}
                    {renderColumnSelector('Equipment', 'equipment')}
                    {renderColumnSelector('Travel', 'travel')}
                    {renderColumnSelector('Professional Services', 'professionalServices')}
                    {renderColumnSelector('Insurance', 'insurance')}
                    {renderColumnSelector('OpEx - Other', 'opexOther')}
                    {renderColumnSelector('OpEx - Payroll', 'opexPayroll')}
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Balance Sheet - Assets
                    </h3>
                    {renderColumnSelector('Cash', 'cash')}
                    {renderColumnSelector('Accounts Receivable', 'ar')}
                    {renderColumnSelector('Inventory', 'inventory')}
                    {renderColumnSelector('Other Current Assets', 'otherCA')}
                    {renderColumnSelector('Total Current Assets', 'tca')}
                    {renderColumnSelector('Fixed Assets', 'fixedAssets')}
                    {renderColumnSelector('Other Assets', 'otherAssets')}
                    {renderColumnSelector('Total Assets', 'totalAssets')}
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px', marginTop: '24px' }}>
                      Balance Sheet - Liabilities & Equity
                    </h3>
                    {renderColumnSelector('Accounts Payable', 'ap')}
                    {renderColumnSelector('Other Current Liabilities', 'otherCL')}
                    {renderColumnSelector('Total Current Liabilities', 'tcl')}
                    {renderColumnSelector('Long-term Debt', 'ltd')}
                    {renderColumnSelector('Total Liabilities', 'totalLiab')}
                    {renderColumnSelector('Total Equity', 'totalEquity')}
                    {renderColumnSelector('Total Liabilities & Equity', 'totalLAndE')}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
                    <button 
                      onClick={() => {
                        setUploadStep('upload');
                        setRawRows([]);
                        setColumns([]);
                        setMapping({ date: '' });
                      }}
                      style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        if (!mapping.date) {
                          alert('Please select a date column');
                          return;
                        }
                        saveFinancialData();
                      }}
                      style={{ flex: 1, padding: '10px 20px', background: '#4338ca', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Process & Save Data
                    </button>
                  </div>
                </div>
              )}
              
              {uploadStep === 'review' && (
                <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                    Data Uploaded Successfully
                  </h2>
                  <p style={{ color: '#10b981', marginBottom: '24px' }}>
                    ✓ {fileName} processed with {rawRows.length} rows
                  </p>
                  
                  <button 
                    onClick={() => {
                      setUploadStep('upload');
                      setCurrentView('dashboard');
                    }}
                    style={{ padding: '10px 20px', background: '#4338ca', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    View Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div style={{ padding: '32px' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Financial Dashboard
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
                {companyName || 'Your Company'} - Overview of financial performance
              </p>
              
              {monthly.length > 0 ? (
                <>
                  {/* Key Metrics Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    {/* Latest Revenue */}
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Latest Revenue</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                        ${monthly[monthly.length - 1].revenue.toLocaleString()}
                      </div>
                      {monthly.length > 1 && (
                        <div style={{ fontSize: '13px', color: pctChange(monthly[monthly.length - 1].revenue, monthly[monthly.length - 2].revenue) && pctChange(monthly[monthly.length - 1].revenue, monthly[monthly.length - 2].revenue)! > 0 ? '#10b981' : '#ef4444' }}>
                          {pctChange(monthly[monthly.length - 1].revenue, monthly[monthly.length - 2].revenue)?.toFixed(1)}% vs prior month
                        </div>
                      )}
                    </div>

                    {/* Latest Expenses */}
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Latest Expenses</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                        ${monthly[monthly.length - 1].expense.toLocaleString()}
                      </div>
                      {monthly.length > 1 && (
                        <div style={{ fontSize: '13px', color: pctChange(monthly[monthly.length - 1].expense, monthly[monthly.length - 2].expense) && pctChange(monthly[monthly.length - 1].expense, monthly[monthly.length - 2].expense)! < 0 ? '#10b981' : '#ef4444' }}>
                          {pctChange(monthly[monthly.length - 1].expense, monthly[monthly.length - 2].expense)?.toFixed(1)}% vs prior month
                        </div>
                      )}
                    </div>

                    {/* Net Profit */}
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Net Profit (Latest)</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: monthly[monthly.length - 1].netProfit >= 0 ? '#10b981' : '#ef4444', marginBottom: '4px' }}>
                        ${monthly[monthly.length - 1].netProfit.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {monthly[monthly.length - 1].revenue > 0 ? ((monthly[monthly.length - 1].netProfit / monthly[monthly.length - 1].revenue) * 100).toFixed(1) : '0.0'}% margin
                      </div>
                    </div>

                    {/* Total Assets */}
                    {monthly[monthly.length - 1].totalAssets > 0 && (
                      <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total Assets</div>
                        <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                          ${monthly[monthly.length - 1].totalAssets.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          As of {monthly[monthly.length - 1].month}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Charts */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                    <SimpleChart 
                      data={monthly.map(m => ({ month: m.month, value: m.revenue }))}
                      title="Revenue Trend"
                      color="#4338ca"
                      formatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <SimpleChart 
                      data={monthly.map(m => ({ month: m.month, value: m.expense }))}
                      title="Expense Trend"
                      color="#ef4444"
                      formatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <SimpleChart 
                      data={monthly.map(m => ({ month: m.month, value: m.netProfit }))}
                      title="Net Profit Trend"
                      color="#10b981"
                      formatter={(v) => `$${v.toLocaleString()}`}
                    />
                    {monthly.some(m => m.totalAssets > 0) && (
                      <SimpleChart 
                        data={monthly.filter(m => m.totalAssets > 0).map(m => ({ month: m.month, value: m.totalAssets }))}
                        title="Total Assets"
                        color="#f59e0b"
                        formatter={(v) => `$${v.toLocaleString()}`}
                      />
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                      Quick Actions
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => exportMonthlyData(monthly)}
                        style={{ padding: '10px 20px', background: '#4338ca', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Export to Excel
                      </button>
                      <button 
                        onClick={() => setCurrentView('upload')}
                        style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Upload New Data
                      </button>
                      <button 
                        onClick={() => setCurrentView('kpis')}
                        style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        View KPIs
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: 'white', padding: '48px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    No Financial Data Yet
                  </h2>
                  <p style={{ color: '#64748b', marginBottom: '24px' }}>
                    Upload your financial data to see charts, KPIs, and insights
                  </p>
                  <button 
                    onClick={() => setCurrentView('upload')}
                    style={{ padding: '12px 24px', background: '#4338ca', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Upload Financial Data
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin View */}
        {currentView === 'admin' && currentUser?.role === 'consultant' && (
          <div style={{ padding: '32px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Admin Dashboard
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
                Manage your companies and team
              </p>
              
              <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                  Your Companies
                </h2>
                {companies.length > 0 ? (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {companies.map(company => (
                      <div 
                        key={company.id} 
                        onClick={() => setSelectedCompanyId(company.id)}
                        style={{ 
                          padding: '16px', 
                          background: company.id === selectedCompanyId ? '#e0e7ff' : '#f8fafc', 
                          borderRadius: '8px', 
                          cursor: 'pointer',
                          border: company.id === selectedCompanyId ? '2px solid #4338ca' : '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                          {company.name}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {company.location || 'No location specified'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#64748b' }}>No companies added yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* KPI View */}
        {currentView === 'kpis' && (
          <div style={{ padding: '32px' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Key Performance Indicators
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
                Financial ratios and performance metrics
              </p>
              
              {monthly.length > 1 ? (
                <div style={{ display: 'grid', gap: '20px' }}>
                  {/* Liquidity Ratios */}
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                      Liquidity Ratios
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      {monthly[monthly.length - 1].tca > 0 && monthly[monthly.length - 1].tcl > 0 && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Current Ratio</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
                            {(monthly[monthly.length - 1].tca / monthly[monthly.length - 1].tcl).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                            TCA / TCL
                          </div>
                        </div>
                      )}
                      {monthly[monthly.length - 1].tca > 0 && monthly[monthly.length - 1].inventory > 0 && monthly[monthly.length - 1].tcl > 0 && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quick Ratio</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
                            {((monthly[monthly.length - 1].tca - monthly[monthly.length - 1].inventory) / monthly[monthly.length - 1].tcl).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                            (TCA - Inventory) / TCL
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Profitability Metrics */}
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                      Profitability
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Gross Profit Margin</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: monthly[monthly.length - 1].revenue > 0 ? '#10b981' : '#64748b' }}>
                          {monthly[monthly.length - 1].revenue > 0 
                            ? (((monthly[monthly.length - 1].revenue - (monthly[monthly.length - 1].cogsTotal || 0)) / monthly[monthly.length - 1].revenue) * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          (Revenue - COGS) / Revenue
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Net Profit Margin</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: monthly[monthly.length - 1].netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                          {monthly[monthly.length - 1].revenue > 0 
                            ? ((monthly[monthly.length - 1].netProfit / monthly[monthly.length - 1].revenue) * 100).toFixed(1)
                            : '0.0'}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          Net Profit / Revenue
                        </div>
                      </div>
                      {monthly[monthly.length - 1].totalAssets > 0 && (
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Return on Assets (ROA)</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
                            {((monthly[monthly.length - 1].netProfit / monthly[monthly.length - 1].totalAssets) * 100).toFixed(1)}%
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                            Net Profit / Total Assets
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Leverage */}
                  {monthly[monthly.length - 1].totalLiab > 0 && monthly[monthly.length - 1].totalEquity > 0 && (
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                        Leverage
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Debt to Equity</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
                            {(monthly[monthly.length - 1].totalLiab / monthly[monthly.length - 1].totalEquity).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                            Total Liabilities / Total Equity
                          </div>
                        </div>
                        {monthly[monthly.length - 1].totalAssets > 0 && (
                          <div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Leverage Ratio</div>
                            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>
                              {(monthly[monthly.length - 1].totalAssets / monthly[monthly.length - 1].totalEquity).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                              Total Assets / Total Equity
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setCurrentView('dashboard')}
                    style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    ← Back to Dashboard
                  </button>
                </div>
              ) : (
                <div style={{ background: 'white', padding: '48px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    Insufficient Data for KPIs
                  </h2>
                  <p style={{ color: '#64748b', marginBottom: '24px' }}>
                    Upload financial data with balance sheet information to calculate KPIs
                  </p>
                  <button 
                    onClick={() => setCurrentView('upload')}
                    style={{ padding: '12px 24px', background: '#4338ca', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Upload Financial Data
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Site Admin View */}
        {currentView === 'siteadmin' && currentUser?.role === 'siteadmin' && (
          <div style={{ padding: '32px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                Site Administration
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
                System-wide management and settings
              </p>
              
              <div style={{ background: 'white', padding: '32px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                  Admin Tools (In Development)
                </h2>
                <p style={{ color: '#64748b' }}>
                  Site administration features are being migrated to the new architecture.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


