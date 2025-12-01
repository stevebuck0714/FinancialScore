'use client';

import React from 'react';
import { US_STATES } from '@/app/constants';

export default function SiteAdminDashboard(props: any) {
  const {
    siteAdminTab, setSiteAdminTab, consultants, companies, siteAdmins,
    selectedConsultantId, setSelectedConsultantId, expandedCompanyIds, setExpandedCompanyIds,
    isLoading, expandedBusinessIds, setExpandedBusinessIds,
    editingPricing, setEditingPricing,
    defaultBusinessMonthlyPrice, setDefaultBusinessMonthlyPrice,
    defaultBusinessQuarterlyPrice, setDefaultBusinessQuarterlyPrice,
    defaultBusinessAnnualPrice, setDefaultBusinessAnnualPrice,
    defaultConsultantMonthlyPrice, setDefaultConsultantMonthlyPrice,
    defaultConsultantQuarterlyPrice, setDefaultConsultantQuarterlyPrice,
    defaultConsultantAnnualPrice, setDefaultConsultantAnnualPrice,
    affiliates, setAffiliates,
    showAddAffiliateForm, setShowAddAffiliateForm,
    editingAffiliate, setEditingAffiliate,
    expandedAffiliateId, setExpandedAffiliateId,
    editingConsultantInfo, setEditingConsultantInfo,
    users, getCompanyUsers,
    showAddConsultantForm, setShowAddConsultantForm,
    newConsultantType, setNewConsultantType,
    newConsultantFullName, setNewConsultantFullName,
    newConsultantEmail, setNewConsultantEmail,
    newConsultantPhone, setNewConsultantPhone,
    newConsultantPassword, setNewConsultantPassword,
    newConsultantAddress, setNewConsultantAddress,
    newConsultantCompanyName, setNewConsultantCompanyName,
    newConsultantCompanyAddress1, setNewConsultantCompanyAddress1,
    newConsultantCompanyAddress2, setNewConsultantCompanyAddress2,
    newConsultantCompanyCity, setNewConsultantCompanyCity,
    newConsultantCompanyState, setNewConsultantCompanyState,
    newConsultantCompanyZip, setNewConsultantCompanyZip,
    newConsultantCompanyWebsite, setNewConsultantCompanyWebsite,
    addConsultant, deleteConsultant, getConsultantCompanies,
    setCurrentUser, setSiteAdminViewingAs, setCurrentView, currentUser,
    newSiteAdminFirstName, setNewSiteAdminFirstName,
    newSiteAdminLastName, setNewSiteAdminLastName,
    newSiteAdminEmail, setNewSiteAdminEmail,
    newSiteAdminPassword, setNewSiteAdminPassword,
    showAddSiteAdminForm, setShowAddSiteAdminForm
  } = props;

  return (
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Site Administration</h1>
              
              {/* Tab Navigation */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0' }}>
                <button
                  onClick={() => setSiteAdminTab('consultants')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'consultants' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'consultants' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'consultants' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Consultants
                </button>
                <button
                  onClick={() => setSiteAdminTab('businesses')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'businesses' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'businesses' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'businesses' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Businesses
                </button>
                <button
                  onClick={() => setSiteAdminTab('affiliates')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'affiliates' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'affiliates' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'affiliates' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Affiliates
                </button>
                <button
                  onClick={() => setSiteAdminTab('default-pricing')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'default-pricing' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'default-pricing' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'default-pricing' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Default Pricing
                </button>
                <button
                  onClick={() => setSiteAdminTab('siteadmins')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'siteadmins' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'siteadmins' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'siteadmins' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Site Administrators
                </button>
              </div>

              {/* Consultants Tab */}
              {siteAdminTab === 'consultants' && (
              <>
              {/* Add Consultant Form */}
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddConsultantForm ? '12px' : '0' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Add New Consultant</h2>
                  <button
                    onClick={() => setShowAddConsultantForm(!showAddConsultantForm)}
                    style={{ 
                      padding: '4px 12px', 
                      background: showAddConsultantForm ? '#f1f5f9' : '#667eea', 
                      color: showAddConsultantForm ? '#475569' : 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      cursor: 'pointer' 
                    }}
                  >
                    {showAddConsultantForm ? '▲' : '▼'}
                  </button>
                </div>
                {showAddConsultantForm && (
                  <>
                    {/* Personal Information Section */}
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Contact Person Information</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Type *"
                          value={newConsultantType}
                          onChange={(e) => setNewConsultantType(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Contact Person *"
                          value={newConsultantFullName}
                          onChange={(e) => setNewConsultantFullName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="email"
                          placeholder="Email *"
                          value={newConsultantEmail}
                          onChange={(e) => setNewConsultantEmail(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="tel"
                          placeholder="Phone *"
                          value={newConsultantPhone}
                          onChange={(e) => setNewConsultantPhone(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <div style={{ gridColumn: 'span 2' }}>
                          <input
                            type="password"
                            placeholder="Password *"
                            value={newConsultantPassword}
                            onChange={(e) => setNewConsultantPassword(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%' }}
                          />
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                            Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Company Information Section */}
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company Information (Optional)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Company Name"
                          value={newConsultantCompanyName}
                          onChange={(e) => setNewConsultantCompanyName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Company Address Line 1"
                          value={newConsultantCompanyAddress1}
                          onChange={(e) => setNewConsultantCompanyAddress1(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Company Address Line 2"
                          value={newConsultantCompanyAddress2}
                          onChange={(e) => setNewConsultantCompanyAddress2(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="City"
                            value={newConsultantCompanyCity}
                            onChange={(e) => setNewConsultantCompanyCity(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                          />
                          <select
                            value={newConsultantCompanyState}
                            onChange={(e) => setNewConsultantCompanyState(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: 'white' }}
                          >
                            {US_STATES.map(state => (
                              <option key={state.code} value={state.code}>{state.code || 'State'}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="ZIP"
                            value={newConsultantCompanyZip}
                            onChange={(e) => setNewConsultantCompanyZip(e.target.value)}
                            maxLength={10}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                          />
                        </div>
                        <input
                          type="url"
                          placeholder="Company Website"
                          value={newConsultantCompanyWebsite}
                          onChange={(e) => setNewConsultantCompanyWebsite(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={addConsultant}
                      disabled={isLoading}
                      style={{ 
                        padding: '8px 20px', 
                        background: isLoading ? '#94a3b8' : '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? 'Adding...' : 'Add Consultant'}
                    </button>
                  </>
                )}
              </div>

              {/* Consultants List */}
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '10px' }}>
                Total Consultants: {consultants.filter(c => c.type !== 'business').length}
              </div>

              {consultants.filter(c => c.type !== 'business').length === 0 ? (
                <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>ðŸ‘¥</div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>No Consultants</h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8' }}>Add your first consultant to get started</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {consultants.filter(c => c.type !== 'business').map((consultant) => {
                    const consultantCompanies = getConsultantCompanies(consultant.id);
                    const expanded = selectedConsultantId === consultant.id;

                    return (
                      <div key={consultant.id} style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                        {/* Consultant Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div>
                              <h3 
                                onClick={() => {
                                  // Save current admin user
                                  setSiteAdminViewingAs(currentUser);
                                  // Switch to viewing this consultant's dashboard
                                  setCurrentUser({
                                    ...consultant.user,
                                    role: 'consultant',
                                    consultantId: consultant.id,
                                    consultantType: consultant.type
                                  });
                                  setCurrentView('admin');
                                }}
                                style={{ 
                                  fontSize: '15px', 
                                  fontWeight: '600', 
                                  color: '#667eea', 
                                  marginBottom: '2px',
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#5568d3'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#667eea'}
                              >
                                {consultant.companyName || consultant.fullName}
                              </h3>
                              {consultant.companyName && (
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                                  Contact: {consultant.fullName}
                                </p>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setSelectedConsultantId(expanded ? '' : consultant.id)}
                              style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              {expanded ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                              onClick={() => {
                                const displayName = consultant.companyName || consultant.fullName;
                                if (window.confirm(`Are you sure you want to delete ${displayName}? This action cannot be undone.`)) {
                                  deleteConsultant(consultant.id);
                                }
                              }}
                              style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expanded && (
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '10px' }}>
                            {/* Consultant Information */}
                            <div style={{ marginBottom: '10px', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#475569', margin: 0 }}>Consultant Information</h4>
                                {!editingConsultantInfo[consultant.id] && (
                                  <button
                                    onClick={() => {
                                      setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: {
                                          fullName: consultant.fullName,
                                          email: consultant.email,
                                          address: consultant.address || '',
                                          phone: consultant.phone || '',
                                          type: consultant.type || '',
                                          companyName: consultant.companyName || '',
                                          companyAddress1: consultant.companyAddress1 || '',
                                          companyAddress2: consultant.companyAddress2 || '',
                                          companyCity: consultant.companyCity || '',
                                          companyState: consultant.companyState || '',
                                          companyZip: consultant.companyZip || '',
                                          companyWebsite: consultant.companyWebsite || ''
                                        }
                                      });
                                    }}
                                    style={{ padding: '3px 8px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              
                              {editingConsultantInfo[consultant.id] ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Contact Person</label>
                                      <input
                                        type="text"
                                        value={editingConsultantInfo[consultant.id].fullName}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], fullName: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Phone</label>
                                      <input
                                        type="text"
                                        value={editingConsultantInfo[consultant.id].phone}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], phone: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Email</label>
                                    <input
                                      type="email"
                                      value={editingConsultantInfo[consultant.id].email}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], email: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Company Name</label>
                                    <input
                                      type="text"
                                      value={editingConsultantInfo[consultant.id].companyName || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyName: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Company Address</label>
                                    <input
                                      type="text"
                                      placeholder="Address Line 1"
                                      value={editingConsultantInfo[consultant.id].companyAddress1 || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyAddress1: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', marginBottom: '4px' }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Address Line 2 (Optional)"
                                      value={editingConsultantInfo[consultant.id].companyAddress2 || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyAddress2: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', marginBottom: '4px' }}
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '4px' }}>
                                      <input
                                        type="text"
                                        placeholder="City"
                                        value={editingConsultantInfo[consultant.id].companyCity || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyCity: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                      <select
                                        value={editingConsultantInfo[consultant.id].companyState || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyState: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', backgroundColor: 'white' }}
                                      >
                                        {US_STATES.map(state => (
                                          <option key={state.code} value={state.code}>{state.code || 'State'}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        placeholder="ZIP"
                                        value={editingConsultantInfo[consultant.id].companyZip || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyZip: e.target.value }
                                        })}
                                        maxLength={10}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                  </div>
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Company Website</label>
                                    <input
                                      type="url"
                                      value={editingConsultantInfo[consultant.id].companyWebsite || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyWebsite: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                    <button
                                      onClick={() => {
                                        updateConsultantInfo(consultant.id, editingConsultantInfo[consultant.id]);
                                      }}
                                      style={{ padding: '4px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingConsultantInfo((prev) => {
                                          const newState = { ...prev };
                                          delete newState[consultant.id];
                                          return newState;
                                        });
                                      }}
                                      style={{ padding: '4px 12px', background: '#64748b', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                  <div><span style={{ fontWeight: '600' }}>Email:</span> {consultant.email}</div>
                                  <div><span style={{ fontWeight: '600' }}>Phone:</span> {consultant.phone || 'N/A'}</div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ fontWeight: '600' }}>Company Name:</span> {consultant.companyName || 'N/A'}</div>
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ fontWeight: '600' }}>Company Address:</span> {
                                      consultant.companyAddress1 ? (
                                        <>
                                          {consultant.companyAddress1}
                                          {consultant.companyAddress2 && `, ${consultant.companyAddress2}`}
                                          {consultant.companyCity && `, ${consultant.companyCity}`}
                                          {consultant.companyState && `, ${consultant.companyState}`}
                                          {consultant.companyZip && ` ${consultant.companyZip}`}
                                        </>
                                      ) : 'N/A'
                                    }
                                  </div>
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ fontWeight: '600' }}>Company Website:</span> {consultant.companyWebsite ? (
                                      <a 
                                        href={consultant.companyWebsite.startsWith('http://') || consultant.companyWebsite.startsWith('https://') 
                                          ? consultant.companyWebsite 
                                          : `https://${consultant.companyWebsite}`
                                        } 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ color: '#667eea', textDecoration: 'underline', marginLeft: '4px' }}
                                      >
                                        {consultant.companyWebsite}
                                      </a>
                                    ) : 'N/A'}
                                  </div>
                                </div>
                              )}
                            </div>

                            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                              Companies ({consultantCompanies.length})
                            </h4>
                            
                            {consultantCompanies.length === 0 ? (
                              <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '16px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No companies yet</p>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: '8px' }}>
                                {consultantCompanies.map((company) => {
                                  const companyUsers = getCompanyUsers(company.id);
                                  const isCompanyExpanded = expandedCompanyIds.includes(company.id);
                                  const editing = editingPricing[company.id];
                                  
                                  return (
                                    <div key={company.id} style={{ background: '#f8fafc', borderRadius: '6px', padding: '10px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCompanyExpanded ? '8px' : '0' }}>
                                        <div style={{ flex: 1 }}>
                                          <h5 style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '2px' }}>{company.name}</h5>
                                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            <span style={{ fontWeight: '600' }}>Industry:</span> {
                                              company.industrySector 
                                                ? `${company.industrySector} - ${INDUSTRY_SECTORS.find(s => s.id === company.industrySector)?.name || 'Unknown'}` 
                                                : 'Not set'
                                            }
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#667eea' }}>
                                            {companyUsers.length} user{companyUsers.length !== 1 ? 's' : ''}
                                          </div>
                                          <button
                                            onClick={() => {
                                              setExpandedCompanyIds(prev => 
                                                prev.includes(company.id) 
                                                  ? prev.filter(id => id !== company.id)
                                                  : [...prev, company.id]
                                              );
                                            }}
                                            style={{ 
                                              padding: '4px 10px', 
                                              background: isCompanyExpanded ? '#f1f5f9' : '#667eea', 
                                              color: isCompanyExpanded ? '#475569' : 'white', 
                                              border: 'none', 
                                              borderRadius: '4px', 
                                              fontSize: '11px', 
                                              fontWeight: '600', 
                                              cursor: 'pointer' 
                                            }}
                                          >
                                            {isCompanyExpanded ? 'â–²' : 'â–¼'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Expanded Details */}
                                      {isCompanyExpanded && (
                                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', marginTop: '8px' }}>
                                          {/* Company Address */}
                                          {(company.addressStreet || company.addressCity) && (
                                            <div style={{ marginBottom: '8px', padding: '8px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                              <h6 style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Address</h6>
                                              <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>
                                                {company.addressStreet && <div>{company.addressStreet}</div>}
                                                <div>
                                                  {company.addressCity && company.addressCity}
                                                  {company.addressState && `, ${company.addressState}`}
                                                  {company.addressZip && ` ${company.addressZip}`}
                                                </div>
                                                {company.addressCountry && <div>{company.addressCountry}</div>}
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Subscription Pricing */}
                                          <div style={{ marginBottom: companyUsers.length > 0 ? '8px' : '0', padding: '8px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <h6 style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Subscription Pricing</h6>
                                            {editing ? (
                                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                                <div>
                                                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                                  <input
                                                    type="number"
                                                    value={editing.monthly}
                                                    onChange={(e) => setEditingPricing({
                                                      ...editingPricing,
                                                      [company.id]: { ...editing, monthly: parseFloat(e.target.value) || 0 }
                                                    })}
                                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                  />
                                                </div>
                                                <div>
                                                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                                  <input
                                                    type="number"
                                                    value={editing.quarterly}
                                                    onChange={(e) => setEditingPricing({
                                                      ...editingPricing,
                                                      [company.id]: { ...editing, quarterly: parseFloat(e.target.value) || 0 }
                                                    })}
                                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                  />
                                                </div>
                                                <div>
                                                  <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                                  <input
                                                    type="number"
                                                    value={editing.annual}
                                                    onChange={(e) => setEditingPricing({
                                                      ...editingPricing,
                                                      [company.id]: { ...editing, annual: parseFloat(e.target.value) || 0 }
                                                    })}
                                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                  />
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', gridColumn: 'span 3' }}>
                                                  <button
                                                    onClick={() => {
                                                      updateCompanyPricing(company.id, editing);
                                                    }}
                                                    style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Save
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setEditingPricing((prev) => {
                                                        const newState = { ...prev };
                                                        delete newState[company.id];
                                                        return newState;
                                                      });
                                                    }}
                                                    style={{ padding: '4px 10px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div>
                                                <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.5', marginBottom: '6px' }}>
                                                  <div><strong>Monthly:</strong> ${company.subscriptionMonthlyPrice?.toFixed(2) ?? '0.00'}</div>
                                                  <div><strong>Quarterly:</strong> ${company.subscriptionQuarterlyPrice?.toFixed(2) ?? '0.00'}</div>
                                                  <div><strong>Annual:</strong> ${company.subscriptionAnnualPrice?.toFixed(2) ?? '0.00'}</div>
                                                </div>
                                                <button
                                                  onClick={() => {
                                                    setEditingPricing({
                                                      ...editingPricing,
                                                      [company.id]: {
                                                        monthly: company.subscriptionMonthlyPrice ?? 0,
                                                        quarterly: company.subscriptionQuarterlyPrice ?? 0,
                                                        annual: company.subscriptionAnnualPrice ?? 0
                                                      }
                                                    });
                                                  }}
                                                  style={{ padding: '4px 10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                                >
                                                  Edit Pricing
                                                </button>
                                              </div>
                                            )}
                                          </div>

                                          {/* Users */}
                                          {companyUsers.length > 0 && (
                                            <div>
                                              <h6 style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Users:</h6>
                                              <div style={{ display: 'grid', gap: '4px' }}>
                                                {companyUsers.map((user) => (
                                                  <div key={user.id} style={{ background: 'white', borderRadius: '4px', padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#1e293b' }}>{user.name}</div>
                                                      <div style={{ fontSize: '10px', color: '#64748b' }}>{user.email}</div>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </>
              )}

              {/* Businesses Tab */}
              {siteAdminTab === 'businesses' && (
                <div>
                  {/* Businesses List */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
                      Total Businesses: {consultants.filter(c => c.type === 'business' && companies.some(comp => comp.consultantId === c.id)).length}
                    </div>
                    <button
                      onClick={async () => {
                        // Identify orphaned business records (businesses without matching companies)
                        const orphanedBusinesses = consultants.filter(consultant => {
                          if (consultant.type !== 'business') return false; // Only check business-type consultants
                          return !companies.some(comp => comp.consultantId === consultant.id); // Orphaned if no company
                        });

                        if (orphanedBusinesses.length === 0) {
                          alert('✅ No orphaned business records found!');
                          return;
                        }

                        // Confirm deletion
                        if (!confirm(`Found ${orphanedBusinesses.length} orphaned business record(s).\n\nThese are business registrations without company data.\n\nDelete them permanently from the database?`)) {
                          return;
                        }

                        setIsLoading(true);
                        let deletedCount = 0;
                        const errors: string[] = [];

                        try {
                          // Delete each orphaned business from the database
                          for (const orphaned of orphanedBusinesses) {
                            try {
                              await consultantsApi.delete(orphaned.id);
                              deletedCount++;
                            } catch (error) {
                              errors.push(`${orphaned.fullName}: ${error instanceof ApiError ? error.message : 'Failed to delete'}`);
                            }
                          }

                          // Update local state to remove deleted consultants
                          setConsultants(consultants.filter(c => !orphanedBusinesses.find(o => o.id === c.id)));

                          // Show results
                          if (errors.length === 0) {
                            alert(`✅ Successfully deleted ${deletedCount} orphaned business record(s) from the database.`);
                          } else {
                            alert(`⚠️ Deleted ${deletedCount} of ${orphanedBusinesses.length} records.\n\nErrors:\n${errors.join('\n')}`);
                          }
                        } catch (error) {
                          alert(`âŒ Error during cleanup: ${error instanceof ApiError ? error.message : 'Unknown error'}`);
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '6px 12px',
                        background: isLoading ? '#94a3b8' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? '⏳ Cleaning...' : '🔄 Clean Up Orphaned Records'}
                    </button>
                  </div>

                  {consultants.filter(c => c.type === 'business' && companies.some(comp => comp.consultantId === c.id)).length === 0 ? (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>ðŸ¢</div>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>No businesses registered yet</h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Businesses will appear here once they register</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {consultants.filter(c => c.type === 'business' && companies.some(comp => comp.consultantId === c.id)).map((business) => {
                        const businessCompany = Array.isArray(companies) ? companies.find(comp => comp.consultantId === business.id) : undefined;
                        const isExpanded = expandedBusinessIds.has(business.id);
                        const editing = editingPricing?.[business.id];
                        
                        return (
                          <div key={business.id} style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                            {/* Business Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <h3 
                                    onClick={() => {
                                      // Save current admin user
                                      setSiteAdminViewingAs(currentUser);
                                      // Switch to viewing this business's dashboard
                                      setCurrentUser({
                                        ...business.user,
                                        role: 'consultant',
                                        consultantId: business.id,
                                        consultantType: business.type
                                      });
                                      setCurrentView('admin');
                                    }}
                                    style={{ 
                                      fontSize: '15px', 
                                      fontWeight: '600', 
                                      color: '#667eea', 
                                      margin: 0,
                                      cursor: 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#5568d3'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#667eea'}
                                  >
                                    {business.fullName}
                                  </h3>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    setExpandedBusinessIds(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(business.id)) {
                                        newSet.delete(business.id);
                                      } else {
                                        newSet.add(business.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Delete button clicked', { businessCompany, business });
                                    if (businessCompany) {
                                      console.log('Setting company to delete:', businessCompany.name);
                                      setCompanyToDelete({
                                        companyId: businessCompany.id,
                                        businessId: business.id,
                                        companyName: businessCompany.name
                                      });
                                      setShowDeleteConfirmation(true);
                                    } else {
                                      console.log('No company found - showing alert');
                                      alert('No company found for this business');
                                    }
                                  }}
                                  style={{ 
                                    padding: '6px 12px', 
                                    background: '#ef4444', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    fontSize: '12px', 
                                    fontWeight: '600', 
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '10px', paddingTop: '10px' }}>

                                {/* Business Information */}
                                <div style={{ marginBottom: '8px', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                                  <h4 style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Business Information</h4>
                                  <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>
                                    <div><strong>Type:</strong> {business.type}</div>
                                    <div><strong>Email:</strong> {business.user?.email}</div>
                                    <div><strong>Phone:</strong> {business.phone || 'Not provided'}</div>
                                    <div><strong>Address:</strong> {
                                      businessCompany && (businessCompany.addressStreet || businessCompany.addressCity) ? (
                                        <>
                                          {businessCompany.addressStreet && <>{businessCompany.addressStreet}<br /></>}
                                          {businessCompany.addressCity && businessCompany.addressCity}
                                          {businessCompany.addressState && `, ${businessCompany.addressState}`}
                                          {businessCompany.addressZip && ` ${businessCompany.addressZip}`}
                                          {businessCompany.addressCountry && <><br />{businessCompany.addressCountry}</>}
                                        </>
                                      ) : 'Not provided'
                                    }</div>
                                  </div>
                                </div>

                                {/* Company Details */}
                                {businessCompany && (
                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#f0f9ff', borderRadius: '6px' }}>
                                    <h4 style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Company Details</h4>
                                    <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>
                                      <div><strong>Company Name:</strong> {businessCompany.name}</div>
                                      <div><strong>Industry:</strong> {businessCompany.industrySector || 'Not set'}</div>
                                    </div>
                                  </div>
                                )}

                                {/* Subscription Pricing */}
                                <div style={{ padding: '8px', background: '#fef3c7', borderRadius: '6px' }}>
                                  <h4 style={{ fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Subscription Pricing</h4>
                                  {editing ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                      <div>
                                        <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                        <input
                                          type="number"
                                          value={editing.monthly}
                                          onChange={(e) => setEditingPricing({
                                            ...editingPricing,
                                            [business.id]: { ...editing, monthly: parseFloat(e.target.value) || 0 }
                                          })}
                                          style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                        <input
                                          type="number"
                                          value={editing.quarterly}
                                          onChange={(e) => setEditingPricing({
                                            ...editingPricing,
                                            [business.id]: { ...editing, quarterly: parseFloat(e.target.value) || 0 }
                                          })}
                                          style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                        <input
                                          type="number"
                                          value={editing.annual}
                                          onChange={(e) => setEditingPricing({
                                            ...editingPricing,
                                            [business.id]: { ...editing, annual: parseFloat(e.target.value) || 0 }
                                          })}
                                          style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                        />
                                      </div>
                                      <button
                                        onClick={() => {
                                          if (businessCompany) {
                                            updateCompanyPricing(businessCompany.id, editing);
                                          }
                                        }}
                                        style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingPricing((prev) => {
                                            const newState = { ...prev };
                                            delete newState[business.id];
                                            return newState;
                                          });
                                        }}
                                        style={{ padding: '4px 10px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div>
                                      <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.5', marginBottom: '6px' }}>
                                        <div><strong>Monthly:</strong> ${businessCompany?.subscriptionMonthlyPrice?.toFixed(2) ?? '0.00'}</div>
                                        <div><strong>Quarterly:</strong> ${businessCompany?.subscriptionQuarterlyPrice?.toFixed(2) ?? '0.00'}</div>
                                        <div><strong>Annual:</strong> ${businessCompany?.subscriptionAnnualPrice?.toFixed(2) ?? '0.00'}</div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setEditingPricing({
                                            ...editingPricing,
                                            [business.id]: {
                                              monthly: businessCompany?.subscriptionMonthlyPrice ?? 0,
                                              quarterly: businessCompany?.subscriptionQuarterlyPrice ?? 0,
                                              annual: businessCompany?.subscriptionAnnualPrice ?? 0
                                            }
                                          });
                                        }}
                                        style={{ padding: '4px 10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                      >
                                        Edit Pricing
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Affiliates Tab */}
              {siteAdminTab === 'affiliates' && (
                <div>
                  {/* Add Affiliate Button */}
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Affiliate Partners ({affiliates.length})
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {affiliates.length > 0 && (
                        <button
                          onClick={() => {
                            if (expandedAffiliateId) {
                              setExpandedAffiliateId(null);
                            } else {
                              // Expand the first one as a sample
                              setExpandedAffiliateId(affiliates[0]?.id || null);
                            }
                          }}
                          style={{
                            padding: '10px 16px',
                            background: '#94a3b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {expandedAffiliateId ? 'Collapse All' : 'Expand All'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (showAddAffiliateForm) {
                            setShowAddAffiliateForm(false);
                            setEditingAffiliate(null);
                          } else {
                            setShowAddAffiliateForm(true);
                            setEditingAffiliate({
                              name: '',
                              contactName: '',
                              contactEmail: '',
                              contactPhone: '',
                              address: '',
                              city: '',
                              state: '',
                              zip: '',
                              website: '',
                              isActive: true
                            });
                          }
                        }}
                        style={{
                          padding: '10px 16px',
                          background: showAddAffiliateForm ? '#94a3b8' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {showAddAffiliateForm ? 'Cancel' : '+ Add Affiliate'}
                      </button>
                    </div>
                  </div>

                  {/* Add/Edit Affiliate Form */}
                  {(showAddAffiliateForm || editingAffiliate) && (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '2px solid #667eea' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                        {editingAffiliate?.id ? 'Edit Affiliate' : 'Add New Affiliate'}
                      </h3>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        {/* Left Column */}
                        <div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Affiliate Name *
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.name || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, name: e.target.value})}
                              placeholder="e.g., ABC Partnership"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Contact Name
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.contactName || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, contactName: e.target.value})}
                              placeholder="Contact person"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                Email
                              </label>
                              <input
                                type="email"
                                value={editingAffiliate?.contactEmail || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, contactEmail: e.target.value})}
                                placeholder="email@example.com"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                Phone
                              </label>
                              <input
                                type="tel"
                                value={editingAffiliate?.contactPhone || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, contactPhone: e.target.value})}
                                placeholder="(555) 123-4567"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column */}
                        <div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Street Address
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.address || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, address: e.target.value})}
                              placeholder="123 Main St"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                City
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.city || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, city: e.target.value})}
                                placeholder="City"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                State
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.state || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, state: e.target.value})}
                                placeholder="ST"
                                maxLength={2}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textTransform: 'uppercase' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                ZIP
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.zip || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, zip: e.target.value})}
                                placeholder="12345"
                                maxLength={10}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Website
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.website || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, website: e.target.value})}
                              placeholder="www.example.com"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editingAffiliate?.isActive !== false}
                            onChange={(e) => setEditingAffiliate({...editingAffiliate, isActive: e.target.checked})}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#475569' }}>
                            Active (can be selected during registration)
                          </span>
                        </label>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          onClick={() => {
                            setEditingAffiliate(null);
                            setShowAddAffiliateForm(false);
                          }}
                          style={{ padding: '6px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!editingAffiliate?.name) {
                              alert('Please enter an affiliate name');
                              return;
                            }

                            try {
                              const method = editingAffiliate.id ? 'PUT' : 'POST';
                              const response = await fetch('/api/affiliates', {
                                method,
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(editingAffiliate)
                              });

                              const data = await response.json();
                              if (!response.ok) {
                                alert(data.error || 'Failed to save affiliate');
                                return;
                              }

                              // Reload affiliates
                              const affiliatesResponse = await fetch('/api/affiliates');
                              const affiliatesData = await affiliatesResponse.json();
                              if (affiliatesData.affiliates) {
                                setAffiliates(affiliatesData.affiliates);
                              }

                              setEditingAffiliate(null);
                              setShowAddAffiliateForm(false);
                              alert(editingAffiliate.id ? 'Affiliate updated successfully!' : 'Affiliate created successfully!');
                            } catch (error) {
                              console.error('Error saving affiliate:', error);
                              alert('Failed to save affiliate');
                            }
                          }}
                          style={{ padding: '6px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          {editingAffiliate?.id ? 'Update Affiliate' : 'Create Affiliate'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Affiliates List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {affiliates.length === 0 ? (
                      <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
                        <p style={{ fontSize: '16px', marginBottom: '8px' }}>No affiliates yet</p>
                        <p style={{ fontSize: '14px' }}>Click "Add Affiliate" to create your first affiliate partner</p>
                      </div>
                    ) : (
                      affiliates.map((affiliate: any) => (
                        <div key={affiliate.id} style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                  {affiliate.name}
                                </h3>
                                {!affiliate.isActive && (
                                  <span style={{ padding: '4px 8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                    INACTIVE
                                  </span>
                                )}
                                <span style={{ padding: '4px 8px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                  {affiliate._count.companies} Business{affiliate._count.companies !== 1 ? 'es' : ''}
                                </span>
                                <span style={{ padding: '4px 8px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                  {affiliate.codes?.length || 0} Code{affiliate.codes?.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              
                              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                {affiliate.contactName && <div>Contact: {affiliate.contactName}</div>}
                                {affiliate.contactEmail && <div>Email: {affiliate.contactEmail}</div>}
                                {affiliate.contactPhone && <div>Phone: {affiliate.contactPhone}</div>}
                              </div>

                              <button
                                onClick={() => setExpandedAffiliateId(expandedAffiliateId === affiliate.id ? null : affiliate.id)}
                                style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                {expandedAffiliateId === affiliate.id ? 'â–¼ Hide Details' : 'â–¶ See Codes & Pricing'}
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                  setEditingAffiliate(affiliate);
                                  setShowAddAffiliateForm(false);
                                  setExpandedAffiliateId(null); // Close any expanded details
                                  // Scroll to top to show the edit form
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{ padding: '8px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete affiliate "${affiliate.name}"? This cannot be undone.`)) return;
                                  
                                  try {
                                    const response = await fetch(`/api/affiliates?id=${affiliate.id}`, {
                                      method: 'DELETE'
                                    });
                                    
                                    const data = await response.json();
                                    if (!response.ok) {
                                      alert(data.error || 'Failed to delete affiliate');
                                      return;
                                    }

                                    // Reload affiliates
                                    const affiliatesResponse = await fetch('/api/affiliates');
                                    const affiliatesData = await affiliatesResponse.json();
                                    if (affiliatesData.affiliates) {
                                      setAffiliates(affiliatesData.affiliates);
                                    }
                                    alert('Affiliate deleted successfully!');
                                  } catch (error) {
                                    console.error('Error deleting affiliate:', error);
                                    alert('Failed to delete affiliate');
                                  }
                                }}
                                style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {expandedAffiliateId === affiliate.id && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
                              {/* Affiliate Codes Management */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Affiliate Codes</h4>
                                </div>

                                {/* Add New Code Form */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                  {/* Row 1: Code Info */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 80px 120px', gap: '8px', marginBottom: '8px' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Code *
                                      </label>
                                      <input
                                        type="text"
                                        value={newAffiliateCode.code}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, code: e.target.value.toUpperCase()})}
                                        placeholder="PROMO2025"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Description
                                      </label>
                                      <input
                                        type="text"
                                        value={newAffiliateCode.description}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, description: e.target.value})}
                                        placeholder="Optional"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Max Uses
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.maxUses}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, maxUses: e.target.value})}
                                        placeholder="âˆž"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Expires
                                      </label>
                                      <input
                                        type="date"
                                        value={newAffiliateCode.expiresAt}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, expiresAt: e.target.value})}
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Row 2: Pricing & Button */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Monthly ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.monthlyPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, monthlyPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Quarterly ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.quarterlyPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, quarterlyPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Annual ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.annualPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, annualPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (!newAffiliateCode.code) {
                                          alert('Please enter a code');
                                          return;
                                        }
                                        if (!newAffiliateCode.monthlyPrice || !newAffiliateCode.quarterlyPrice || !newAffiliateCode.annualPrice) {
                                          alert('Please enter all pricing fields');
                                          return;
                                        }

                                        try {
                                          const response = await fetch('/api/affiliates/codes', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              affiliateId: affiliate.id,
                                              code: newAffiliateCode.code,
                                              description: newAffiliateCode.description || null,
                                              monthlyPrice: parseFloat(newAffiliateCode.monthlyPrice),
                                              quarterlyPrice: parseFloat(newAffiliateCode.quarterlyPrice),
                                              annualPrice: parseFloat(newAffiliateCode.annualPrice),
                                              maxUses: newAffiliateCode.maxUses ? parseInt(newAffiliateCode.maxUses) : null,
                                              expiresAt: newAffiliateCode.expiresAt || null
                                            })
                                          });

                                          const data = await response.json();
                                          if (!response.ok) {
                                            alert(data.error || 'Failed to create code');
                                            return;
                                          }

                                          // Reload affiliates
                                          const affiliatesResponse = await fetch('/api/affiliates');
                                          const affiliatesData = await affiliatesResponse.json();
                                          if (affiliatesData.affiliates) {
                                            setAffiliates(affiliatesData.affiliates);
                                          }

                                          setNewAffiliateCode({code: '', description: '', maxUses: '', expiresAt: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: ''});
                                          alert('Code created successfully!');
                                        } catch (error) {
                                          console.error('Error creating code:', error);
                                          alert('Failed to create code');
                                        }
                                      }}
                                      style={{ padding: '6px 12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                      + Add Code
                                    </button>
                                  </div>
                                </div>

                                {/* Codes List */}
                                {affiliate.codes && affiliate.codes.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {affiliate.codes.map((code: any) => (
                                      <div key={code.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                                              {code.code}
                                            </span>
                                            {!code.isActive && (
                                              <span style={{ padding: '2px 6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                                                INACTIVE
                                              </span>
                                            )}
                                            {code.expiresAt && new Date(code.expiresAt) < new Date() && (
                                              <span style={{ padding: '2px 6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                                                EXPIRED
                                              </span>
                                            )}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                                            {code.description && <span>{code.description} â€¢ </span>}
                                            <span>Uses: {code.currentUses}{code.maxUses ? `/${code.maxUses}` : ''}</span>
                                            {code.expiresAt && <span> â€¢ Expires: {new Date(code.expiresAt).toLocaleDateString()}</span>}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '4px', fontWeight: '600' }}>
                                            Pricing: ${code.monthlyPrice}/mo â€¢ ${code.quarterlyPrice}/qtr â€¢ ${code.annualPrice}/yr
                                          </div>
                                        </div>
                                        <button
                                          onClick={async () => {
                                            if (!confirm(`Delete code "${code.code}"?`)) return;
                                            
                                            try {
                                              const response = await fetch(`/api/affiliates/codes?id=${code.id}`, {
                                                method: 'DELETE'
                                              });
                                              
                                              if (!response.ok) {
                                                const data = await response.json();
                                                alert(data.error || 'Failed to delete code');
                                                return;
                                              }

                                              // Reload affiliates
                                              const affiliatesResponse = await fetch('/api/affiliates');
                                              const affiliatesData = await affiliatesResponse.json();
                                              if (affiliatesData.affiliates) {
                                                setAffiliates(affiliatesData.affiliates);
                                              }
                                            } catch (error) {
                                              console.error('Error deleting code:', error);
                                              alert('Failed to delete code');
                                            }
                                          }}
                                          style={{ padding: '4px 8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                                    No codes yet. Add a code above.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Default Pricing Tab */}
              {siteAdminTab === 'default-pricing' && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Default Subscription Pricing</h2>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
                    Set default pricing for new businesses and consultants. You can still customize pricing for individual companies.
                  </p>

                  {/* Business Default Pricing */}
                  <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🏢 Default Business Pricing
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Monthly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessMonthlyPrice}
                          onChange={(e) => setDefaultBusinessMonthlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="195.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed monthly</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Quarterly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessQuarterlyPrice}
                          onChange={(e) => setDefaultBusinessQuarterlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="500.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed every 3 months</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Annual Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessAnnualPrice}
                          onChange={(e) => setDefaultBusinessAnnualPrice(parseFloat(e.target.value) || 0)}
                          placeholder="1750.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: '500' }}>Save 15% annually</div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              businessMonthlyPrice: defaultBusinessMonthlyPrice,
                              businessQuarterlyPrice: defaultBusinessQuarterlyPrice,
                              businessAnnualPrice: defaultBusinessAnnualPrice,
                              consultantMonthlyPrice: defaultConsultantMonthlyPrice,
                              consultantQuarterlyPrice: defaultConsultantQuarterlyPrice,
                              consultantAnnualPrice: defaultConsultantAnnualPrice
                            })
                          });
                          
                          if (response.ok) {
                            alert(`✅ Business default pricing saved:\nMonthly: $${defaultBusinessMonthlyPrice.toFixed(2)}\nQuarterly: $${defaultBusinessQuarterlyPrice.toFixed(2)}\nAnnual: $${defaultBusinessAnnualPrice.toFixed(2)}\n\nThese defaults will be used for all new businesses.`);
                          } else {
                            alert('âŒ Failed to save pricing. Please try again.');
                          }
                        } catch (error) {
                          console.error('Error saving pricing:', error);
                          alert('âŒ Error saving pricing. Please try again.');
                        }
                      }}
                      style={{
                        padding: '12px 24px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      💾 Save Business Defaults
                    </button>
                  </div>

                  {/* Consultant Default Pricing */}
                  <div style={{ background: '#f0fdf4', border: '2px solid #10b981', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#065f46', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      👥 Default Consultant Pricing
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Monthly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantMonthlyPrice}
                          onChange={(e) => setDefaultConsultantMonthlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="195.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed monthly</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Quarterly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantQuarterlyPrice}
                          onChange={(e) => setDefaultConsultantQuarterlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="500.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed every 3 months</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Annual Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantAnnualPrice}
                          onChange={(e) => setDefaultConsultantAnnualPrice(parseFloat(e.target.value) || 0)}
                          placeholder="1750.00"
                          step="0.01"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: '500' }}>Save 15% annually</div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              businessMonthlyPrice: defaultBusinessMonthlyPrice,
                              businessQuarterlyPrice: defaultBusinessQuarterlyPrice,
                              businessAnnualPrice: defaultBusinessAnnualPrice,
                              consultantMonthlyPrice: defaultConsultantMonthlyPrice,
                              consultantQuarterlyPrice: defaultConsultantQuarterlyPrice,
                              consultantAnnualPrice: defaultConsultantAnnualPrice
                            })
                          });
                          
                          if (response.ok) {
                            alert(`✅ Consultant default pricing saved:\nMonthly: $${defaultConsultantMonthlyPrice.toFixed(2)}\nQuarterly: $${defaultConsultantQuarterlyPrice.toFixed(2)}\nAnnual: $${defaultConsultantAnnualPrice.toFixed(2)}\n\nThese defaults will be used for all new consultants.`);
                          } else {
                            alert('âŒ Failed to save pricing. Please try again.');
                          }
                        } catch (error) {
                          console.error('Error saving pricing:', error);
                          alert('âŒ Error saving pricing. Please try again.');
                        }
                      }}
                      style={{
                        padding: '12px 24px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      💾 Save Consultant Defaults
                    </button>
                  </div>

                  <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💡 How It Works
                    </h4>
                    <ul style={{ fontSize: '13px', color: '#78350f', marginLeft: '20px', marginBottom: '0' }}>
                      <li style={{ marginBottom: '6px' }}>Business defaults apply when creating companies in the <strong>Businesses</strong> tab</li>
                      <li style={{ marginBottom: '6px' }}>Consultant defaults apply when creating companies in the <strong>Consultants</strong> tab</li>
                      <li style={{ marginBottom: '6px' }}>You can override pricing for any individual company at any time</li>
                      <li>Existing company pricing will not be affected by changes to defaults</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Site Administrators Tab */}
              {siteAdminTab === 'siteadmins' && (
              <>
              {/* Add Site Admin Form */}
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddSiteAdminForm ? '12px' : '0' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Add New Site Administrator</h2>
                  <button
                    onClick={() => setShowAddSiteAdminForm(!showAddSiteAdminForm)}
                    style={{ 
                      padding: '4px 12px', 
                      background: showAddSiteAdminForm ? '#f1f5f9' : '#667eea', 
                      color: showAddSiteAdminForm ? '#475569' : 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      cursor: 'pointer' 
                    }}
                  >
                    {showAddSiteAdminForm ? 'â–²' : 'â–¼'}
                  </button>
                </div>
                {showAddSiteAdminForm && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="First Name *"
                          value={newSiteAdminFirstName}
                          onChange={(e) => setNewSiteAdminFirstName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Last Name *"
                          value={newSiteAdminLastName}
                          onChange={(e) => setNewSiteAdminLastName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="email"
                          placeholder="Email *"
                          value={newSiteAdminEmail}
                          onChange={(e) => setNewSiteAdminEmail(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <div>
                          <input
                            type="password"
                            placeholder="Password *"
                            value={newSiteAdminPassword}
                            onChange={(e) => setNewSiteAdminPassword(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%' }}
                          />
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                            Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!newSiteAdminFirstName || !newSiteAdminLastName || !newSiteAdminEmail || !newSiteAdminPassword) {
                          alert('Please fill in all required fields');
                          return;
                        }
                        
                        setIsLoading(true);
                        try {
                          const response = await fetch('/api/siteadmins', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              firstName: newSiteAdminFirstName,
                              lastName: newSiteAdminLastName,
                              email: newSiteAdminEmail,
                              password: newSiteAdminPassword,
                            }),
                          });

                          if (response.ok) {
                            const newAdmin = await response.json();
                            setSiteAdmins([...siteAdmins, newAdmin]);
                            setNewSiteAdminFirstName('');
                            setNewSiteAdminLastName('');
                            setNewSiteAdminEmail('');
                            setNewSiteAdminPassword('');
                            setShowAddSiteAdminForm(false);
                            alert('✅ Site administrator added successfully!');
                          } else {
                            const error = await response.json();
                            if (error.error && error.error.includes('Password does not meet requirements')) {
                              alert('âŒ Password does not meet requirements:\n\nâ€¢ At least 8 characters\nâ€¢ One uppercase letter (A-Z)\nâ€¢ One lowercase letter (a-z)\nâ€¢ One number (0-9)\nâ€¢ One special character (!@#$%^&*)\n\nPlease create a stronger password.');
                            } else {
                              alert(`âŒ Failed to add site administrator: ${error.error || 'Unknown error'}`);
                            }
                          }
                        } catch (error) {
                          console.error('Error adding site administrator:', error);
                          alert('âŒ Error adding site administrator. Please try again.');
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      style={{ 
                        padding: '8px 20px', 
                        background: isLoading ? '#94a3b8' : '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? 'Adding...' : 'Add Site Administrator'}
                    </button>
                  </>
                )}
              </div>

              {/* Site Admins List */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Site Administrators ({siteAdmins.length})</h2>
                
                {siteAdmins.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>ðŸ‘¥</div>
                    <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No site administrators yet</p>
                    <p style={{ fontSize: '14px' }}>Add a new site administrator to get started</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {siteAdmins.map((admin: any) => (
                      <div
                        key={admin.id}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                            {admin.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {admin.email}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete site administrator "${admin.name}"?`)) {
                                return;
                              }
                              
                              try {
                                const response = await fetch(`/api/siteadmins?id=${admin.id}`, {
                                  method: 'DELETE',
                                });

                                if (response.ok) {
                                  setSiteAdmins(siteAdmins.filter((a: any) => a.id !== admin.id));
                                  alert('✅ Site administrator deleted successfully!');
                                } else {
                                  alert('âŒ Failed to delete site administrator');
                                }
                              } catch (error) {
                                console.error('Error deleting site administrator:', error);
                                alert('âŒ Error deleting site administrator');
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}
            </div>

  );
}
