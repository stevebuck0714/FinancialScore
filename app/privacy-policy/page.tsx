'use client';

export default function PrivacyPolicyPage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 20px'
    }}>
      <div style={{ 
        maxWidth: '900px', 
        margin: '0 auto', 
        background: 'white', 
        borderRadius: '12px', 
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '40px'
      }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '700', 
          color: '#1e293b', 
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          Privacy Policy
        </h1>
        
        <div style={{ 
          lineHeight: '1.8', 
          color: '#475569',
          fontSize: '16px'
        }}>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
            <strong>Effective Date:</strong> November 11, 2025
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            1. Introduction
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Corelytics ("we," "us," "our") values your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website dashboard.corelytics.com or other sub domain websites of Corelytics.com and purchase products or services from us. Please read this policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            2. Information We Collect
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We may collect information about you in a variety of ways. The information we may collect on the site includes:
          </p>
          <ul style={{ marginLeft: '24px', marginBottom: '16px' }}>
            <li style={{ marginBottom: '12px' }}>
              <strong>Personal Data:</strong>
              <ul style={{ marginLeft: '24px', marginTop: '8px' }}>
                <li>Name</li>
                <li>Email address</li>
                <li>Mailing address</li>
                <li>Phone number</li>
                <li>Payment information</li>
                <li>Other personal information you provide to us when you register, make a purchase, or communicate with us.</li>
              </ul>
            </li>
            <li style={{ marginBottom: '12px' }}>
              <strong>Derivative Data:</strong>
              <ul style={{ marginLeft: '24px', marginTop: '8px' }}>
                <li>IP address</li>
                <li>Browser type and version</li>
                <li>Time zone setting</li>
                <li>Browser plug-in types and versions</li>
                <li>Operating system and platform</li>
              </ul>
            </li>
            <li style={{ marginBottom: '12px' }}>
              <strong>Financial Data:</strong>
              <ul style={{ marginLeft: '24px', marginTop: '8px' }}>
                <li>Payment method details (e.g., credit card number)</li>
                <li>Transaction details (e.g., purchase history)</li>
              </ul>
            </li>
          </ul>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            3. How We Use Your Information
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We use the information we collect in the following ways:
          </p>
          <ul style={{ marginLeft: '24px', marginBottom: '16px' }}>
            <li>To process transactions and fulfill orders.</li>
            <li>To send you administrative information, such as updates to our terms, conditions, and policies.</li>
            <li>To communicate with you about your account or orders.</li>
            <li>To personalize your experience on our site.</li>
            <li>To improve our website and customer service.</li>
            <li>To detect, prevent, and address technical issues.</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p style={{ marginBottom: '16px', fontStyle: 'italic' }}>
            We do not store your credit card information on our servers, all credit card information is stored at the payment processor.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            4. Disclosure of Your Information
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We may share information we have collected about you in certain situations. Your information may be disclosed as follows:
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>By Law or to Protect Rights:</strong> We may disclose your information where we believe it is necessary to respond to legal requests, protect the rights, property, or safety of us, our customers, or others.
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>Third-Party Service Providers:</strong> We may share your information with third-party vendors, service providers, contractors, or agents who perform services for us or on our behalf.
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong>Business Transfers:</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.
          </p>
          <p style={{ marginBottom: '16px' }}>
            <strong>Marketing Communications:</strong> With your consent, or with an opportunity for you to withdraw consent, we may share your information with third parties for marketing purposes.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            5. Security of Your Information
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            6. Your Rights
          </h2>
          <p style={{ marginBottom: '16px' }}>
            You have the following rights regarding your personal information:
          </p>
          <ul style={{ marginLeft: '24px', marginBottom: '16px' }}>
            <li style={{ marginBottom: '8px' }}><strong>Access:</strong> You have the right to request copies of your personal information.</li>
            <li style={{ marginBottom: '8px' }}><strong>Correction:</strong> You have the right to request that we correct any information you believe is inaccurate.</li>
            <li style={{ marginBottom: '8px' }}><strong>Deletion:</strong> You have the right to request that we delete your personal information under certain conditions.</li>
            <li style={{ marginBottom: '8px' }}><strong>Restrict Processing:</strong> You have the right to request that we restrict the processing of your personal information under certain conditions.</li>
            <li style={{ marginBottom: '8px' }}><strong>Object to Processing:</strong> You have the right to object to our processing of your personal information under certain conditions.</li>
            <li style={{ marginBottom: '8px' }}><strong>Data Portability:</strong> You have the right to request that we transfer the information that we have collected to another organization, or directly to you, under certain conditions.</li>
          </ul>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            7. Children&apos;s Privacy
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Our website does not address anyone under the age of 13. We do not knowingly collect personally identifiable information from children under 13. If we become aware that we have collected personal data from a child under age 13 without verification of parental consent, we take steps to remove that information from our servers.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            8. Changes to This Privacy Policy
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
          </p>

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '32px', marginBottom: '16px' }}>
            9. Contact Us
          </h2>
          <p style={{ marginBottom: '16px' }}>
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          <p style={{ marginBottom: '16px' }}>
            <strong>By email:</strong> <a href="mailto:support@corelytics.com" style={{ color: '#667eea', textDecoration: 'none' }}>support@corelytics.com</a>
          </p>
        </div>

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: '#667eea',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#5568d3'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#667eea'}
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

