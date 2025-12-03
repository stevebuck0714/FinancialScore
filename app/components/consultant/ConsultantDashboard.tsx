'use client';

import React from 'react';
import TeamManagementTab from '../dashboard/TeamManagementTab';
import CompanyListTab from './CompanyListTab';

interface ConsultantDashboardProps {
  currentUser: {
    isPrimaryContact?: boolean;
  };
  consultantDashboardTab: string;
  setConsultantDashboardTab: (tab: string) => void;
  consultantTeamMembers: any[];
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
  companies: any[];
  setCurrentView: (view: any) => void;
  setSelectedCompanyId: (id: string) => void;
  setAdminDashboardTab: (tab: string) => void;
  setCompanyManagementSubTab: (tab: string) => void;
  setCompanyToDelete: (company: { companyId: string; businessId: string; companyName: string }) => void;
  setShowDeleteConfirmation: (show: boolean) => void;
  isLoading: boolean;
}

export default function ConsultantDashboard({
  currentUser,
  consultantDashboardTab,
  setConsultantDashboardTab,
  consultantTeamMembers,
  showAddTeamMemberForm,
  setShowAddTeamMemberForm,
  newTeamMember,
  setNewTeamMember,
  addTeamMember,
  removeTeamMember,
  companies,
  setCurrentView,
  setSelectedCompanyId,
  setAdminDashboardTab,
  setCompanyManagementSubTab,
  setCompanyToDelete,
  setShowDeleteConfirmation,
  isLoading
}: ConsultantDashboardProps) {
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
          Consultant Dashboard
        </h1>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
        {currentUser?.isPrimaryContact && (
          <button
            onClick={() => setConsultantDashboardTab('team-management')}
            style={{
              padding: '12px 24px',
              background: consultantDashboardTab === 'team-management' ? '#667eea' : 'transparent',
              color: consultantDashboardTab === 'team-management' ? 'white' : '#64748b',
              border: 'none',
              borderBottom: consultantDashboardTab === 'team-management' ? '3px solid #667eea' : '3px solid transparent',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              transition: 'all 0.2s'
            }}
          >
            Team Management
          </button>
        )}
        <button
          onClick={() => setConsultantDashboardTab('company-list')}
          style={{
            padding: '12px 24px',
            background: consultantDashboardTab === 'company-list' ? '#667eea' : 'transparent',
            color: consultantDashboardTab === 'company-list' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: consultantDashboardTab === 'company-list' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Company List
        </button>
      </div>

      {/* Team Management Tab */}
      {consultantDashboardTab === 'team-management' && currentUser?.isPrimaryContact && (
        <TeamManagementTab
          consultantTeamMembers={consultantTeamMembers}
          showAddTeamMemberForm={showAddTeamMemberForm}
          setShowAddTeamMemberForm={setShowAddTeamMemberForm}
          newTeamMember={newTeamMember}
          setNewTeamMember={setNewTeamMember}
          addTeamMember={addTeamMember}
          removeTeamMember={removeTeamMember}
          isLoading={isLoading}
        />
      )}

      {/* Company List Tab */}
      {consultantDashboardTab === 'company-list' && (
        <CompanyListTab
          companies={companies}
          setCurrentView={setCurrentView}
          setSelectedCompanyId={setSelectedCompanyId}
          setAdminDashboardTab={setAdminDashboardTab}
          setCompanyManagementSubTab={setCompanyManagementSubTab}
          setCompanyToDelete={setCompanyToDelete}
          setShowDeleteConfirmation={setShowDeleteConfirmation}
        />
      )}
    </div>
  );
}

