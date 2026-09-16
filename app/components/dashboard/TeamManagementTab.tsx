'use client';

import React from 'react';
import { formatPhoneNumber } from '@/app/utils/phone';
import PasswordInput from '@/app/components/common/PasswordInput';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimaryContact?: boolean;
  assignedCompanyIds?: string[];
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
  removeTeamMember: (id: string, name: string) => void;
  companies: Array<{ id: string; name: string | null }>;
  updateTeamMemberAssignments: (id: string, companyIds: string[]) => void;
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
  companies,
  updateTeamMemberAssignments,
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
              type="tel"
              placeholder="(555) 777-1212"
              value={newTeamMember.phone}
              onChange={(e) => setNewTeamMember({...newTeamMember, phone: formatPhoneNumber(e.target.value)})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <input
              type="text"
              placeholder="Title/Role"
              value={newTeamMember.title}
              onChange={(e) => setNewTeamMember({...newTeamMember, title: e.target.value})}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
            <PasswordInput
              placeholder="Password *"
              value={newTeamMember.password}
              onChange={(value) => setNewTeamMember({...newTeamMember, password: value})}
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
        Assign each team member only to the client companies they should access.
      </div>

      {consultantTeamMembers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No Team Members Yet</div>
          <div style={{ fontSize: '14px' }}>Add a team member, then assign the client companies they can access.</div>
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

      {consultantTeamMembers.some((member) => !member.isPrimaryContact) && (
        <div style={{ marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#334155', margin: '0 0 6px' }}>
            Company Assignments
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px' }}>
            Select each consultant who should have access to a company. A company may be assigned to multiple team members.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#64748b', minWidth: '220px' }}>
                    Company
                  </th>
                  {consultantTeamMembers.filter((member) => !member.isPrimaryContact).map((member) => (
                    <th key={member.id} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#64748b', minWidth: '140px' }}>
                      {member.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={consultantTeamMembers.filter((member) => !member.isPrimaryContact).length + 1} style={{ padding: '18px 12px', color: '#64748b', fontSize: '13px' }}>
                      No client companies are available to assign.
                    </td>
                  </tr>
                ) : (
                  [...companies]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((company) => (
                      <tr key={company.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', color: '#1e293b', fontSize: '14px', fontWeight: '500' }}>
                          {company.name || 'Unnamed company'}
                        </td>
                        {consultantTeamMembers.filter((member) => !member.isPrimaryContact).map((member) => {
                          const isAssigned = (member.assignedCompanyIds || []).includes(company.id);
                          return (
                            <td key={member.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                aria-label={`${isAssigned ? 'Remove' : 'Assign'} ${member.name} ${isAssigned ? 'from' : 'to'} ${company.name || 'this company'}`}
                                checked={isAssigned}
                                disabled={isLoading}
                                onChange={(event) => {
                                  const nextAssignments = new Set(member.assignedCompanyIds || []);
                                  if (event.currentTarget.checked) {
                                    nextAssignments.add(company.id);
                                  } else {
                                    nextAssignments.delete(company.id);
                                  }
                                  updateTeamMemberAssignments(member.id, Array.from(nextAssignments));
                                }}
                                style={{ width: '16px', height: '16px', cursor: isLoading ? 'not-allowed' : 'pointer' }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
