'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: params.token,
          password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccess('Password reset successful! Redirecting to login...');
      setTimeout(() => {
        router.push('/');
      }, 2000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '32px', 
        width: '100%', 
        maxWidth: '420px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: '700', 
          color: '#1e293b', 
          marginBottom: '8px',
          textAlign: 'center' 
        }}>
          Reset Your Password
        </h1>
        
        <p style={{ 
          fontSize: '14px', 
          color: '#64748b', 
          marginBottom: '24px',
          textAlign: 'center' 
        }}>
          Enter your new password below
        </p>

        {error && (
          <div style={{ 
            padding: '12px 16px', 
            background: '#fee2e2', 
            color: '#991b1b', 
            borderRadius: '8px', 
            marginBottom: '16px', 
            fontSize: '14px', 
            border: '1px solid #fecaca' 
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ 
            padding: '12px 16px', 
            background: '#d1fae5', 
            color: '#065f46', 
            borderRadius: '8px', 
            marginBottom: '16px', 
            fontSize: '14px', 
            border: '1px solid #6ee7b7' 
          }}>
            {success}
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#475569', 
                marginBottom: '6px' 
              }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  disabled={isLoading}
                  style={{ 
                    width: '100%', 
                    padding: '12px 40px 12px 16px',
                    borderRadius: '8px', 
                    border: '1px solid #cbd5e1', 
                    fontSize: '14px',
                    outline: 'none'
                  }} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px'
                  }}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#475569', 
                marginBottom: '6px' 
              }}>
                Confirm Password
              </label>
              <input 
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                disabled={isLoading}
                style={{ 
                  width: '100%', 
                  padding: '12px 16px',
                  borderRadius: '8px', 
                  border: '1px solid #cbd5e1', 
                  fontSize: '14px',
                  outline: 'none'
                }} 
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              style={{ 
                width: '100%', 
                padding: '14px', 
                background: isLoading ? '#94a3b8' : '#667eea', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '16px', 
                fontWeight: '600', 
                cursor: isLoading ? 'not-allowed' : 'pointer',
                marginBottom: '12px',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <button 
              type="button"
              onClick={() => router.push('/')}
              disabled={isLoading}
              style={{ 
                width: '100%', 
                padding: '14px', 
                background: '#f1f5f9', 
                color: '#475569', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '14px', 
                fontWeight: '600', 
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

