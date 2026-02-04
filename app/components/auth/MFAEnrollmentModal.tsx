'use client';

import React, { useState, useEffect } from 'react';

interface MFAEnrollmentModalProps {
  userId: string;
  userEmail: string;
  onComplete: () => void;
  onCancel?: () => void;
  trustDurationDays?: number;
}

export default function MFAEnrollmentModal({ userId, userEmail, onComplete, onCancel, trustDurationDays }: MFAEnrollmentModalProps) {
  const [step, setStep] = useState<'loading' | 'qrcode' | 'verify' | 'backup' | 'complete'>('loading');
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const trustDurationMax = Number.isFinite(trustDurationDays) ? Math.floor(trustDurationDays as number) : 60;
  const [selectedTrustDurationDays, setSelectedTrustDurationDays] = useState(trustDurationMax);

  useEffect(() => {
    setSelectedTrustDurationDays(trustDurationMax);
  }, [trustDurationMax]);

  const trustDurationOptions = [
    7, 14, 30, 60, 90, 120, 180
  ].filter((days) => days <= trustDurationMax);

  if (trustDurationOptions.length === 0) {
    trustDurationOptions.push(trustDurationMax);
  } else if (!trustDurationOptions.includes(trustDurationMax)) {
    trustDurationOptions.push(trustDurationMax);
    trustDurationOptions.sort((a, b) => a - b);
  }

  // Step 1: Generate MFA secret and QR code
  useEffect(() => {
    enrollMFA();
  }, []);

  const enrollMFA = async () => {
    try {
      console.log('🔐 Starting MFA enrollment for userId:', userId);
      const response = await fetch('/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      console.log('📡 MFA enrollment response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ MFA enrollment failed:', errorData);
        throw new Error(errorData.error || 'Failed to initiate MFA enrollment');
      }

      const data = await response.json();
      console.log('✅ MFA enrollment data received:', {
        hasQRCode: !!data.qrCodeDataURL,
        hasSecret: !!data.secret,
        backupCodeCount: data.backupCodes?.length || 0
      });
      
      setQrCodeDataURL(data.qrCodeDataURL);
      setSecret(data.secret);
      setBackupCodes(data.backupCodes);
      setStep('qrcode');
    } catch (err: any) {
      console.error('❌ MFA enrollment error:', err);
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
      const payload: {
        userId: string;
        token: string;
        rememberDevice: boolean;
        trustDurationDays?: number;
      } = {
        userId,
        token: verificationCode,
        rememberDevice: rememberDevice
      };

      if (rememberDevice) {
        payload.trustDurationDays = selectedTrustDurationDays;
      }

      const response = await fetch('/api/auth/mfa/verify-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload) // Fixed: API expects 'token' not 'code'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid verification code');
      }

      const data = await response.json();
      console.log('✅ MFA verification successful, user data received:', data);

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
    const text = `Corelytics MFA Backup Codes\nAccount: ${userEmail}\nGenerated: ${new Date().toLocaleString()}\n\n${backupCodes.join('\n')}\n\n⚠️ IMPORTANT:\n- Store these codes in a safe place\n- Each code can only be used once\n- Use these if you lose access to your authenticator app\n- Keep them secure - anyone with these codes can access your account`;
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

  const printBackupCodes = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Corelytics Backup Codes</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
              h1 { color: #1e293b; font-size: 24px; margin-bottom: 8px; }
              .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
              .warning { background: #fffbeb; border: 2px solid #fbbf24; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
              .warning h2 { color: #92400e; font-size: 16px; margin: 0 0 8px 0; }
              .warning p { color: #78350f; font-size: 13px; margin: 4px 0; }
              .codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px; }
              .code { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 16px; font-weight: 600; text-align: center; }
              @media print {
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>🔐 Corelytics MFA Backup Codes</h1>
            <div class="meta">
              <strong>Account:</strong> ${userEmail}<br>
              <strong>Generated:</strong> ${new Date().toLocaleString()}
            </div>
            <div class="warning">
              <h2>⚠️ IMPORTANT - Keep These Safe!</h2>
              <p>• Store these codes in a secure location</p>
              <p>• Each code can only be used once</p>
              <p>• Use these if you lose access to your authenticator app</p>
              <p>• Anyone with these codes can access your account</p>
            </div>
            <div class="codes">
              ${backupCodes.map(code => `<div class="code">${code}</div>`).join('')}
            </div>
            <button class="no-print" onclick="window.print()" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; margin-right: 8px;">Print</button>
            <button class="no-print" onclick="window.close()" style="padding: 12px 24px; background: white; color: #64748b; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 15px; cursor: pointer;">Close</button>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const copyToClipboard = () => {
    const text = backupCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('✅ Backup codes copied to clipboard!\n\nPaste them into your password manager or a secure document.');
    }).catch(() => {
      alert('❌ Failed to copy to clipboard. Please download or print the codes instead.');
    });
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
                  <strong>Remember this device for {selectedTrustDurationDays} days</strong>
                  <br />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Don't check this on shared or public computers
                  </span>
                </span>
              </label>
              <div style={{
                marginTop: '10px',
                opacity: rememberDevice ? 1 : 0.6
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#475569',
                  marginBottom: '6px'
                }}>
                  Trust Duration Days
                </label>
                <select
                  value={selectedTrustDurationDays}
                  onChange={(e) => setSelectedTrustDurationDays(parseInt(e.target.value, 10))}
                  disabled={!rememberDevice}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: rememberDevice ? 'white' : '#f1f5f9',
                    cursor: rememberDevice ? 'pointer' : 'not-allowed'
                  }}
                >
                  {trustDurationOptions.map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
              Save these just in case you lose your phone
            </p>

            <div style={{ 
              background: '#eff6ff', 
              padding: '16px', 
              borderRadius: '12px', 
              marginBottom: '20px',
              border: '2px solid #3b82f6'
            }}>
              <p style={{ fontSize: '14px', color: '#1e40af', marginBottom: '8px', fontWeight: '600' }}>
                💡 Why backup codes?
              </p>
              <p style={{ fontSize: '13px', color: '#1e3a8a', marginBottom: '8px' }}>
                If you lose your phone, get a new device, or delete your authenticator app, these codes will let you sign in and set up MFA again.
              </p>
              <p style={{ fontSize: '13px', color: '#1e3a8a', fontWeight: '600' }}>
                Each code works only once, so keep them safe!
              </p>
            </div>

            <div style={{ 
              background: '#fef3c7', 
              padding: '12px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              border: '1px solid #fbbf24'
            }}>
              <p style={{ fontSize: '12px', color: '#92400e', margin: 0, marginBottom: '6px' }}>
                💾 <strong>Recommended:</strong> Store these in your password manager (1Password, LastPass, Bitwarden, etc.)
              </p>
              <p style={{ fontSize: '12px', color: '#92400e', margin: 0 }}>
                📧 <strong>Or:</strong> Copy and email them to yourself for safekeeping
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

            <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: '600' }}>
              💾 Choose how to save your codes:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={downloadBackupCodes}
                style={{
                  padding: '12px',
                  background: 'white',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
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
                📥 Download
              </button>

              <button
                onClick={printBackupCodes}
                style={{
                  padding: '12px',
                  background: 'white',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
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
                🖨️ Print
              </button>

              <button
                onClick={copyToClipboard}
                style={{
                  padding: '12px',
                  background: 'white',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  gridColumn: '1 / -1'
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
                📋 Copy to Clipboard
              </button>
            </div>

            <button
              onClick={handleBackupCodesAcknowledged}
              style={{
                width: '100%',
                padding: '14px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
            >
              ✓ I've Saved My Backup Codes
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
