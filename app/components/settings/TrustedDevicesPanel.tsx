'use client';

import React, { useState, useEffect } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';

interface TrustedDevice {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

interface TrustedDevicesPanelProps {
  userId: string;
}

export default function TrustedDevicesPanel({ userId }: TrustedDevicesPanelProps) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [trustDurationDays, setTrustDurationDays] = useState<number | null>(null);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, [userId]);

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch('/api/auth/trusted-devices', {
        headers: {
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load trusted devices');
      }

      const data = await response.json();
      setDevices(data.devices || []);
      setTrustDurationDays(typeof data.trustDurationDays === 'number' ? data.trustDurationDays : null);
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
    } finally {
      setIsLoading(false);
    }
  };

  const revokeDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to revoke this device? You will need to enter your MFA code the next time you log in from this device.')) {
      return;
    }

    try {
      setIsRevoking(deviceId);
      const response = await fetch(`/api/auth/trusted-devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to revoke device');
      }

      // Reload devices
      await loadDevices();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke device');
    } finally {
      setIsRevoking(null);
    }
  };

  const revokeAllDevices = async () => {
    if (!confirm('Are you sure you want to revoke ALL trusted devices? You will need to enter your MFA code on all devices the next time you log in.')) {
      return;
    }

    try {
      setIsRevoking('all');
      const response = await fetch('/api/auth/trusted-devices', {
        method: 'DELETE',
        headers: {
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to revoke all devices');
      }

      // Reload devices
      await loadDevices();
      alert('All trusted devices have been revoked successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to revoke devices');
    } finally {
      setIsRevoking(null);
    }
  };

  const formatDate = (dateString: string) => formatEstDateTime(dateString) || 'N/A';

  const getDaysRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const daysRemaining = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysRemaining;
  };

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
        Loading trusted devices...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
          Trusted Devices
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          Manage devices that don't require MFA verification for {trustDurationDays ? `${trustDurationDays} days` : 'the configured trust duration'}. Remove any devices you don't recognize.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee2e2',
          color: '#991b1b',
          borderRadius: '8px',
          fontSize: '14px',
          marginBottom: '16px',
          border: '1px solid #fecaca'
        }}>
          {error}
        </div>
      )}

      {devices.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
            No Trusted Devices
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            You haven't added any trusted devices yet. Check "Remember this device" during MFA verification to add one.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            {devices.map((device) => {
              const daysRemaining = getDaysRemaining(device.expiresAt);
              const isExpiringSoon = daysRemaining <= 7;

              return (
                <div
                  key={device.id}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    marginBottom: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>💻</span>
                        <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                          {device.deviceName}
                        </h4>
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        <strong>IP Address:</strong> {device.ipAddress || 'Unknown'}
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        <strong>Added:</strong> {formatDate(device.createdAt)}
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        <strong>Last Used:</strong> {formatDate(device.lastUsedAt)}
                      </div>
                      
                      <div style={{ 
                        fontSize: '13px', 
                        color: isExpiringSoon ? '#dc2626' : '#64748b',
                        fontWeight: isExpiringSoon ? '600' : 'normal'
                      }}>
                        <strong>Expires:</strong> {formatDate(device.expiresAt)} ({daysRemaining} days remaining)
                      </div>
                    </div>
                    
                    <button
                      onClick={() => revokeDevice(device.id)}
                      disabled={isRevoking === device.id}
                      style={{
                        padding: '8px 16px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: isRevoking === device.id ? 'not-allowed' : 'pointer',
                        opacity: isRevoking === device.id ? 0.5 : 1
                      }}
                    >
                      {isRevoking === device.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {devices.length > 1 && (
            <button
              onClick={revokeAllDevices}
              disabled={isRevoking === 'all'}
              style={{
                padding: '12px 24px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isRevoking === 'all' ? 'not-allowed' : 'pointer',
                opacity: isRevoking === 'all' ? 0.5 : 1
              }}
            >
              {isRevoking === 'all' ? 'Revoking All...' : 'Revoke All Devices'}
            </button>
          )}
        </>
      )}

      <div style={{
        marginTop: '24px',
        padding: '16px',
        background: '#fef3c7',
        borderLeft: '4px solid #f59e0b',
        borderRadius: '4px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: '0 0 4px 0' }}>
              Security Reminder
            </h4>
            <p style={{ fontSize: '13px', color: '#92400e', margin: 0, lineHeight: '1.5' }}>
              Only trust devices you own and use regularly. If you see a device you don't recognize, revoke it immediately and consider changing your password.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

