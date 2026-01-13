'use client';

import { useState } from 'react';

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'getting-started' | 'privacy' | 'license' | 'contact'>('getting-started');

  const tabs = [
    { id: 'getting-started' as const, label: 'ℹ️ Getting Started', emoji: 'ℹ️' },
    { id: 'privacy' as const, label: '🔒 Privacy Policy', emoji: '🔒' },
    { id: 'license' as const, label: '📄 License Agreement', emoji: '📄' },
    { id: 'contact' as const, label: '💬 Contact Support', emoji: '💬' },
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
          {activeTab === 'contact' && <ContactSupportContent />}
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
        📚 Consultant Getting Started Guide
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
            { num: 1, title: 'Registration' },
            { num: 2, title: 'Dashboard Overview' },
            { num: 3, title: 'Adding Your First Client' },
            { num: 4, title: 'Completing the Company Profile' },
            { num: 5, title: 'Connecting QuickBooks' },
            { num: 6, title: 'Importing Financial Data' },
            { num: 7, title: 'Mapping Accounts' },
            { num: 8, title: 'Processing Monthly Data' },
            { num: 9, title: 'Analyzing Reports' },
            { num: 10, title: 'Managing Your Team' },
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

      {/* Section 1: Registration */}
      <section id="section-1" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          1. Registration
        </h3>
        
        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Step 1: Navigate to Registration
        </h4>
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Go to the Corelytics website</li>
          <li>Click <strong>"Register"</strong> or <strong>"Get Started"</strong></li>
          <li>Select <strong>"Consultant"</strong> as your account type</li>
        </ol>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Step 2: Complete Registration Form
        </h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#1e293b' }}>Field</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#1e293b' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              { field: 'Full Name', desc: 'Your full legal name' },
              { field: 'Email', desc: 'Your business email address (this will be your login)' },
              { field: 'Phone', desc: 'Your contact phone number' },
              { field: 'Password', desc: 'Create a strong password (min 8 characters, uppercase, lowercase, number, special character)' },
              { field: 'Company Name', desc: "Your consulting firm's name" },
              { field: 'Company Address', desc: 'Your business address' },
              { field: 'Website', desc: 'Your company website (optional)' },
            ].map((row, i) => (
              <tr key={i}>
                <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#1e293b' }}>{row.field}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 2: Dashboard Overview */}
      <section id="section-2" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          2. Initial Login & Dashboard Overview
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          After logging in, you'll see your main Consultant Dashboard with the following sections:
        </p>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Consultant Dashboard Tabs
        </h4>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Team Management</strong> - Manage your team members</li>
          <li><strong>Company List</strong> - View all your client companies</li>
        </ul>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Company Dashboard Tabs (after selecting a company)
        </h4>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Company Management</strong> - Edit company details and users</li>
          <li><strong>Payments</strong> - Company subscription info</li>
          <li><strong>Excel Import</strong> - Import financial data from Excel files</li>
          <li><strong>Accounting API Connections</strong> - Connect to QuickBooks</li>
          <li><strong>Data Review</strong> - Review imported data</li>
          <li><strong>Account Mapping</strong> - Map accounts to financial categories</li>
        </ul>
      </section>

      {/* Section 3: Adding Client */}
      <section id="section-3" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          3. Adding Your First Client Company
        </h3>
        
        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Step 1: Go to Company Management
        </h4>
        <ol style={{ marginLeft: '24px', marginBottom: '12px', lineHeight: '1.8', color: '#475569' }}>
          <li>From your dashboard, click the <strong>"Company Management"</strong> tab</li>
          <li>In the Company Details section, enter a Client Company Name</li>
        </ol>

        <div style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '12px' }}>
          <strong style={{ color: '#92400e' }}>💡 Tip:</strong>
          <span style={{ color: '#92400e' }}> If you have an affiliate code, enter it now.</span>
        </div>

        <ol start={3} style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Return to the Company Management page</li>
        </ol>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Step 2: Enter Company Details
        </h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#1e293b' }}>Field</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#1e293b' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              { field: 'Company Name', desc: "Client's business name" },
              { field: 'Industry Sector', desc: 'Select from the dropdown (important for benchmarking!)' },
              { field: 'Address', desc: 'Company street address' },
              { field: 'City, State, ZIP', desc: 'Location details' },
            ].map((row, i) => (
              <tr key={i}>
                <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', color: '#1e293b' }}>{row.field}</td>
                <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{row.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '20px' }}>
          <strong style={{ color: '#1e40af' }}>⚠️ Important:</strong>
          <span style={{ color: '#1e40af' }}> Selecting the correct industry sector is crucial for accurate benchmark comparisons!</span>
        </div>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Step 3: Add Company Users
        </h4>
        <p style={{ marginBottom: '12px', lineHeight: '1.8', color: '#475569' }}>
          Create logins for your client's users with their name, email, phone, and password.
        </p>
      </section>

      {/* Section 4: Company Profile */}
      <section id="section-4" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          4. Completing the Company Profile
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Complete the company profile with the following information:
        </p>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Company address and contact information</li>
          <li>Industry sector selection (critical for benchmarking)</li>
          <li>Fiscal year end date</li>
          <li>Company website</li>
          <li>Primary business description</li>
          <li>Number of employees</li>
          <li>Year established</li>
        </ul>
      </section>

      {/* Section 5: QuickBooks */}
      <section id="section-5" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          5. Connecting QuickBooks
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Corelytics integrates directly with QuickBooks Online for seamless data import.
        </p>

        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>From your <strong>Company List</strong>, click on the company you want to connect</li>
          <li>Navigate to the <strong>"Accounting API Connections"</strong> tab</li>
          <li>Click <strong>"Connect to QuickBooks"</strong></li>
          <li>Log in with the QuickBooks credentials for that company</li>
          <li>Authorize Corelytics to access the accounting data</li>
          <li>You'll be redirected back to Corelytics</li>
        </ol>

        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '16px', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ color: '#166534' }}>✅ Success:</strong>
          <span style={{ color: '#166534' }}> Once connected, you'll see "Status: Connected" with the company name and last sync date.</span>
        </div>
      </section>

      {/* Section 6: Importing Data */}
      <section id="section-6" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          6. Importing Financial Data
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          You have two options for importing financial data:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '12px', border: '2px solid #22c55e' }}>
            <h4 style={{ color: '#166534', marginBottom: '12px', fontSize: '16px' }}>Option A: QuickBooks Import (Recommended)</h4>
            <ol style={{ marginLeft: '16px', color: '#166534', fontSize: '14px', lineHeight: '1.8' }}>
              <li>Go to the "Excel Import" tab</li>
              <li>Click "Import from QuickBooks"</li>
              <li>Select date range</li>
              <li>Click "Import"</li>
            </ol>
          </div>
          <div style={{ background: '#fef3c7', padding: '20px', borderRadius: '12px', border: '2px solid #f59e0b' }}>
            <h4 style={{ color: '#92400e', marginBottom: '12px', fontSize: '16px' }}>Option B: Excel Import</h4>
            <ol style={{ marginLeft: '16px', color: '#92400e', fontSize: '14px', lineHeight: '1.8' }}>
              <li>Go to the "Excel Import" tab</li>
              <li>Click "Choose File" or drag & drop</li>
              <li>Upload .xlsx or .xls file</li>
              <li>Review imported data</li>
            </ol>
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ color: '#1e293b', marginBottom: '8px' }}>Excel File Requirements:</h4>
          <ul style={{ marginLeft: '20px', color: '#475569', fontSize: '14px', lineHeight: '1.8' }}>
            <li>Trial Balance format with account names and monthly balances</li>
            <li>Account Name/Description and Account Number columns</li>
            <li>Monthly balance columns (e.g., Jan, Feb, Mar...)</li>
            <li><strong>36 months of data</strong> is ideal for comprehensive analysis</li>
          </ul>
        </div>
      </section>

      {/* Section 7: Mapping */}
      <section id="section-7" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          7. Mapping Accounts
        </h3>
        
        <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '20px' }}>
          <strong style={{ color: '#991b1b' }}>🎯 This is the most important step!</strong>
          <span style={{ color: '#991b1b' }}> Mapping tells Corelytics how to categorize each account for financial analysis.</span>
        </div>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Understanding the Mapping Interface
        </h4>
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          You'll see a list of all accounts from the import with:
        </p>
        <ul style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li><strong>Source Account Name</strong> - The account name from QuickBooks/Excel</li>
          <li><strong>Suggested Mapping</strong> - AI-suggested category (if available)</li>
          <li><strong>Target Category</strong> - Dropdown to select the correct category</li>
        </ul>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Account Categories
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
          <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px' }}>
            <h5 style={{ color: '#166534', marginBottom: '8px', fontSize: '14px' }}>Assets</h5>
            <ul style={{ fontSize: '12px', color: '#166534', marginLeft: '16px' }}>
              <li>Cash & Cash Equivalents</li>
              <li>Accounts Receivable</li>
              <li>Inventory</li>
              <li>Fixed Assets</li>
            </ul>
          </div>
          <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px' }}>
            <h5 style={{ color: '#991b1b', marginBottom: '8px', fontSize: '14px' }}>Liabilities</h5>
            <ul style={{ fontSize: '12px', color: '#991b1b', marginLeft: '16px' }}>
              <li>Accounts Payable</li>
              <li>Accrued Expenses</li>
              <li>Short-term Debt</li>
              <li>Long-term Debt</li>
            </ul>
          </div>
          <div style={{ background: '#ede9fe', padding: '16px', borderRadius: '8px' }}>
            <h5 style={{ color: '#5b21b6', marginBottom: '8px', fontSize: '14px' }}>Revenue & Expenses</h5>
            <ul style={{ fontSize: '12px', color: '#5b21b6', marginLeft: '16px' }}>
              <li>Sales Revenue</li>
              <li>Cost of Goods Sold</li>
              <li>Operating Expenses</li>
              <li>Interest Expense</li>
            </ul>
          </div>
        </div>

        <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
          Using AI-Assisted Mapping
        </h4>
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Corelytics includes AI-powered mapping suggestions to help speed up the mapping process.
        </p>

        <div style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6', padding: '16px', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ color: '#1e40af' }}>💾 Don't forget:</strong>
          <span style={{ color: '#1e40af' }}> Click "Save Mappings" when done. Mappings are saved per company and will be remembered for future imports.</span>
        </div>
      </section>

      {/* Section 8: Processing Data */}
      <section id="section-8" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          8. Processing Monthly Data
        </h3>
        
        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Go to the <strong>"Data Review"</strong> tab to verify the data looks correct</li>
          <li>Return to <strong>"Account Mapping"</strong> tab</li>
          <li>Click <strong>"⚙️ Process & Save Monthly Data"</strong></li>
          <li>Wait for processing to complete</li>
          <li>Navigate to any analysis section to verify data is displaying correctly</li>
        </ol>
      </section>

      {/* Section 9: Analyzing Reports */}
      <section id="section-9" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          9. Analyzing Financial Reports
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Now the fun part! Explore the financial analysis tools:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>📈 Financial Ratios</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Liquidity Ratios (Current, Quick)</li>
              <li>Profitability Ratios (Margins, ROA, ROE)</li>
              <li>Efficiency Ratios (Turnover)</li>
              <li>Leverage Ratios (Debt-to-Equity)</li>
            </ul>
          </div>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>💰 Working Capital</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Cash conversion cycle</li>
              <li>Days sales outstanding (DSO)</li>
              <li>Days inventory outstanding (DIO)</li>
              <li>Days payables outstanding (DPO)</li>
            </ul>
          </div>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>📊 Projections</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Revenue forecasting</li>
              <li>Expense projections</li>
              <li>Growth scenarios</li>
              <li>Future performance estimates</li>
            </ul>
          </div>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>📝 MD&A</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Management Discussion & Analysis</li>
              <li>Performance commentary</li>
              <li>Key insights and observations</li>
              <li>Strategic recommendations</li>
            </ul>
          </div>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>💵 Cash Flow Analysis</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Operating cash flow</li>
              <li>Investing activities</li>
              <li>Financing activities</li>
              <li>Cash flow trends</li>
            </ul>
          </div>
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h5 style={{ color: '#667eea', marginBottom: '12px' }}>🎯 Financial Score</h5>
            <ul style={{ fontSize: '14px', color: '#475569', marginLeft: '16px', lineHeight: '1.8' }}>
              <li>Overall health score (0-100)</li>
              <li>Breakdown by category</li>
              <li>Historical trend</li>
              <li>Peer comparison</li>
            </ul>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '16px', borderRadius: '0 8px 8px 0' }}>
          <strong style={{ color: '#166534' }}>📊 Color-coded indicators:</strong>
          <span style={{ color: '#166534' }}> Green = Good, Yellow = Caution, Red = Concern. Each ratio includes industry benchmark comparisons.</span>
        </div>
      </section>

      {/* Section 10: Team Management */}
      <section id="section-10" style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #667eea', paddingBottom: '12px' }}>
          10. Managing Your Team
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          As your practice grows, add team members to help manage clients:
        </p>

        <ol style={{ marginLeft: '24px', marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          <li>Go to <strong>"Team Management"</strong> tab</li>
          <li>Click <strong>"+ Add Team Member"</strong></li>
          <li>Enter their name, email, phone, and password</li>
          <li>Click <strong>"Add"</strong></li>
        </ol>

        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Team members can view companies, import data, map accounts, and generate reports. They cannot delete companies or manage billing.
        </p>
      </section>

      {/* Quick Reference Checklist */}
      <section style={{ marginBottom: '48px' }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', borderBottom: '3px solid #22c55e', paddingBottom: '12px' }}>
          ✅ Quick Reference Checklist
        </h3>
        
        <p style={{ marginBottom: '20px', lineHeight: '1.8', color: '#475569' }}>
          Use this checklist for each new client:
        </p>

        <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          {[
            'Create company in Corelytics',
            'Set industry sector correctly',
            'Create primary contact login',
            'Connect QuickBooks OR import Excel data',
            'Map all accounts to correct categories',
            'Process monthly data',
            'Review Financial Ratios',
            'Check Working Capital analysis',
            'Generate Financial Score',
            'Share reports with client',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: i < 9 ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ width: '24px', height: '24px', border: '2px solid #667eea', borderRadius: '4px', flexShrink: 0 }}></div>
              <span style={{ color: '#475569' }}>{item}</span>
            </div>
          ))}
        </div>
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

// Contact Support Content Component
function ContactSupportContent() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', textAlign: 'center' }}>
        💬 Contact Support
      </h2>
      
      <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '32px', textAlign: 'center' }}>
        Need help? We're here for you! Reach out to our support team.
      </p>

      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
        borderRadius: '12px', 
        padding: '40px',
        color: 'white',
        textAlign: 'center',
        marginBottom: '32px'
      }}>
        <h3 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '16px' }}>
          📧 Email Support
        </h3>
        <p style={{ fontSize: '16px', marginBottom: '24px', opacity: 0.9 }}>
          Send us an email and we'll get back to you as soon as possible
        </p>
        <a
          href="mailto:support@corelytics.com"
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            background: 'white',
            color: '#667eea',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '16px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          support@corelytics.com
        </a>
      </div>

      <div style={{ 
        background: '#f0fdf4', 
        borderLeft: '4px solid #22c55e', 
        padding: '20px', 
        borderRadius: '0 8px 8px 0'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#166534', marginBottom: '12px' }}>
          📚 Before You Contact Us
        </h4>
        <ul style={{ marginLeft: '20px', color: '#166534', fontSize: '14px', lineHeight: '1.8' }}>
          <li>Check the Getting Started guide for common questions</li>
          <li>Make sure you've reviewed the relevant documentation</li>
          <li>Have your account information ready when contacting support</li>
          <li>Include screenshots if you're reporting an issue</li>
        </ul>
      </div>

      <div style={{ 
        marginTop: '40px', 
        padding: '24px',
        background: '#fef3c7',
        borderRadius: '12px',
        border: '1px solid #fbbf24'
      }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '12px' }}>
          🚀 Feature Requests
        </h4>
        <p style={{ fontSize: '14px', color: '#92400e', lineHeight: '1.8' }}>
          Have an idea for a new feature or improvement? We'd love to hear it! Send your suggestions to the support email above with "Feature Request" in the subject line.
        </p>
      </div>
    </div>
  );
}

