'use client';

import React from 'react';
import { US_STATES } from '../../constants';
import { formatPhoneNumber } from '../../utils/phone';

interface LoginViewProps {
  // State
  loginEmail: string;
  setLoginEmail: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  loginName: string;
  setLoginName: (value: string) => void;
  loginPhone: string;
  setLoginPhone: (value: string) => void;
  loginCompanyName: string;
  setLoginCompanyName: (value: string) => void;
  loginCompanyAddress1: string;
  setLoginCompanyAddress1: (value: string) => void;
  loginCompanyAddress2: string;
  setLoginCompanyAddress2: (value: string) => void;
  loginCompanyCity: string;
  setLoginCompanyCity: (value: string) => void;
  loginCompanyState: string;
  setLoginCompanyState: (value: string) => void;
  loginCompanyZip: string;
  setLoginCompanyZip: (value: string) => void;
  loginCompanyWebsite: string;
  setLoginCompanyWebsite: (value: string) => void;
  isRegistering: boolean;
  setIsRegistering: (value: boolean) => void;
  loginError: string;
  setLoginError: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  showForgotPassword: boolean;
  setShowForgotPassword: (value: boolean) => void;
  resetEmail: string;
  setResetEmail: (value: string) => void;
  resetSuccess: string;
  setResetSuccess: (value: string) => void;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  
  // Handlers
  handleLogin: () => Promise<void>;
  handleRegisterConsultant: () => Promise<void>;
}

export default function LoginView(props: LoginViewProps) {
  const {
    loginEmail, setLoginEmail,
    loginPassword, setLoginPassword,
    loginName, setLoginName,
    loginPhone, setLoginPhone,
    loginCompanyName, setLoginCompanyName,
    loginCompanyAddress1, setLoginCompanyAddress1,
    loginCompanyAddress2, setLoginCompanyAddress2,
    loginCompanyCity, setLoginCompanyCity,
    loginCompanyState, setLoginCompanyState,
    loginCompanyZip, setLoginCompanyZip,
    loginCompanyWebsite, setLoginCompanyWebsite,
    isRegistering, setIsRegistering,
    loginError, setLoginError,
    showPassword, setShowPassword,
    showForgotPassword, setShowForgotPassword,
    resetEmail, setResetEmail,
    resetSuccess, setResetSuccess,
    isLoading, setIsLoading,
    handleLogin,
    handleRegisterConsultant
  } = props;
  const autofillNonce = React.useId();

  return (
    <div style={{ minHeight: '100vh', background: '#e8edf3', padding: '48px 20px' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', background: 'white', borderRadius: '0', border: '1px solid #dbe3ee', boxShadow: '0 6px 20px rgba(15, 23, 42, 0.08)', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '42px', fontWeight: '700', color: '#1F70C1', marginBottom: '16px', letterSpacing: '-0.5px' }}>
            Corelytics<sup style={{ fontSize: '18px', fontWeight: '400' }}>TM</sup>
          </div>
          <h1 style={{ fontSize: '27px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Business Evaluation Platform</h1>
          <p style={{ color: '#475569', fontSize: '14px' }}>Comprehensive financial and operational analysis for consultants and businesses</p>
        </div>

        {loginError && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '0', marginBottom: '16px', fontSize: '14px', border: '1px solid #fecaca' }}>
            {loginError}
          </div>
        )}

        {showForgotPassword ? (
          <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Reset Password</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>Enter your email address and we'll send you instructions to reset your password.</p>
            
            {resetSuccess && (
              <div style={{ padding: '12px 16px', background: '#d1fae5', color: '#065f46', borderRadius: '0', marginBottom: '16px', fontSize: '14px', border: '1px solid #6ee7b7' }}>
                {resetSuccess}
              </div>
            )}
            
            <input 
              type="text" 
              name={`reset_email_${autofillNonce}`}
              placeholder="Email Address" 
              value={resetEmail} 
              onChange={(e) => { setResetEmail(e.target.value); setLoginError(''); }} 
              autoComplete="off"
              style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
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
                  
                  // In development, show the reset link
                  if (data.dev_info?.resetLink) {
                    setResetSuccess(`Password reset link: `);
                    // Open link in a new tab after a short delay
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
              style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: '0', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: isLoading ? 0.7 : 1, boxSizing: 'border-box' }}
            >
              {isLoading ? 'Sending...' : 'Send Reset Instructions'}
            </button>
            <button 
              type="button"
              onClick={() => { setShowForgotPassword(false); setLoginError(''); setResetSuccess(''); setResetEmail(''); }} 
              disabled={isLoading}
              style={{ width: '100%', padding: '14px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              Back to Login
            </button>
          </form>
        ) : isRegistering ? (
          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleRegisterConsultant(); }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Register as Consultant</h2>
            <input 
              type="text" 
              name={`fullname_${autofillNonce}`}
              placeholder="Full Name *" 
              value={loginName} 
              onChange={(e) => setLoginName(e.target.value)} 
              autoComplete="off" 
              required
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
            />
            <input 
              type="text" 
              name={`email_${autofillNonce}`}
              placeholder="Email *" 
              value={loginEmail} 
              onChange={(e) => setLoginEmail(e.target.value)} 
              autoComplete="off" 
              required
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
            />
            <input 
              type="tel" 
              name={`phone_${autofillNonce}`}
              placeholder="(555) 777-1212" 
              value={loginPhone} 
              onChange={(e) => setLoginPhone(formatPhoneNumber(e.target.value))} 
              autoComplete="off" 
              required
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
            />
            <input 
              type="text" 
              name={`company_name_${autofillNonce}`}
              placeholder="Company Name *" 
              value={loginCompanyName} 
              onChange={(e) => setLoginCompanyName(e.target.value)} 
              autoComplete="off" 
              required
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
            />
            
            {/* Company Address Fields */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company Address</label>
              <input 
                type="text" 
                name={`company_address1_${autofillNonce}`}
                placeholder="Address Line 1 *" 
                value={loginCompanyAddress1} 
                onChange={(e) => setLoginCompanyAddress1(e.target.value)} 
                autoComplete="off" 
                required
                style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <input 
                type="text" 
                name={`company_address2_${autofillNonce}`}
                placeholder="Address Line 2 (Optional)" 
                value={loginCompanyAddress2} 
                onChange={(e) => setLoginCompanyAddress2(e.target.value)} 
                autoComplete="off" 
                style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <input 
                  type="text" 
                  name={`company_city_${autofillNonce}`}
                  placeholder="City *" 
                  value={loginCompanyCity} 
                  onChange={(e) => setLoginCompanyCity(e.target.value)} 
                  autoComplete="off" 
                  required
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
                <select 
                  name={`company_state_${autofillNonce}`}
                  value={loginCompanyState} 
                  onChange={(e) => setLoginCompanyState(e.target.value)} 
                  required
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: 'white' }}
                >
                  {US_STATES.map(state => (
                    <option key={state.code} value={state.code}>{state.name}</option>
                  ))}
                </select>
                <input 
                  type="text" 
                  name={`company_zip_${autofillNonce}`}
                  placeholder="ZIP Code *" 
                  value={loginCompanyZip} 
                  onChange={(e) => setLoginCompanyZip(e.target.value)} 
                  autoComplete="off" 
                  required
                  maxLength={10}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px' }} 
                />
              </div>
            </div>
            
            <input 
              type="url" 
              name={`company_website_${autofillNonce}`}
              placeholder="Company Website (Optional)" 
              value={loginCompanyWebsite} 
              onChange={(e) => setLoginCompanyWebsite(e.target.value)} 
              autoComplete="off" 
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} 
            />
            
            {/* Password field with toggle */}
            <div style={{ position: 'relative', marginBottom: '4px' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                name={`password_${autofillNonce}`}
                placeholder="Password *" 
                value={loginPassword} 
                onChange={(e) => setLoginPassword(e.target.value)} 
                autoComplete="new-password"
                required
                style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px' }} 
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
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
              Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
            </div>
            
            <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: '0', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: isLoading ? 0.7 : 1 }}>
              {isLoading ? 'Registering...' : 'Register'}
            </button>
            <button type="button" onClick={() => { setIsRegistering(false); setLoginError(''); setShowPassword(false); }} disabled={isLoading} style={{ width: '100%', padding: '14px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>Back to Login</button>
          </form>
        ) : (
          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (!isLoading) handleLogin(); }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Sign In</h2>
            <input
              type="text"
              name={`email_${autofillNonce}`}
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }}
              autoComplete="off"
              style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
            />
            
            {/* Password field with toggle */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input
                type={showPassword ? "text" : "password"}
                name={`password_${autofillNonce}`}
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                autoComplete="new-password"
                style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '0', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
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
                style={{ background: 'none', border: 'none', color: '#1d4ed8', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Forgot Password?
              </button>
            </div>
            
            <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#1d4ed8', color: 'white', border: '1px solid #1e40af', borderRadius: '0', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '16px', opacity: isLoading ? 0.7 : 1 }}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '14px', marginBottom: '4px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                New to Corelytics?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button type="button" onClick={() => { setIsRegistering(true); setLoginError(''); setShowPassword(false); }} disabled={isLoading} style={{ width: '100%', padding: '12px', background: '#f8fafc', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '0', fontSize: '13px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                  Register as a Consultant
                </button>
                <button type="button" onClick={() => window.location.href = '/register-business'} disabled={isLoading} style={{ width: '100%', padding: '12px', background: '#1d4ed8', color: 'white', border: '1px solid #1d4ed8', borderRadius: '0', fontSize: '13px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                  Register Your Company
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

