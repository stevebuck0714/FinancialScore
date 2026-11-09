'use client';

import React, { useState } from 'react';

interface InitialPasswordChangeModalProps {
  email: string;
  temporaryPassword: string;
  onChanged: (newPassword: string) => void;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '14px',
  border: '2px solid #e2e8f0',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: '600',
  color: '#475569',
  marginBottom: '8px',
};

export default function InitialPasswordChangeModal({
  email,
  temporaryPassword,
  onChanged,
  onCancel,
}: InitialPasswordChangeModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Enter and confirm your new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/initial-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, currentPassword: temporaryPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(data?.details) ? `\n${data.details.join('\n')}` : '';
        throw new Error(`${data?.error || 'Failed to update password'}${details}`);
      }
      onChanged(newPassword);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
      setIsSubmitting(false);
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
          Choose a New Password
        </h2>
        <p style={{
          color: '#64748b',
          fontSize: '14px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          You signed in with a temporary password. Choose a new password to continue.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
            autoComplete="new-password"
            autoFocus
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitting) submit(); }}
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
          At least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.
        </p>

        {error && (
          <div style={{
            padding: '12px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
            border: '1px solid #fecaca',
            whiteSpace: 'pre-line'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '12px',
            background: isSubmitting ? '#cbd5e1' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            marginBottom: '12px'
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save Password & Sign In'}
        </button>

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
      </div>
    </div>
  );
}
