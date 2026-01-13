'use client';

import React, { useState } from 'react';

interface MFAVerificationModalProps {
  userId: string;
  userEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MFAVerificationModal({ userId, userEmail, onSuccess, onCancel }: MFAVerificationModalProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBackupCodeInput, setShowBackupCodeInput] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  const verifyMFACode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/mfa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          token: verificationCode,
          isBackupCode: showBackupCodeInput,
          rememberDevice: rememberDevice
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid verification code');
      }

      // Success - trigger login completion
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6 && !isSubmitting) {
      verifyMFACode();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      overflow: 'auto'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '450px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '32px',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: 'auto'
      }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: '700', 
          color: '#1e293b', 
          marginBottom: '8px', 
          textAlign: 'center' 
        }}>
          🔐 Two-Factor Authentication
        </h2>
        <p style={{ 
          color: '#64748b', 
          fontSize: '14px', 
          marginBottom: '24px', 
          textAlign: 'center' 
        }}>
          {showBackupCodeInput 
            ? 'Enter one of your backup codes' 
            : 'Enter the 6-digit code from your authenticator app'}
        </p>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '14px', 
            fontWeight: '600', 
            color: '#475569', 
            marginBottom: '8px' 
          }}>
            {showBackupCodeInput ? 'Backup Code' : 'Verification Code'}
          </label>
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => {
              const value = showBackupCodeInput 
                ? e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()
                : e.target.value.replace(/\D/g, '').slice(0, 6);
              setVerificationCode(value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            placeholder={showBackupCodeInput ? 'XXXXXXXXXX' : '000000'}
            maxLength={showBackupCodeInput ? 10 : 6}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: showBackupCodeInput ? '18px' : '24px',
              textAlign: 'center',
              letterSpacing: showBackupCodeInput ? '4px' : '8px',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              outline: 'none',
              fontFamily: 'monospace',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            autoFocus
          />
        </div>

        {error && (
          <div style={{ 
            padding: '12px', 
            background: '#fee2e2', 
            color: '#991b1b', 
            borderRadius: '8px', 
            fontSize: '13px',
            marginBottom: '16px',
            border: '1px solid #fecaca'
          }}>
            {error}
          </div>
        )}

        {/* Remember Device Checkbox */}
        <div style={{ 
          marginBottom: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#475569'
          }}>
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              style={{
                marginRight: '8px',
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
            <span>
              <strong>Remember this device for 100 days</strong>
              <br />
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Don't check this on shared or public computers
              </span>
            </span>
          </label>
        </div>

        <button
          onClick={verifyMFACode}
          disabled={
            (showBackupCodeInput ? verificationCode.length < 6 : verificationCode.length !== 6) 
            || isSubmitting
          }
          style={{
            width: '100%',
            padding: '12px',
            background: (
              (showBackupCodeInput ? verificationCode.length >= 6 : verificationCode.length === 6) 
              && !isSubmitting
            ) ? '#667eea' : '#cbd5e1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: (
              (showBackupCodeInput ? verificationCode.length >= 6 : verificationCode.length === 6) 
              && !isSubmitting
            ) ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            marginBottom: '12px'
          }}
          onMouseEnter={(e) => {
            if ((showBackupCodeInput ? verificationCode.length >= 6 : verificationCode.length === 6) && !isSubmitting) {
              e.currentTarget.style.background = '#5568d3';
            }
          }}
          onMouseLeave={(e) => {
            if ((showBackupCodeInput ? verificationCode.length >= 6 : verificationCode.length === 6) && !isSubmitting) {
              e.currentTarget.style.background = '#667eea';
            }
          }}
        >
          {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
        </button>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <button
            onClick={() => {
              setShowBackupCodeInput(!showBackupCodeInput);
              setVerificationCode('');
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#667eea',
              fontSize: '13px',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '0'
            }}
          >
            {showBackupCodeInput ? '← Use authenticator app' : 'Use backup code instead'}
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '12px',
            background: 'white',
            color: '#64748b',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer'
          }}
        >
          Cancel
        </button>

        <div style={{ 
          marginTop: '20px', 
          padding: '12px', 
          background: '#f8fafc', 
          borderRadius: '8px',
          fontSize: '12px',
          color: '#64748b',
          textAlign: 'center',
          border: '1px solid #e2e8f0'
        }}>
          <p style={{ margin: 0 }}>
            💡 <strong>Tip:</strong> Open your authenticator app (Google Authenticator, Authy, etc.) to get your code
          </p>
        </div>
      </div>
    </div>
  );
}
