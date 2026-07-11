'use client';

import { useEffect, useState } from 'react';

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'getting-started' | 'privacy' | 'license' | 'request-support'>('getting-started');

  const tabs = [
    { id: 'getting-started' as const, label: 'Getting Started', description: 'Onboarding, login, and setup' },
    { id: 'privacy' as const, label: 'Privacy Policy', description: 'Data handling and privacy' },
    { id: 'license' as const, label: 'License Agreement', description: 'Product terms and usage' },
    { id: 'request-support' as const, label: 'Request Support', description: 'Submit a support ticket' },
  ];

  const activeTopic = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fb', color: '#0f172a' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #dbe3ee', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)', padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#1F70C1', letterSpacing: '-0.4px' }}>
            Corelytics<sup style={{ fontSize: '11px', fontWeight: 500 }}>TM</sup>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '4px' }}>
            Support Center
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a href="/?view=ma-welcome" style={{ padding: '9px 14px', background: '#f8fafc', color: '#334155', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', border: '1px solid #dbe3ee' }}>
            Team Assessment
          </a>
          <a href="/" style={{ padding: '9px 14px', background: '#0f172a', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', border: '1px solid #0f172a' }}>
            Back to Dashboard
          </a>
        </div>
      </header>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px 48px', display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: '24px' }}>
        <aside style={{ background: 'white', border: '1px solid #dbe3ee', borderRadius: '14px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)', alignSelf: 'start', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Help Topics
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              How can we help?
            </div>
          </div>

          <nav style={{ padding: '10px' }} aria-label="Support topics">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ width: '100%', display: 'block', textAlign: 'left', padding: '13px 14px', marginBottom: '6px', border: '1px solid', borderColor: isActive ? '#bfdbfe' : 'transparent', borderRadius: '10px', background: isActive ? '#eff6ff' : 'transparent', color: isActive ? '#1F70C1' : '#334155', cursor: 'pointer' }}
                >
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 800 }}>{tab.label}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: isActive ? '#1d4ed8' : '#64748b', marginTop: '3px', lineHeight: 1.35 }}>
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main style={{ background: 'white', border: '1px solid #dbe3ee', borderRadius: '14px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '26px 32px', borderBottom: '1px solid #e2e8f0', background: '#fbfdff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{activeTopic.label}</h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0' }}>{activeTopic.description}</p>
            </div>
            <a href="mailto:support@corelytics.com" style={{ padding: '9px 14px', background: '#f8fafc', color: '#334155', textDecoration: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', border: '1px solid #dbe3ee', whiteSpace: 'nowrap' }}>
              support@corelytics.com
            </a>
          </div>

          <div style={{ padding: activeTab === 'request-support' ? '24px 28px' : '32px' }}>
            {activeTab === 'getting-started' && <GettingStartedContent />}
            {activeTab === 'privacy' && <PrivacyPolicyContent />}
            {activeTab === 'license' && <LicenseAgreementContent />}
            {activeTab === 'request-support' && <RequestSupportContent />}
          </div>
        </main>
      </div>
    </div>
  );
}

// Getting Started Content Component
function GettingStartedContent() {
  return (
    <div>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>
        📚 Getting Started Guide
      </h2>
      <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
        Everything you need to know to get started with Corelytics
      </p>

      {/* Table of Contents */}
      <div style={{ 
        background: '#f8fafc', 
        borderRadius: '12px', 
        padding: '24px', 
        marginBottom: '40px',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          📋 Table of Contents
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {[
            { num: 1, title: 'Initial Login' },
            { num: 2, title: 'Company Profile' },
            { num: 3, title: 'Connecting your Accounting System' },
            { num: 4, title: 'Line of Business Settings' },
            { num: 5, title: 'Mapping Accounts' },
            { num: 6, title: 'Reviewing Monthly Data' },
            { num: 7, title: 'Analyzing Financial Data' },
            { num: 8, title: 'Reviewing Operations Reporting' },
          ].map(item => (
            <a 
              key={item.num}
              href={`#section-${item.num}`}
              style={{ 
                color: '#1F70C1', 
                textDecoration: 'none',
                fontSize: '14px',
                padding: '8px 12px',
                borderRadius: '6px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#ede9fe'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {item.num}. {item.title}
            </a>
          ))}
        </div>
      </div>

      {/* Section 1: Initial Login */}
      <section id="section-1" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          1. Initial Login
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          After your account is created, sign in with your email address and password. Corelytics may require multi-factor authentication (MFA) before opening the dashboard. MFA protects company financial data by requiring a second verification step in addition to your password.
        </p>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          First-Time MFA Setup
        </h4>
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Enter your email address and password on the login page.</li>
          <li>If MFA is not enrolled yet, Corelytics will prompt you to set it up.</li>
          <li>Open an authenticator app such as Microsoft Authenticator, Google Authenticator, Authy, or 1Password.</li>
          <li>Scan the QR code shown by Corelytics, then enter the 6-digit code from the app.</li>
          <li>Save your backup codes in a secure place. Backup codes can be used if you lose access to your authenticator device.</li>
        </ol>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Returning Login
        </h4>
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Enter your email address and password.</li>
          <li>Enter the current 6-digit code from your authenticator app when prompted.</li>
          <li>If available, choose to trust the device only on a private computer you control.</li>
          <li>If you cannot access your authenticator app, use a backup code or contact your administrator to reset MFA.</li>
        </ol>

        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          After successful login and MFA verification, you'll see your main dashboard. Admin users can manage company setup, users, integrations, and reporting access from the dashboard.
        </p>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Dashboard Tabs
        </h4>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Profile</strong> - Information about your company, required fields before importing data</li>
          <li><strong>Manage Users</strong> - View and manage Users, here you can add users from inside or outside your company</li>
        </ul>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Company Dashboard Tabs
        </h4>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Company Management</strong> - Edit company details and users</li>
          <li><strong>Payments</strong> - Company subscription info, if required</li>
          <li><strong>Excel Import</strong> - Import financial data from Excel files</li>
          <li><strong>Accounting API Connections</strong> - Connect to your accounting solution</li>
          <li><strong>Account Mapping</strong> - Map accounts to financial categories</li>
          <li><strong>Data Review</strong> - Review imported data</li>
        </ul>
      </section>

      {/* Section 2: Profile Tab */}
      <section id="section-2" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          2. Profile Tab
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Complete the company profile with the following information:
        </p>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Company address and contact information</li>
          <li>Accounting System selection</li>
          <li>Sector (required for operational reporting functionality)</li>
          <li>Industry Group (required for benchmarking)</li>
        </ul>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Optional Information
        </h4>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Fiscal year end date</li>
          <li>Company website</li>
          <li>Primary business description</li>
          <li>Number of employees</li>
          <li>Year established</li>
        </ul>
      </section>

      {/* Section 3: Connecting Accounting Systems */}
      <section id="section-3" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          3. Connecting Accounting Systems
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Corelytics integrates directly numerous accounting solutions enabling seamless data import.
        </p>

        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Navigate to the "Accounting API Connections" tab</li>
          <li>Click Connect to "your accounting solution"</li>
          <li>Log in with your solution credentials</li>
          <li>Authorize Corelytics to access the accounting data</li>
          <li>You'll be redirected back to Corelytics</li>
          <li>Now click the Sync button to sync your accounting data to Corelytics</li>
        </ol>

        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '16px', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ color: '#166534' }}>✅ Success:</strong>
          <span style={{ color: '#166534' }}> Once connected, you'll see "Status: Connected" with the company name and last sync date.</span>
        </div>
      </section>

      {/* Section 4: Lines of Business */}
      <section id="section-4" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          4. Lines of Business (LOB Settings tab)
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Corelytics provides multiple methods for allocating your financial data to specific lines of business. In the Data Mapping section you will enter up to five lines of business and then you can customize your line of business allocations here.
        </p>

        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Headcount Allocation</li>
          <li>Custom Allocation</li>
        </ul>

        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          And then on data mapping you will have additional LOB allocations of:
        </p>

        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Manual for each account</li>
          <li>Average for each account</li>
        </ul>
      </section>

      {/* Section 5: Mapping Accounts */}
      <section id="section-5" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          5. Mapping Accounts (Data Mapping tab)
        </h3>
        
        <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '20px' }}>
          <strong style={{ color: '#991b1b' }}>🎯 This is the most important step!</strong>
          <span style={{ color: '#991b1b' }}> Mapping tells Corelytics how to categorize each account for financial analysis.</span>
        </div>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Understanding the Mapping Interface
        </h4>
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          You'll see a list of all accounts from the import process with:
        </p>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Source Account Name</strong> - The account name</li>
          <li><strong>Suggested Mapping</strong> - AI-suggested category (if available)</li>
          <li><strong>Target Category</strong> - Dropdown to select the correct category</li>
        </ul>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Using AI-Assisted Mapping
        </h4>
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Corelytics includes AI-powered mapping suggestions to help speed up the mapping process.
        </p>

        <div style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '20px' }}>
          <strong style={{ color: '#1e40af' }}>💾 Don't forget:</strong>
          <span style={{ color: '#1e40af' }}> Click "Save Mappings" when done. Mappings are saved per company and will be remembered for future imports.</span>
        </div>

        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569', fontWeight: '600' }}>
          And then Process mappings!
        </p>
      </section>

      {/* Section 6: Reviewing Monthly Data */}
      <section id="section-6" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          6. Reviewing Monthly Data
        </h3>
        
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Go to the "Data Review" tab to verify the data looks correct</li>
          <li>Navigate to any analysis section to verify data is displaying correctly</li>
        </ol>
      </section>

      {/* Section 7: Analyzing Financial Reports */}
      <section id="section-7" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          7. Analyzing Financial Reports
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Now the fun part! Explore the financial analysis tools:
        </p>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>Dashboard – Customizable KPI's</h4>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>MD&A - An AI generated analysis of your monthly financial performance</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Management Discussion & Analysis</li>
            <li>Performance commentary</li>
            <li>Key insights and observations</li>
            <li>Strategic recommendations</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>📈 Financial Ratios</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Liquidity Ratios (Current, Quick)</li>
            <li>Profitability Ratios (Margins, ROA, ROE)</li>
            <li>Efficiency Ratios (Turnover)</li>
            <li>Leverage Ratios (Debt-to-Equity)</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>💰 Working Capital</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Cash conversion cycle</li>
            <li>Days sales outstanding (DSO)</li>
            <li>Days inventory outstanding (DIO)</li>
            <li>Days payables outstanding (DPO)</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>📊 Projections</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Revenue forecasting</li>
            <li>Expense projections</li>
            <li>Growth scenarios</li>
            <li>Future performance estimates</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>📝 Trend Analysis</h4>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>💵 Cash Flow Analysis</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Operating cash flow</li>
            <li>Investing activities</li>
            <li>Financing activities</li>
            <li>Cash flow trends</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F70C1', marginBottom: '12px' }}>🎯 Financial Score</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Overall health score (0-100)</li>
            <li>Breakdown by category</li>
            <li>Historical trend</li>
            <li>Peer comparison</li>
          </ul>
        </div>

        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '16px', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ color: '#166534' }}>📊 Color-coded indicators:</strong>
          <span style={{ color: '#166534' }}> Green = Good, Yellow = Caution, Red = Concern. Each ratio includes industry benchmark comparisons.</span>
        </div>
      </section>

      {/* Section 8: Operations */}
      <section id="section-8" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #1F70C1', paddingBottom: '12px' }}>
          8. Operations
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Operations Section – provides daily and month updates and insights on key operational metrics based on your Industry Sector
        </p>

        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Ops Dashboard</li>
          <li>Overview</li>
          <li>Customers</li>
          <li>A/R Aging</li>
          <li>AP Aging</li>
          <li>Products</li>
          <li>Inventory</li>
          <li>Cash</li>
        </ul>
      </section>

      {/* Need Help */}
      <section style={{ background: '#0f172a', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
        <h3 style={{ color: 'white', fontSize: '24px', marginBottom: '16px' }}>Need Help?</h3>
        <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: '24px' }}>
          If you encounter any issues or have questions, we're here to help!
        </p>
        <a 
          href="mailto:support@corelytics.com"
          style={{
            display: 'inline-block',
            background: 'white',
            color: '#1F70C1',
            padding: '14px 32px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '16px'
          }}
        >
          📧 Contact Support
        </a>
      </section>
    </div>
  );
}

// Privacy Policy Content Component
function PrivacyPolicyContent() {
  return (
    <div>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', textAlign: 'center' }}>
        Privacy Policy
      </h2>
      
      <div style={{ lineHeight: '1.8', color: '#475569', fontSize: '16px' }}>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
          <strong>Effective Date:</strong> November 11, 2025
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          1. Introduction
        </h3>
        <p style={{ marginBottom: '16px' }}>
          Corelytics ("we," "us," "our") values your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website dashboard.corelytics.com or other sub domain websites of Corelytics.com and purchase products or services from us. Please read this policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          2. Information We Collect
        </h3>
        <p style={{ marginBottom: '16px' }}>
          We may collect information about you in a variety of ways. The information we may collect on the site includes:
        </p>
        <ul style={{ marginLeft: '24px', marginBottom: '16px' }}>
          <li style={{ marginBottom: '12px' }}>
            <strong>Personal Data:</strong> Name, Email address, Mailing address, Phone number, Payment information
          </li>
          <li style={{ marginBottom: '12px' }}>
            <strong>Derivative Data:</strong> IP address, Browser type and version, Time zone setting, Operating system
          </li>
          <li style={{ marginBottom: '12px' }}>
            <strong>Financial Data:</strong> Payment method details, Transaction details
          </li>
        </ul>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          3. How We Use Your Information
        </h3>
        <ul style={{ marginLeft: '24px', marginBottom: '16px' }}>
          <li>To process transactions and fulfill orders</li>
          <li>To send you administrative information</li>
          <li>To communicate with you about your account or orders</li>
          <li>To personalize your experience on our site</li>
          <li>To improve our website and customer service</li>
          <li>To detect, prevent, and address technical issues</li>
        </ul>
        <p style={{ marginBottom: '16px', fontStyle: 'italic' }}>
          We do not store your credit card information on our servers, all credit card information is stored at the payment processor.
        </p>

        <div style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6', padding: '16px', borderRadius: '0 8px 8px 0', marginTop: '32px' }}>
          <strong style={{ color: '#1e40af' }}>📄 Full Policy:</strong>
          <span style={{ color: '#1e40af' }}> For the complete privacy policy with all sections, visit the </span>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: '600' }}>
            full Privacy Policy page
          </a>
        </div>
      </div>
    </div>
  );
}

// License Agreement Content Component
function LicenseAgreementContent() {
  return (
    <div>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', textAlign: 'center' }}>
        License Agreement
      </h2>
      
      <div style={{ lineHeight: '1.8', color: '#475569', fontSize: '16px' }}>
        <p style={{ marginBottom: '24px', fontSize: '17px', color: '#1e293b' }}>
          Corelytics™ is a software product owned by Venturis Financial, LLC. and licensed to companies to support financial analysis, business goal setting and benchmark comparisons.
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          1. License
        </h3>
        <p style={{ marginBottom: '16px' }}>
          Subject to the terms and conditions of this End User License Agreement (the "EULA"), Corelytics hereby grants Customer a non-exclusive, non-transferable, non-sublicensable license to access and use the Corelytics™ system during the term of this agreement for the sole purpose of analyzing the Customer&apos;s company financial performance.
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          2. Ownership
        </h3>
        <p style={{ marginBottom: '16px' }}>
          The Software and supporting instructions and usage guidelines (Documentation) are licensed to Customer, not sold, solely for use under the terms of this EULA. CORELYTICS retains all right, title and interest, including all intellectual property rights, relating to or embodied in the Software and Documentation.
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          3. Restrictions
        </h3>
        <p style={{ marginBottom: '16px' }}>
          Customer acknowledges that it is not entitled to a copy of the Software, and further acknowledges that it will not and will not permit third parties to reverse engineer, translate or attempt to learn the source code or functional capabilities of the Software.
        </p>

        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
          4. Payment for Services
        </h3>
        <p style={{ marginBottom: '16px' }}>
          Customer will pay the monthly fee as defined on the registration web page for the license to use the Corelytics™ software. Monthly payments will be made by credit card.
        </p>

        <div style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: '16px', borderRadius: '0 8px 8px 0', marginTop: '32px' }}>
          <strong style={{ color: '#92400e' }}>📄 Full Agreement:</strong>
          <span style={{ color: '#92400e' }}> For the complete license agreement with all terms, visit the </span>
          <a href="/license-agreement" target="_blank" rel="noopener noreferrer" style={{ color: '#92400e', fontWeight: '600' }}>
            full License Agreement page
          </a>
        </div>
      </div>
    </div>
  );
}

// Request Support Content Component
function RequestSupportContent() {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [pageModule, setPageModule] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadSupportContext = async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) return;
        const meData = await meRes.json();
        const resolvedCompanyId = meData?.user?.companyId;
        if (!resolvedCompanyId || typeof resolvedCompanyId !== 'string') return;
        setCompanyId(resolvedCompanyId);

        const companyRes = await fetch(`/api/companies?companyId=${encodeURIComponent(resolvedCompanyId)}`);
        if (!companyRes.ok) return;
        const companyData = await companyRes.json();
        const resolvedCompanyName = companyData?.companies?.[0]?.name;
        if (typeof resolvedCompanyName === 'string' && resolvedCompanyName.trim()) {
          setCompanyName(resolvedCompanyName.trim());
        }
      } catch (error) {
        console.warn('Unable to preload support company context', error);
      }
    };
    loadSupportContext();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);
    if (!subject.trim() || !category.trim() || !description.trim() || !contactName.trim() || !contactEmail.trim() || !companyName.trim()) {
      setSubmitMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/support-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority: priority || undefined,
          description: description.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          companyName: companyName.trim(),
          companyId: companyId || undefined,
          pageModule: pageModule || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit ticket');
      setSubmitMessage({ type: 'success', text: 'Support ticket submitted successfully. We will respond at ' + contactEmail + '.' });
      setSubject('');
      setCategory('');
      setPriority('');
      setDescription('');
    } catch (err) {
      setSubmitMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to submit support ticket.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 11px',
    fontSize: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: 'white',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '4px' };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
        Request Support
      </h2>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
        Submit a support ticket and we will respond at your contact email.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Subject *</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of your issue" style={inputStyle} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Category *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} required>
              <option value="">Select category</option>
              <option value="Technical Issue">Technical Issue</option>
              <option value="Account/Billing">Account/Billing</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Data/Import">Data/Import</option>
              <option value="Bug Report">Bug Report</option>
              <option value="General Question">General Question</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
              <option value="">Select priority</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide detailed description of your issue or request" rows={4} style={{ ...inputStyle, resize: 'vertical' }} required />
        </div>
        <div>
          <label style={labelStyle}>Page/Module</label>
          <select value={pageModule} onChange={(e) => setPageModule(e.target.value)} style={inputStyle}>
            <option value="">Select where the issue occurs</option>
            <option value="Dashboard">Dashboard</option>
            <option value="Data Import">Data Import</option>
            <option value="MD&A">MD&A</option>
            <option value="Ratios">Ratios</option>
            <option value="Operations">Operations</option>
            <option value="Trends">Trends</option>
            <option value="Goals">Goals</option>
            <option value="Projections">Projections</option>
            <option value="Cash Flow">Cash Flow</option>
            <option value="Working Capital">Working Capital</option>
            <option value="Loan Covenants">Loan Covenants</option>
            <option value="Ask Corelytics">Ask Corelytics</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Contact Name *</label>
            <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Your name" style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Contact Email *</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} required />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Company Name *</label>
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" style={inputStyle} required />
        </div>
        {submitMessage && (
          <div style={{ padding: '10px 12px', borderRadius: '8px', background: submitMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: submitMessage.type === 'success' ? '#166534' : '#991b1b', fontSize: '13px' }}>
            {submitMessage.text}
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: '600',
            color: 'white',
            background: isSubmitting ? '#94a3b8' : '#0f172a',
            border: 'none',
            borderRadius: '8px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
        </button>
      </form>
    </div>
  );
}

