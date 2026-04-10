'use client';

import React, { useEffect } from 'react';
import ProfileTab from '../dashboard/ProfileTab';
import CompanyDetailsTab from './CompanyDetailsTab';
import DocumentationTab from '../consultant/DocumentationTab';
import PaymentsTab from '../dashboard/PaymentsTab';
import { useFinancialData } from '../../hooks/useFinancialData';

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
  setAccountingSystem: (system: string) => void;
  setCompanySizeCategory: (size: string) => void;
  setIndustrySectorCategory: (sector: string) => void;
  setShowCompanyDetailsModal: (show: boolean) => void;
  deleteUser: (id: string, companyId?: string) => void;
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
  addUser: (companyId: string, userType: "company" | "assessment") => void;
  existingCompanyUserName: string;
  setExistingCompanyUserName: (name: string) => void;
  existingCompanyUserEmail: string;
  setExistingCompanyUserEmail: (email: string) => void;
  newAssessmentUserName: string;
  setNewAssessmentUserName: (name: string) => void;
  newAssessmentUserTitle: string;
  setNewAssessmentUserTitle: (title: string) => void;
  newAssessmentUserEmail: string;
  setNewAssessmentUserEmail: (email: string) => void;
  newAssessmentUserPassword: string;
  setNewAssessmentUserPassword: (password: string) => void;
  existingAssessmentUserName: string;
  setExistingAssessmentUserName: (name: string) => void;
  existingAssessmentUserEmail: string;
  setExistingAssessmentUserEmail: (email: string) => void;
  grantExistingUserAccess: (
    companyId: string,
    userType: "company" | "assessment",
  ) => void;
  setSelectedCompanyId: (id: string) => void;
  // Profile tab props
  company: any;
  companyProfiles: any[];
  setCompanyProfiles: (profiles: any[]) => void;
  trendData: any;
  setIsLoading: (loading: boolean) => void;
  onCompanyUpdated?: (company: any) => void;

  // Payments (moved under Company Management)
  paymentsSelectedCompany: any;
  selectedSubscriptionPlan: string | null;
  setSelectedSubscriptionPlan: (plan: string | null) => void;
  activeSubscription: any;
  setActiveSubscription: (sub: any) => void;
  loadingSubscription: boolean;
  setShowCheckoutModal: (show: boolean) => void;
  setShowUpdatePaymentModal: (show: boolean) => void;
  subscriptionMonthlyPrice: number;
  subscriptionQuarterlyPrice: number;
  subscriptionAnnualPrice: number;
  subscriptionSetupFee: number;
  dataRoomEnabledByAdmin: boolean;
  dataRoomSubscriptionStatus: string;
  onToggleDataRoomEnabledByAdmin: (enabled: boolean) => void;
}

export default function CompanyManagementTab(props: CompanyManagementTabProps) {
  const { monthlyData, loadFinancialData } = useFinancialData();

  // Load financial data when component mounts or selectedCompanyId changes
  useEffect(() => {
    if (props.selectedCompanyId && props.company?.name) {
      console.log('🏢 CompanyManagementTab: Loading financial data for company:', props.selectedCompanyId);
      loadFinancialData(props.selectedCompanyId, props.company.name);
    }
  }, [props.selectedCompanyId, props.company?.name, loadFinancialData]);
  return (
    <div className="company-management-container" style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      {/* Sub-tab Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => props.setCompanyManagementSubTab('profile')}
          style={{
            padding: '10px 20px',
            background: 'none',
            color: props.companyManagementSubTab === 'profile' ? '#2751d0' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'profile' ? '3px solid #2751d0' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Profile
        </button>
        <button
          onClick={() => props.setCompanyManagementSubTab('details')}
          style={{
            padding: '10px 20px',
            background: 'none',
            color: props.companyManagementSubTab === 'details' ? '#2751d0' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'details' ? '3px solid #2751d0' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Manage Users
        </button>
        <button
          onClick={() => props.setCompanyManagementSubTab('payments')}
          style={{
            padding: '10px 20px',
            background: 'none',
            color: props.companyManagementSubTab === 'payments' ? '#2751d0' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'payments' ? '3px solid #2751d0' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Payments
        </button>
        <button
          onClick={() => props.setCompanyManagementSubTab('documentation')}
          style={{
            padding: '10px 20px',
            background: 'none',
            color: props.companyManagementSubTab === 'documentation' ? '#2751d0' : '#64748b',
            border: 'none',
            borderBottom: props.companyManagementSubTab === 'documentation' ? '3px solid #2751d0' : '3px solid transparent',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Documentation
        </button>
      </div>
      
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
              monthly={monthlyData}
              trendData={props.trendData}
              isLoading={props.isLoading}
              setIsLoading={props.setIsLoading}
              onCompanyUpdated={props.onCompanyUpdated}
              setEditingCompanyId={props.setEditingCompanyId}
              setCompanyAddressStreet={props.setCompanyAddressStreet}
              setCompanyAddressCity={props.setCompanyAddressCity}
              setCompanyAddressState={props.setCompanyAddressState}
              setCompanyAddressZip={props.setCompanyAddressZip}
              setCompanyAddressCountry={props.setCompanyAddressCountry}
              setCompanyIndustrySector={props.setCompanyIndustrySector}
              setAccountingSystem={props.setAccountingSystem}
              setCompanySizeCategory={props.setCompanySizeCategory}
              setIndustrySectorCategory={props.setIndustrySectorCategory}
              setShowCompanyDetailsModal={props.setShowCompanyDetailsModal}
            />
          )}
        </div>
      )}
      
      {/* Documentation Sub-tab */}
      {props.companyManagementSubTab === 'documentation' && (
        <DocumentationTab />
      )}

      {/* Payments Sub-tab */}
      {props.companyManagementSubTab === 'payments' && (
        <>
          {!props.selectedCompanyId ? (
            <div className="no-print" style={{ background: '#f8fafc', borderRadius: '8px', padding: '48px 24px', textAlign: 'center', border: '2px dashed #cbd5e1' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '12px' }}>No Company Selected</div>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Please select a company from the sidebar to manage subscription and payments.</p>
            </div>
          ) : (
            <PaymentsTab
              selectedCompany={props.paymentsSelectedCompany}
              selectedSubscriptionPlan={props.selectedSubscriptionPlan}
              setSelectedSubscriptionPlan={props.setSelectedSubscriptionPlan}
              activeSubscription={props.activeSubscription}
              setActiveSubscription={props.setActiveSubscription}
              loadingSubscription={props.loadingSubscription}
              setShowCheckoutModal={props.setShowCheckoutModal}
              setShowUpdatePaymentModal={props.setShowUpdatePaymentModal}
              selectedCompanyId={props.selectedCompanyId as any}
              subscriptionMonthlyPrice={props.subscriptionMonthlyPrice}
              subscriptionQuarterlyPrice={props.subscriptionQuarterlyPrice}
              subscriptionAnnualPrice={props.subscriptionAnnualPrice}
              subscriptionSetupFee={props.subscriptionSetupFee}
              dataRoomEnabledByAdmin={props.dataRoomEnabledByAdmin}
              dataRoomSubscriptionStatus={props.dataRoomSubscriptionStatus}
              onToggleDataRoomEnabledByAdmin={props.onToggleDataRoomEnabledByAdmin}
            />
          )}
        </>
      )}

      {/* Manage Users Sub-tab */}
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
          existingCompanyUserName={props.existingCompanyUserName}
          setExistingCompanyUserName={props.setExistingCompanyUserName}
          existingCompanyUserEmail={props.existingCompanyUserEmail}
          setExistingCompanyUserEmail={props.setExistingCompanyUserEmail}
          newAssessmentUserName={props.newAssessmentUserName}
          setNewAssessmentUserName={props.setNewAssessmentUserName}
          newAssessmentUserTitle={props.newAssessmentUserTitle}
          setNewAssessmentUserTitle={props.setNewAssessmentUserTitle}
          newAssessmentUserEmail={props.newAssessmentUserEmail}
          setNewAssessmentUserEmail={props.setNewAssessmentUserEmail}
          newAssessmentUserPassword={props.newAssessmentUserPassword}
          setNewAssessmentUserPassword={props.setNewAssessmentUserPassword}
          existingAssessmentUserName={props.existingAssessmentUserName}
          setExistingAssessmentUserName={props.setExistingAssessmentUserName}
          existingAssessmentUserEmail={props.existingAssessmentUserEmail}
          setExistingAssessmentUserEmail={props.setExistingAssessmentUserEmail}
          grantExistingUserAccess={props.grantExistingUserAccess}
          setSelectedCompanyId={props.setSelectedCompanyId}
        />
      )}

    </div>
  );
}

