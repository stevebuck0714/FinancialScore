'use client';

import React, { useState, useEffect } from 'react';

interface MFAEnrollmentModalProps {
  userId: string;
  userEmail: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export default function MFAEnrollmentModal({ userId, userEmail, onComplete, onCancel }: MFAEnrollmentModalProps) {
  const [step, setStep] = useState<'loading' | 'qrcode' | 'verify' | 'backup' | 'complete'>('loading');
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Generate MFA secret and QR code
  useEffect(() => {
    enrollMFA();
  }, []);

  const enrollMFA = async () => {
    try {
      const response = await fetch('/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate MFA enrollment');
      }

      const data = await response.json();
      setQrCodeDataURL(data.qrCodeDataURL);
      setSecret(data.secret);
      setBackupCodes(data.backupCodes);
      setStep('qrcode');
    } catch (err: any) {
      setError(err.message || 'Failed to start MFA enrollment');
      setStep('qrcode'); // Show error but allow retry
    }
  };

  // Step 2: Verify the TOTP code
  const verifyEnrollment = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/mfa/verify-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: verificationCode })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid verification code');
      }

      setStep('backup');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackupCodesAcknowledged = () => {
    setStep('complete');
    // Small delay then complete
    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  const downloadBackupCodes = () => {
    const text = `Corelytics MFA Backup Codes\nAccount: ${userEmail}\n\n${backupCodes.join('\n')}\n\nStore these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corelytics-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '500px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Loading State */}
        {step === 'loading' && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '16px' }}>🔐</div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Setting up MFA...
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Please wait</p>
          </div>
        )}

        {/* Step 1: QR Code Display */}
        {step === 'qrcode' && (
          <div style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', textAlign: 'center' }}>
              🔐 Set Up Two-Factor Authentication
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
              Protect your account with an authenticator app
            </p>

            <div style={{ 
              background: '#f8fafc', 
              padding: '16px', 
              borderRadius: '12px', 
              marginBottom: '24px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: '600' }}>
                Step 1: Download an authenticator app
              </p>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                • Google Authenticator (iOS, Android)
              </p>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                • Authy (iOS, Android, Desktop)
              </p>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                • Microsoft Authenticator (iOS, Android)
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: '600' }}>
                Step 2: Scan this QR code
              </p>
              {qrCodeDataURL ? (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center',
                  padding: '16px',
                  background: 'white',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0'
                }}>
                  <img src={qrCodeDataURL} alt="MFA QR Code" style={{ width: '200px', height: '200px' }} />
                </div>
              ) : (
                <div style={{ 
                  padding: '40px', 
                  textAlign: 'center', 
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px dashed #e2e8f0'
                }}>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>Loading QR code...</p>
                </div>
              )}
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

            <button
              onClick={() => setStep('verify')}
              disabled={!qrCodeDataURL}
              style={{
                width: '100%',
                padding: '12px',
                background: qrCodeDataURL ? '#667eea' : '#cbd5e1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: qrCodeDataURL ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => qrCodeDataURL && (e.currentTarget.style.background = '#5568d3')}
              onMouseLeave={(e) => qrCodeDataURL && (e.currentTarget.style.background = '#667eea')}
            >
              I've Scanned the Code →
            </button>
          </div>
        )}

        {/* Step 2: Verify Code */}
        {step === 'verify' && (
          <div style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', textAlign: 'center' }}>
              Verify Your Setup
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
              Enter the 6-digit code from your authenticator app
            </p>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                Verification Code
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                  setError('');
                }}
                placeholder="000000"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '24px',
                  textAlign: 'center',
                  letterSpacing: '8px',
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

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setStep('qrcode')}
                disabled={isSubmitting}
                style={{
                  flex: 1,
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
                ← Back
              </button>
              <button
                onClick={verifyEnrollment}
                disabled={verificationCode.length !== 6 || isSubmitting}
                style={{
                  flex: 2,
                  padding: '12px',
                  background: verificationCode.length === 6 && !isSubmitting ? '#667eea' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: verificationCode.length === 6 && !isSubmitting ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => verificationCode.length === 6 && !isSubmitting && (e.currentTarget.style.background = '#5568d3')}
                onMouseLeave={(e) => verificationCode.length === 6 && !isSubmitting && (e.currentTarget.style.background = '#667eea')}
              >
                {isSubmitting ? 'Verifying...' : 'Verify & Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Backup Codes */}
        {step === 'backup' && (
          <div style={{ padding: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', textAlign: 'center' }}>
              ✅ MFA Enabled Successfully!
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
              Save these backup codes in a safe place
            </p>

            <div style={{ 
              background: '#fffbeb', 
              padding: '16px', 
              borderRadius: '12px', 
              marginBottom: '24px',
              border: '2px solid #fbbf24'
            }}>
              <p style={{ fontSize: '14px', color: '#92400e', marginBottom: '12px', fontWeight: '600' }}>
                ⚠️ Important: Save These Backup Codes
              </p>
              <p style={{ fontSize: '13px', color: '#78350f' }}>
                If you lose access to your authenticator app, you can use these codes to sign in. Each code can only be used once.
              </p>
            </div>

            <div style={{ 
              background: '#f8fafc', 
              padding: '20px', 
              borderRadius: '12px', 
              marginBottom: '20px',
              border: '2px solid #e2e8f0',
              fontFamily: 'monospace'
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px'
              }}>
                {backupCodes.map((code, index) => (
                  <div key={index} style={{ 
                    padding: '10px', 
                    background: 'white', 
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1e293b',
                    textAlign: 'center',
                    border: '1px solid #e2e8f0'
                  }}>
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={downloadBackupCodes}
              style={{
                width: '100%',
                padding: '12px',
                background: 'white',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '12px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#667eea';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.color = '#667eea';
              }}
            >
              📥 Download Backup Codes
            </button>

            <button
              onClick={handleBackupCodesAcknowledged}
              style={{
                width: '100%',
                padding: '12px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
            >
              I've Saved My Backup Codes →
            </button>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              All Set!
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              Your account is now protected with two-factor authentication
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
