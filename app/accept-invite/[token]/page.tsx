import Link from 'next/link';

export default function AcceptInvitePage() {
  return (
    <div style={{ maxWidth: '560px', margin: '48px auto', padding: '28px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h1 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>Invite links are no longer used</h1>
      <p style={{ marginTop: '10px', color: '#475569', fontSize: '14px' }}>
        Corelytics accounts are now set up by your administrator. You will receive a welcome email, and your
        administrator will give you a temporary password separately. Sign in with it, and you will be asked to
        choose a new password.
      </p>
      <p style={{ marginTop: '10px', color: '#475569', fontSize: '14px' }}>
        If you have not received a temporary password, contact the person who invited you.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          marginTop: '8px',
          borderRadius: '8px',
          background: '#1F70C1',
          color: 'white',
          padding: '10px 14px',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Go to sign in
      </Link>
    </div>
  );
}
