'use client';

import React from 'react';

interface TeamMember {
  id: number;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimaryContact?: boolean;
}

interface TeamManagementTabProps {
  consultantTeamMembers: TeamMember[];
  showAddTeamMemberForm: boolean;
  setShowAddTeamMemberForm: (show: boolean) => void;
  newTeamMember: {
    name: string;
    email: string;
    phone: string;
    title: string;
    password: string;
  };
  setNewTeamMember: (member: any) => void;
  addTeamMember: () => void;
  removeTeamMember: (id: number, name: string) => void;
  isLoading: boolean;
}

export default function TeamManagementTab({
  consultantTeamMembers,
  showAddTeamMemberForm,
  setShowAddTeamMemberForm,
  newTeamMember,
  setNewTeamMember,
  addTeamMember,
  removeTeamMember,
  isLoading
}: TeamManagementTabProps) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Team Management</h2>
        <button
          onClick={() => setShowAddTeamMemberForm(!showAddTeamMemberForm)}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          {showAddTeamMemberForm ? 'Cancel' : '+ Add Team Member'}
        </button>
      </div>

      {showAddTeamMemberForm && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>Add New Team Member</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Full Name *"
              value={newTeamMember.name}
              onChange={(e) => setNewTeamMember({...newTeamMember, name: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <input
              type="email"
              placeholder="Email *"
              value={newTeamMember.email}
              onChange={(e) => setNewTeamMember({...newTeamMember, email: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <input
              type="text"
              placeholder="Phone"
              value={newTeamMember.phone}
              onChange={(e) => setNewTeamMember({...newTeamMember, phone: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <input
              type="text"
              placeholder="Title/Role"
              value={newTeamMember.title}
              onChange={(e) => setNewTeamMember({...newTeamMember, title: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <input
              type="password"
              placeholder="Password *"
              value={newTeamMember.password}
              onChange={(e) => setNewTeamMember({...newTeamMember, password: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
          <button
            onClick={addTeamMember}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              background: isLoading ? '#94a3b8' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? 'Adding...' : 'Add Team Member'}
          </button>
        </div>
      )}

      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
        Manage users who can access your consultant dashboard and all client companies.
      </div>

      {consultantTeamMembers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No Team Members Yet</div>
          <div style={{ fontSize: '14px' }}>Add team members to give them access to all your client companies</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Email</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Phone</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Title</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Role</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {consultantTeamMembers.map((member) => (
                <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b' }}>{member.name}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>{member.email}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>{member.phone || '-'}</td>
                  <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>{member.title || '-'}</td>
                  <td style={{ padding: '12px' }}>
                    {member.isPrimaryContact ? (
                      <span style={{ 
                        padding: '4px 12px', 
                        background: '#fef3c7', 
                        color: '#92400e', 
                        borderRadius: '12px', 
                        fontSize: '12px', 
                        fontWeight: '600' 
                      }}>
                        Primary Contact
                      </span>
                    ) : (
                      <span style={{ 
                        padding: '4px 12px', 
                        background: '#e0e7ff', 
                        color: '#3730a3', 
                        borderRadius: '12px', 
                        fontSize: '12px', 
                        fontWeight: '600' 
                      }}>
                        Team Member
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {!member.isPrimaryContact && (
                      <button
                        onClick={() => removeTeamMember(member.id, member.name)}
                        disabled={isLoading}
                        style={{
                          padding: '6px 12px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: isLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
