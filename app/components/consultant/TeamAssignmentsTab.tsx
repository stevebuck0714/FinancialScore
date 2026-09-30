'use client';

import React from 'react';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  title?: string;
  isPrimaryContact?: boolean;
  assignedCompanyIds?: string[];
};

type Company = {
  id: string;
  name: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  assignedTeamMembers?: Array<{ id: string; name: string; email: string }>;
};

interface TeamAssignmentsTabProps {
  teamMembers: TeamMember[];
  companies: Company[];
}

export default function TeamAssignmentsTab({ teamMembers, companies }: TeamAssignmentsTabProps) {
  const assignedMemberIdsForCompany = (company: Company) =>
    teamMembers
      .filter((member) =>
        Boolean(member.assignedCompanyIds?.includes(company.id)) ||
        Boolean(company.assignedTeamMembers?.some((assigned) => assigned.id === member.id))
      )
      .map((member) => member.id);

  const sortedCompanies = [...companies].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
  const membersWithCompanies = teamMembers
    .map((member) => ({
      member,
      companies: sortedCompanies.filter((company) => assignedMemberIdsForCompany(company).includes(member.id)),
    }))
    .sort((left, right) => left.member.name.localeCompare(right.member.name));
  const unassignedCompanies = sortedCompanies.filter((company) => assignedMemberIdsForCompany(company).length === 0);

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }}>Team Assignments</h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          Review each consultant&apos;s company portfolio and identify companies without an assignment.
        </p>
      </div>

      {membersWithCompanies.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No team members are available.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {membersWithCompanies.map(({ member, companies: memberCompanies }) => (
            <section key={member.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{member.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {member.title || member.email}
                    </div>
                  </div>
                  <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#e0e7ff', color: '#3730a3', fontSize: '12px', fontWeight: 700 }}>
                    {memberCompanies.length} {memberCompanies.length === 1 ? 'company' : 'companies'}
                  </span>
                </div>
              </div>
              <div style={{ padding: '6px 16px 12px' }}>
                {memberCompanies.length === 0 ? (
                  <div style={{ padding: '14px 0', color: '#64748b', fontSize: '13px' }}>No companies assigned.</div>
                ) : (
                  memberCompanies.map((company) => (
                    <div key={company.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>{company.name || 'Unnamed company'}</div>
                      {(company.industry || (company.city && company.state)) && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                          {[company.industry, company.city && company.state ? `${company.city}, ${company.state}` : null].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {unassignedCompanies.length > 0 && (
        <section style={{ marginTop: '20px', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px', background: '#fffbeb' }}>
          <h3 style={{ fontSize: '15px', color: '#92400e', margin: '0 0 8px' }}>Unassigned companies ({unassignedCompanies.length})</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {unassignedCompanies.map((company) => (
              <span key={company.id} style={{ padding: '5px 8px', borderRadius: '6px', background: 'white', border: '1px solid #fde68a', color: '#78350f', fontSize: '12px', fontWeight: 600 }}>
                {company.name || 'Unnamed company'}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
