'use client';

import { useState } from 'react';
import LoginView from './components/auth/LoginView';

export default function FinancialScorePage() {
  // State - Authentication
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
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

  // LOGIN VIEW
  if (!isLoggedIn) {
    return (
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
    );
  }

  return (
    <div style={{ height: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ color: '#1e293b', margin: 0 }}>Financial Score Dashboard</h1>
            <p style={{ color: '#64748b', margin: '5px 0 0 0' }}>
              Welcome back, {currentUser?.name || currentUser?.email}!
            </p>
          </div>
          <button
            onClick={() => setIsLoggedIn(false)}
            style={{
              padding: '8px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>

        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Dashboard Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Account Type</h3>
              <p style={{ color: '#64748b', margin: 0 }}>
                {currentUser?.role === 'SITEADMIN' ? 'Site Administrator' :
                 currentUser?.role === 'CONSULTANT' ? 'Consultant' : 'User'}
              </p>
            </div>
            <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Email</h3>
              <p style={{ color: '#64748b', margin: 0 }}>{currentUser?.email}</p>
            </div>
            <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Status</h3>
              <p style={{ color: '#10b981', margin: 0 }}>✅ Logged In</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  async function handleLogin() {
    if (!loginEmail || !loginPassword) {
      setLoginError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        setLoginEmail('');
        setLoginPassword('');
        setLoginError('');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (error) {
      setLoginError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegisterConsultant() {
    // TODO: Implement registration
    console.log('Registration attempt');
  }
}
