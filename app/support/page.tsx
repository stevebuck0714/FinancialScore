'use client';

import { useState } from 'react';

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'getting-started' | 'privacy' | 'license' | 'request-support'>('getting-started');

  const tabs = [
    { id: 'getting-started' as const, label: 'ℹ️ Getting Started', emoji: 'ℹ️' },
    { id: 'privacy' as const, label: '🔒 Privacy Policy', emoji: '🔒' },
    { id: 'license' as const, label: '📄 License Agreement', emoji: '📄' },
    { id: 'request-support' as const, label: '🎫 Request Support', emoji: '🎫' },
  ];

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 20px'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        background: 'white', 
        borderRadius: '16px', 
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '32px 40px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>
            Support Center
          </h1>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              transition: 'all 0.2s',
              border: '1px solid rgba(255,255,255,0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            ← Back to Dashboard
          </a>
        </div>

        {/* Tabs */}
        <div style={{ 
          background: '#f8fafc', 
          borderBottom: '2px solid #e2e8f0',
          display: 'flex',
          padding: '0 40px'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px',
                border: 'none',
                background: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#667eea' : '#64748b',
                fontWeight: activeTab === tab.id ? '600' : '500',
                fontSize: '15px',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '3px solid #667eea' : '3px solid transparent',
                transition: 'all 0.2s',
                marginBottom: '-2px'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#667eea';
                  e.currentTarget.style.background = '#f0f9ff';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: '40px' }}>
          {activeTab === 'getting-started' && <GettingStartedContent />}
          {activeTab === 'privacy' && <PrivacyPolicyContent />}
          {activeTab === 'license' && <LicenseAgreementContent />}
          {activeTab === 'request-support' && <RequestSupportContent />}
        </div>
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
                color: '#667eea', 
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          1. Initial Login
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          After Registering, you'll see your main Dashboard with the following sections, your User type will be Admin.
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          6. Reviewing Monthly Data
        </h3>
        
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Go to the "Data Review" tab to verify the data looks correct</li>
          <li>Navigate to any analysis section to verify data is displaying correctly</li>
        </ol>
      </section>

      {/* Section 7: Analyzing Financial Reports */}
      <section id="section-7" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#667eea', marginBottom: '12px' }}>📊 Projections</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Revenue forecasting</li>
            <li>Expense projections</li>
            <li>Growth scenarios</li>
            <li>Future performance estimates</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#667eea', marginBottom: '12px' }}>📝 Trend Analysis</h4>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#667eea', marginBottom: '12px' }}>💵 Cash Flow Analysis</h4>
          <ul style={{ marginLeft: '24px', fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
            <li>Operating cash flow</li>
            <li>Investing activities</li>
            <li>Financing activities</li>
            <li>Cash flow trends</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#667eea', marginBottom: '12px' }}>🎯 Financial Score</h4>
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
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
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
      <section style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
        <h3 style={{ color: 'white', fontSize: '24px', marginBottom: '16px' }}>Need Help?</h3>
        <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: '24px' }}>
          If you encounter any issues or have questions, we're here to help!
        </p>
        <a 
          href="mailto:support@corelytics.com"
          style={{
            display: 'inline-block',
            background: 'white',
            color: '#667eea',
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
  const [pageModule, setPageModule] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    padding: '12px 14px',
    fontSize: '15px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: 'white',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '6px' };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>
        Request Support
      </h2>
      <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px' }}>
        Submit a support ticket and we will respond at your contact email. Tickets are routed to support@corelytics.com.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={labelStyle}>Subject *</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of your issue" style={inputStyle} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide detailed description of your issue or request" rows={6} style={{ ...inputStyle, resize: 'vertical' }} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
        {submitMessage && (
          <div style={{ padding: '14px 18px', borderRadius: '8px', background: submitMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: submitMessage.type === 'success' ? '#166534' : '#991b1b', fontSize: '14px' }}>
            {submitMessage.text}
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '14px 28px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            background: isSubmitting ? '#94a3b8' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

