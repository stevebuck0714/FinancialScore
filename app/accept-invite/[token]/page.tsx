'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type InviteDetails = {
  company: { id: string; name: string | null };
  invite: {
    email: string;
    name: string;
    userType: 'COMPANY' | 'ASSESSMENT';
    expiresAt: string;
    accountExists: boolean;
  };
};

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = String(params?.token || '');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/company-invites/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Invite is invalid');
        setDetails(data);
        setName(String(data?.invite?.name || ''));
      } catch (e: any) {
        setError(e?.message || 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const requiresPassword = useMemo(() => !details?.invite?.accountExists, [details]);

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/company-invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: name.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to accept invite');
      setSuccessMessage(String(data?.message || 'Invite accepted. Please sign in.'));
      setTimeout(() => router.push('/'), 1400);
    } catch (e: any) {
      setError(e?.message || 'Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '32px', fontSize: '14px', color: '#64748b' }}>Loading invite...</div>;
  }

  return (
    <div style={{ maxWidth: '560px', margin: '48px auto', padding: '28px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h1 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>Accept Corelytics Invite</h1>
      {details && (
        <p style={{ marginTop: '10px', color: '#475569', fontSize: '14px' }}>
          You are invited to <strong>{details.company.name || 'a company'}</strong> as a{' '}
          <strong>{details.invite.userType === 'ASSESSMENT' ? 'Team Assessment User' : 'Company User'}</strong>.
        </p>
      )}

      {error && (
        <div style={{ marginTop: '12px', padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '12px' }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{ marginTop: '12px', padding: '10px', background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '8px', fontSize: '12px' }}>
          {successMessage}
        </div>
      )}

      {details && (
        <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: '#334155' }}>
            Email
            <input value={details.invite.email} readOnly style={{ marginTop: '4px', width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc' }} />
          </label>
          <label style={{ fontSize: '12px', color: '#334155' }}>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!requiresPassword}
              style={{ marginTop: '4px', width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: requiresPassword ? 'white' : '#f8fafc' }}
            />
          </label>
          {requiresPassword ? (
            <label style={{ fontSize: '12px', color: '#334155' }}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                style={{ marginTop: '4px', width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
              />
            </label>
          ) : (
            <div style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
              An account already exists for this email. Accept invite, then sign in with your current credentials.
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{
              marginTop: '4px',
              border: 'none',
              borderRadius: '8px',
              background: submitting ? '#94a3b8' : '#1F70C1',
              color: 'white',
              padding: '10px 14px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Accepting...' : 'Accept Invite'}
          </button>
        </div>
      )}
    </div>
  );
}

