'use client';

import React from 'react';
import ProfileTab from '../dashboard/ProfileTab';
import CompanyDetailsTab from './CompanyDetailsTab';

interface CompanyManagementTabProps {
  companyManagementSubTab: string;
  setCompanyManagementSubTab: (tab: string) => void;
  currentUser: any;
  selectedCompanyId: string;
  companies: any[];
  users: any[];
  assessmentRecords: any[];
  isLoading: boolean;
  newCompanyName: string;
  selectedAffiliateCodeForNewCompany?: string;
  setSelectedAffiliateCodeForNewCompany?: (code: string) => void;
  setNewCompanyName: (name: string) => void;
  addCompany: () => void;
  setEditingCompanyId: (id: string) => void;
  setCompanyAddressStreet: (street: string) => void;
  setCompanyAddressCity: (city: string) => void;
  setCompanyAddressState: (state: string) => void;
  setCompanyAddressZip: (zip: string) => void;
  setCompanyAddressCountry: (country: string) => void;
  setCompanyIndustrySector: (sector: string) => void;
  setShowCompanyDetailsModal: (show: boolean) => void;
  deleteUser: (id: string) => void;
  newCompanyUserName: string;
  setNewCompanyUserName: (name: string) => void;
  newCompanyUserTitle: string;
  setNewCompanyUserTitle: (title: string) => void;
  newCompanyUserEmail: string;
  setNewCompanyUserEmail: (email: string) => void;
  newCompanyUserPhone: string;
  setNewCompanyUserPhone: (phone: string) => void;
  newCompanyUserPassword: string;
  setNewCompanyUserPassword: (password: string) => void;
  addUser: (companyId: string, userType: string) => void;
  newAssessmentUserName: string;
  setNewAssessmentUserName: (name: string) => void;
  newAssessmentUserTitle: string;
  setNewAssessmentUserTitle: (title: string) => void;
  newAssessmentUserEmail: string;
  setNewAssessmentUserEmail: (email: string) => void;
  newAssessmentUserPassword: string;
  setNewAssessmentUserPassword: (password: string) => void;
  setSelectedCompanyId: (id: string) => void;
  // Profile tab props
  company: any;
  companyProfiles: any[];
  setCompanyProfiles: (profiles: any[]) => void;
  monthly: any[];
  trendData: any;
  setIsLoading: (loading: boolean) => void;
}

export default function CompanyManagementTab(props: CompanyManagementTabProps) {
  return (
    <div className="company-management-container" style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      {/* Sub-tab Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => props.setCompanyManagementSubTab('details')}
          style={{
            padding: '10px 20px',
            background: props.companyManagementSubTab === 'details' ? '#667eea' : 'transparent',
            color: props.companyManagementSubTab === 'details' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'details' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Company Details
        </button>
        <button
          onClick={() => props.setCompanyManagementSubTab('profile')}
          style={{
            padding: '10px 20px',
            background: props.companyManagementSubTab === 'profile' ? '#667eea' : 'transparent',
            color: props.companyManagementSubTab === 'profile' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'profile' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Profile
        </button>
      </div>
      
      {/* Company Details Sub-tab */}
      {props.companyManagementSubTab === 'details' && (
        <CompanyDetailsTab
          currentUser={props.currentUser}
          selectedCompanyId={props.selectedCompanyId}
          companies={props.companies}
          users={props.users}
          assessmentRecords={props.assessmentRecords}
          isLoading={props.isLoading}
          newCompanyName={props.newCompanyName}
          selectedAffiliateCodeForNewCompany={props.selectedAffiliateCodeForNewCompany}
          setSelectedAffiliateCodeForNewCompany={props.setSelectedAffiliateCodeForNewCompany}
          setNewCompanyName={props.setNewCompanyName}
          addCompany={props.addCompany}
          setEditingCompanyId={props.setEditingCompanyId}
          setCompanyAddressStreet={props.setCompanyAddressStreet}
          setCompanyAddressCity={props.setCompanyAddressCity}
          setCompanyAddressState={props.setCompanyAddressState}
          setCompanyAddressZip={props.setCompanyAddressZip}
          setCompanyAddressCountry={props.setCompanyAddressCountry}
          setCompanyIndustrySector={props.setCompanyIndustrySector}
          setShowCompanyDetailsModal={props.setShowCompanyDetailsModal}
          deleteUser={props.deleteUser}
          newCompanyUserName={props.newCompanyUserName}
          setNewCompanyUserName={props.setNewCompanyUserName}
          newCompanyUserTitle={props.newCompanyUserTitle}
          setNewCompanyUserTitle={props.setNewCompanyUserTitle}
          newCompanyUserEmail={props.newCompanyUserEmail}
          setNewCompanyUserEmail={props.setNewCompanyUserEmail}
          newCompanyUserPhone={props.newCompanyUserPhone}
          setNewCompanyUserPhone={props.setNewCompanyUserPhone}
          newCompanyUserPassword={props.newCompanyUserPassword}
          setNewCompanyUserPassword={props.setNewCompanyUserPassword}
          addUser={props.addUser}
          newAssessmentUserName={props.newAssessmentUserName}
          setNewAssessmentUserName={props.setNewAssessmentUserName}
          newAssessmentUserTitle={props.newAssessmentUserTitle}
          setNewAssessmentUserTitle={props.setNewAssessmentUserTitle}
          newAssessmentUserEmail={props.newAssessmentUserEmail}
          setNewAssessmentUserEmail={props.setNewAssessmentUserEmail}
          newAssessmentUserPassword={props.newAssessmentUserPassword}
          setNewAssessmentUserPassword={props.setNewAssessmentUserPassword}
          setSelectedCompanyId={props.setSelectedCompanyId}
        />
      )}
      
      {/* Profile Sub-tab */}
      {props.companyManagementSubTab === 'profile' && (
        <div id="profile-print-wrapper">
          {!props.selectedCompanyId ? (
            <div className="no-print" style={{ background: '#f8fafc', borderRadius: '8px', padding: '48px 24px', textAlign: 'center', border: '2px dashed #cbd5e1' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to view and edit company profile.</p>
            </div>
          ) : (
            <ProfileTab
              selectedCompanyId={props.selectedCompanyId}
              currentUser={props.currentUser}
              company={props.company}
              companyProfiles={props.companyProfiles}
              setCompanyProfiles={props.setCompanyProfiles}
              monthly={props.monthly}
              trendData={props.trendData}
              isLoading={props.isLoading}
              setIsLoading={props.setIsLoading}
            />
          )}
        </div>
      )}
    </div>
  );
}

