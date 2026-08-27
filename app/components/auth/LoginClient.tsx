'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn as nextAuthSignIn } from 'next-auth/react';
import LoginView from '@/app/components/auth/LoginView';
import MFAEnrollmentModal from '@/app/components/auth/MFAEnrollmentModal';
import MFAVerificationModal from '@/app/components/auth/MFAVerificationModal';
import { authApi, ApiError } from '@/lib/api-client';
import { enterAppAfterLogin, persistLoggedInUser } from '@/lib/auth/enter-app-after-login';
import { waitForNextAuthSession } from '@/lib/auth/wait-for-nextauth-session';

function LoginClientInner() {
  const searchParams = useSearchParams();
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
  const [showMFAEnrollment, setShowMFAEnrollment] = useState(false);
  const [showMFAVerification, setShowMFAVerification] = useState(false);
  const [mfaUserId, setMfaUserId] = useState('');
  const [mfaUserEmail, setMfaUserEmail] = useState('');
  const [trustDurationDays, setTrustDurationDays] = useState<number | null>(null);

  useEffect(() => {
    if (searchParams.get('sessionExpired') === '1') {
      setLoginError('Session expired due to inactivity. Please log in again.');
    } else if (searchParams.get('demoExpired') === '1') {
      setLoginError('Your 7-day demo has expired. Please contact us to upgrade and continue.');
    }
  }, [searchParams]);

  const finishAuthenticatedLogin = async () => {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to complete login');
    }
    const { user } = await response.json();
    persistLoggedInUser(user);
    enterAppAfterLogin();
  };

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
      let signInResult: any = null;
      try {
        signInResult = await nextAuthSignIn('credentials', {
          email: normalizedEmail,
          password: loginPassword,
          redirect: false,
        });
      } catch (error) {
        console.error('NextAuth signIn threw:', error);
        setLoginError('Login failed (auth session). Please try again.');
        setIsLoading(false);
        return;
      }

      if (signInResult?.error || !signInResult?.ok) {
        setLoginError('Invalid email or password');
        setIsLoading(false);
        return;
      }

      await waitForNextAuthSession();

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: loginPassword }),
      });

      if (!loginResponse.ok) {
        let loginErrorMessage = 'Invalid email or password';
        try {
          const errorData = await loginResponse.json();
          const normalizedError = String(errorData?.error || '').toLowerCase();
          if (loginResponse.status === 403 && normalizedError.includes('demo')) {
            loginErrorMessage = 'Your 7-day demo has expired. Please contact us to upgrade and continue.';
          } else if (loginResponse.status >= 500) {
            loginErrorMessage = 'Login service is temporarily unavailable. Please try again in a moment.';
          } else if (typeof errorData?.error === 'string' && errorData.error.trim()) {
            loginErrorMessage = errorData.error;
          }
        } catch {
          if (loginResponse.status >= 500) {
            loginErrorMessage = 'Login service is temporarily unavailable. Please try again in a moment.';
          }
        }
        setLoginError(loginErrorMessage);
        setIsLoading(false);
        return;
      }

      const loginData = await loginResponse.json();

      if (loginData.mfaEnrollmentRequired) {
        setMfaUserId(loginData.userId);
        setMfaUserEmail(loginData.email || normalizedEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAEnrollment(true);
        setIsLoading(false);
        return;
      }

      if (loginData.mfaRequired) {
        setMfaUserId(loginData.userId);
        setMfaUserEmail(normalizedEmail);
        setTrustDurationDays(loginData.trustDurationDays || null);
        setShowMFAVerification(true);
        setIsLoading(false);
        return;
      }

      persistLoggedInUser(loginData.user);
      enterAppAfterLogin();
    } catch (error) {
      console.error('Login failed:', error);
      setLoginError('Login failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRegisterConsultant = async () => {
    setLoginError('');
    setIsLoading(true);

    if (
      !loginName ||
      !loginEmail ||
      !loginPassword ||
      !loginPhone ||
      !loginCompanyName ||
      !loginCompanyAddress1 ||
      !loginCompanyCity ||
      !loginCompanyState ||
      !loginCompanyZip
    ) {
      setLoginError('Please fill in all required fields');
      setIsLoading(false);
      return;
    }

    try {
      await authApi.register({
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
        companyWebsite: loginCompanyWebsite || undefined,
      });

      const signInResult = await nextAuthSignIn('credentials', {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });

      if (signInResult?.error || !signInResult?.ok) {
        setLoginError('Registration successful but login failed. Please try logging in.');
        setIsRegistering(false);
        setIsLoading(false);
        return;
      }

      await waitForNextAuthSession();

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
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

      persistLoggedInUser(loginData.user);
      enterAppAfterLogin();
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
      setIsLoading(false);
    }
  };

  const handleMfaFinished = async () => {
    setShowMFAEnrollment(false);
    setShowMFAVerification(false);
    setTrustDurationDays(null);
    try {
      await finishAuthenticatedLogin();
    } catch (error) {
      console.error('Failed to complete login after MFA:', error);
      setLoginError('Failed to complete login after MFA');
    }
  };

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
      {showMFAEnrollment && (
        <MFAEnrollmentModal
          userId={mfaUserId}
          userEmail={mfaUserEmail}
          onComplete={handleMfaFinished}
          onCancel={() => {
            setShowMFAEnrollment(false);
            setLoginError('Login cancelled');
          }}
          trustDurationDays={trustDurationDays || undefined}
        />
      )}
      {showMFAVerification && (
        <MFAVerificationModal
          userId={mfaUserId}
          userEmail={mfaUserEmail}
          onSuccess={handleMfaFinished}
          onCancel={() => {
            setShowMFAVerification(false);
            setLoginError('Login cancelled');
          }}
          trustDurationDays={trustDurationDays || undefined}
        />
      )}
    </>
  );
}

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
          Loading…
        </div>
      }
    >
      <LoginClientInner />
    </Suspense>
  );
}
