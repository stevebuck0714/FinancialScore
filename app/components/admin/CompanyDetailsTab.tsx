'use client';

import React from 'react';
import { INDUSTRY_SECTORS } from '@/data/industrySectors';

interface User {
  id: string;
  name: string | null;
  email: string;
  phone?: string | null;
  title?: string | null;
  companyId?: string;
  userType?: string;
}

interface Company {
  id: string;
  name: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  industrySector?: string | null;
  consultantId?: string;
}

interface AssessmentRecord {
  user?: {
    email: string;
  };
  companyId: string;
}

interface CompanyDetailsTabProps {
  currentUser: {
    consultantType?: string;
    consultantId?: string;
  };
  selectedCompanyId: string;
  companies: Company[];
  users: User[];
  assessmentRecords: AssessmentRecord[];
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
}

export default function CompanyDetailsTab({
  currentUser,
  selectedCompanyId,
  companies,
  users,
  assessmentRecords,
  isLoading,
  newCompanyName,
  selectedAffiliateCodeForNewCompany,
  setSelectedAffiliateCodeForNewCompany,
  setNewCompanyName,
  addCompany,
  setEditingCompanyId,
  setCompanyAddressStreet,
  setCompanyAddressCity,
  setCompanyAddressState,
  setCompanyAddressZip,
  setCompanyAddressCountry,
  setCompanyIndustrySector,
  setShowCompanyDetailsModal,
  deleteUser,
  newCompanyUserName,
  setNewCompanyUserName,
  newCompanyUserTitle,
  setNewCompanyUserTitle,
  newCompanyUserEmail,
  setNewCompanyUserEmail,
  newCompanyUserPhone,
  setNewCompanyUserPhone,
  newCompanyUserPassword,
  setNewCompanyUserPassword,
  addUser,
  newAssessmentUserName,
  setNewAssessmentUserName,
  newAssessmentUserTitle,
  setNewAssessmentUserTitle,
  newAssessmentUserEmail,
  setNewAssessmentUserEmail,
  newAssessmentUserPassword,
  setNewAssessmentUserPassword,
  setSelectedCompanyId
}: CompanyDetailsTabProps) {
  
  // For business users, auto-select their company if not already selected
  React.useEffect(() => {
    if (currentUser.consultantType === 'business' && !selectedCompanyId && Array.isArray(companies) && companies.length > 0) {
      const businessCompany = companies.find(c => c.consultantId === currentUser.consultantId);
      if (businessCompany) {
        setTimeout(() => setSelectedCompanyId(businessCompany.id), 0);
      }
    }
  }, [currentUser.consultantType, currentUser.consultantId, selectedCompanyId, companies, setSelectedCompanyId]);

  if (!selectedCompanyId) {
    return (
      <>
        {/* Only show Add Company for regular consultants */}
        {currentUser.consultantType !== 'business' && (
          <>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              Select a company from the sidebar or create a new one:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
              <input 
                type="text" 
                placeholder="Company Name" 
                value={newCompanyName} 
                onChange={(e) => setNewCompanyName(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && addCompany()}
                disabled={isLoading}
                style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
              />
              
              {/* Affiliate Code Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                  Affiliate Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter affiliate code (optional)"
                  value={selectedAffiliateCodeForNewCompany || ''}
                  onChange={(e) => setSelectedAffiliateCodeForNewCompany && setSelectedAffiliateCodeForNewCompany(e.target.value.toUpperCase())}
                  disabled={isLoading}
                  style={{ 
                    padding: '12px 16px', 
                    borderRadius: '8px', 
                    border: '1px solid #cbd5e1', 
                    fontSize: '14px',
                    textTransform: 'uppercase'
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                  If provided, the code will be validated and applied to determine pricing
                </p>
              </div>
              
              <button 
                onClick={addCompany} 
                disabled={isLoading}
                style={{ 
                  padding: '12px 24px', 
                  background: isLoading ? '#94a3b8' : '#667eea', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  alignSelf: 'flex-start'
                }}
              >
                {isLoading ? 'Adding...' : 'Add Company'}
              </button>
            </div>
          </>
        )}
        {/* For business users with no company selected, show loading message */}
        {currentUser.consultantType === 'business' && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <p>Loading your company information...</p>
          </div>
        )}
      </>
    );
  }

  // Show the selected company
  return (
    <>
      {Array.isArray(companies) && companies.filter(c => c.id === selectedCompanyId).map(comp => (
        <div key={comp.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', border: '2px solid #667eea' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{comp.name}</h3>
            <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>✓ Active Company</div>
          </div>
          
          {/* Company Information */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '6px', padding: '12px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600', display: 'block', marginBottom: '4px' }}>Address:</span>
                  {comp.addressStreet || comp.addressCity ? (
                    <>
                      {comp.addressStreet && <div style={{ color: '#1e293b', marginBottom: '2px' }}>{comp.addressStreet}</div>}
                      <div style={{ color: '#1e293b' }}>
                        {comp.addressCity && comp.addressCity}
                        {comp.addressState && `, ${comp.addressState}`}
                        {comp.addressZip && ` ${comp.addressZip}`}
                      </div>
                      {comp.addressCountry && <div style={{ color: '#1e293b' }}>{comp.addressCountry}</div>}
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not set</span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  <span style={{ fontWeight: '600' }}>Industry:</span> <span style={{ color: '#1e293b' }}>
                    {comp.industrySector 
                      ? `${comp.industrySector} - ${INDUSTRY_SECTORS.find(s => s.id === comp.industrySector)?.name || 'Unknown'}` 
                      : 'Not set'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setEditingCompanyId(comp.id);
                  setCompanyAddressStreet(comp.addressStreet || '');
                  setCompanyAddressCity(comp.addressCity || '');
                  setCompanyAddressState(comp.addressState || '');
                  setCompanyAddressZip(comp.addressZip || '');
                  setCompanyAddressCountry(comp.addressCountry || 'USA');
                  setCompanyIndustrySector(comp.industrySector || '');
                  setShowCompanyDetailsModal(true);
                }}
                style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}
              >
                Edit Details
              </button>
            </div>
          </div>
          
          {/* Users Section - Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '2px solid #cbd5e1', paddingTop: '16px' }}>
            
            {/* Company Users (Management Team) */}
            <div style={{ background: 'white', borderRadius: '8px', padding: '16px', border: '2px solid #10b981' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Company Users</h4>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>Management team - can view all company pages</p>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981', marginBottom: '12px' }}>
                {users.filter(u => u.companyId === comp.id && u.userType === 'company').length}
              </div>
              
              {users.filter(u => u.companyId === comp.id && u.userType === 'company').map(u => (
                <div key={u.id} style={{ background: '#f0fdf4', borderRadius: '8px', padding: '12px', marginBottom: '8px', border: '1px solid #86efac' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{u.name}</span>
                        {u.title && <span style={{ fontSize: '12px', fontWeight: '500', color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '4px' }}>{u.title}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div><span style={{ fontWeight: '600' }}>Email:</span> {u.email}</div>
                        {u.phone && <div><span style={{ fontWeight: '600' }}>Phone:</span> {u.phone}</div>}
                      </div>
                    </div>
                    <button onClick={() => deleteUser(u.id)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: '600' }}>Delete</button>
                  </div>
                </div>
              ))}
              
              <div style={{ borderTop: '1px solid #d1fae5', paddingTop: '12px', marginTop: '12px' }}>
                <h5 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Add Company User</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input 
                      type="text" 
                      name={`company_user_name_${Date.now()}`}
                      placeholder="Name" 
                      value={newCompanyUserName} 
                      onChange={(e) => setNewCompanyUserName(e.target.value)} 
                      autoComplete="off"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                    />
                    <input 
                      type="text" 
                      name={`company_user_title_${Date.now()}`}
                      placeholder="Title" 
                      value={newCompanyUserTitle} 
                      onChange={(e) => setNewCompanyUserTitle(e.target.value)} 
                      autoComplete="off"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input 
                      type="text" 
                      name={`company_user_email_${Date.now()}`}
                      placeholder="Email" 
                      value={newCompanyUserEmail} 
                      onChange={(e) => setNewCompanyUserEmail(e.target.value)} 
                      autoComplete="off"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                    />
                    <input 
                      type="text" 
                      name={`company_user_phone_${Date.now()}`}
                      placeholder="Phone Number" 
                      value={newCompanyUserPhone} 
                      onChange={(e) => setNewCompanyUserPhone(e.target.value)} 
                      autoComplete="off"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <input 
                      type="password" 
                      name={`company_user_password_${Date.now()}`}
                      placeholder="Password" 
                      value={newCompanyUserPassword} 
                      onChange={(e) => setNewCompanyUserPassword(e.target.value)} 
                      autoComplete="new-password"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%' }} 
                    />
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: '1.3' }}>
                      8+ chars with uppercase, lowercase, number, and special character
                    </div>
                  </div>
                  <button onClick={() => addUser(comp.id, 'company')} style={{ padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Add Company User</button>
                </div>
              </div>
            </div>
            
            {/* Management Assessment Users */}
            <div style={{ background: 'white', borderRadius: '8px', padding: '16px', border: '2px solid #8b5cf6' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Management Assessment Users</h4>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>Enter employee information (max 5) at a time.</p>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#8b5cf6', marginBottom: '12px' }}>
                {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').length} / 5
              </div>
              
              {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').map(u => {
                const hasCompleted = assessmentRecords.some(r => r.user?.email === u.email && r.companyId === comp.id);
                console.log(`🔍 Checking user: ${u.email}, Company: ${comp.id}, Assessment Records for this user:`, 
                  assessmentRecords.filter(r => r.user?.email === u.email).map(r => ({ userEmail: r.user?.email, companyId: r.companyId })),
                  'hasCompleted:', hasCompleted
                );
                return (
                  <div key={u.id} style={{ background: '#faf5ff', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #ddd6fe' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                        {u.name}
                        {u.title && <span style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginLeft: '6px' }}>({u.title})</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ 
                        fontSize: '10px', 
                        fontWeight: '600', 
                        color: hasCompleted ? '#065f46' : '#991b1b',
                        background: hasCompleted ? '#d1fae5' : '#fee2e2',
                        padding: '3px 8px', 
                        borderRadius: '4px' 
                      }}>
                        {hasCompleted ? '✓ Done' : '⚠ Not Started'}
                      </div>
                      <button onClick={() => deleteUser(u.id)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                );
              })}
              
              {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').length < 5 ? (
                <div style={{ borderTop: '1px solid #ede9fe', paddingTop: '12px', marginTop: '12px' }}>
                  <h5 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Add Assessment User</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <input 
                        type="text" 
                        name={`assessment_user_name_${Date.now()}`}
                        placeholder="Name" 
                        value={newAssessmentUserName} 
                        onChange={(e) => setNewAssessmentUserName(e.target.value)} 
                        autoComplete="off"
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                      />
                      <input 
                        type="text" 
                        name={`assessment_user_title_${Date.now()}`}
                        placeholder="Title" 
                        value={newAssessmentUserTitle} 
                        onChange={(e) => setNewAssessmentUserTitle(e.target.value)} 
                        autoComplete="off"
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                      />
                    </div>
                    <input 
                      type="text" 
                      name={`assessment_user_email_${Date.now()}`}
                      placeholder="Email" 
                      value={newAssessmentUserEmail} 
                      onChange={(e) => setNewAssessmentUserEmail(e.target.value)} 
                      autoComplete="off"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} 
                    />
                    <div style={{ gridColumn: 'span 2' }}>
                      <input 
                        type="password" 
                        name={`assessment_user_password_${Date.now()}`}
                        placeholder="Password" 
                        value={newAssessmentUserPassword} 
                        onChange={(e) => setNewAssessmentUserPassword(e.target.value)} 
                        autoComplete="new-password"
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%' }} 
                      />
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: '1.3' }}>
                        8+ chars with uppercase, lowercase, number, and special character
                      </div>
                    </div>
                    <button onClick={() => addUser(comp.id, 'assessment')} style={{ padding: '8px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Add Assessment User</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '11px', color: '#92400e', marginTop: '8px' }}>
                  ⚠ Maximum 5 assessment users reached
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

