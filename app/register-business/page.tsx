'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function RegisterBusinessWelcome() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Affiliate state
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState('');
  const [affiliateCode, setAffiliateCode] = useState('');
  const [validatedAffiliate, setValidatedAffiliate] = useState<any>(null);
  const [codeError, setCodeError] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);

  // Fetch affiliates on mount
  useEffect(() => {
    const fetchAffiliates = async () => {
      try {
        const response = await fetch('/api/affiliates');
        const data = await response.json();
        if (data.affiliates) {
          // Only show active affiliates
          setAffiliates(data.affiliates.filter((a: any) => a.isActive));
        }
      } catch (error) {
        console.error('Error fetching affiliates:', error);
      }
    };
    fetchAffiliates();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  // Validate affiliate code
  const validateAffiliateCode = async () => {
    if (!selectedAffiliateId || !affiliateCode) {
      setCodeError('');
      setValidatedAffiliate(null);
      return;
    }

    setIsValidatingCode(true);
    setCodeError('');

    try {
      const response = await fetch('/api/affiliates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliateId: selectedAffiliateId,
          affiliateCode: affiliateCode
        })
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        setValidatedAffiliate(data);
        setCodeError('');
      } else {
        setCodeError(data.error || 'Invalid code');
        setValidatedAffiliate(null);
      }
    } catch (error) {
      console.error('Error validating code:', error);
      setCodeError('Error validating code');
      setValidatedAffiliate(null);
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.password) {
      setError('All fields are required');
      return;
    }

    // Password validation is now handled by the backend
    // The backend will return detailed error messages for password requirements

    // If affiliate is selected, code must be validated
    if (selectedAffiliateId && !validatedAffiliate) {
      setError('Please enter and validate your affiliate code');
      return;
    }

    setIsNavigating(true);
    setError('');

    try {
      const registrationData: any = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        fullName: formData.name,
        type: 'business'
      };

      // Include affiliate data if validated
      if (validatedAffiliate && selectedAffiliateId) {
        registrationData.affiliateId = selectedAffiliateId;
        registrationData.affiliateCode = affiliateCode.toUpperCase();
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error && data.error.includes('Password does not meet requirements')) {
          setError('Password does not meet requirements:\n• At least 8 characters\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (!@#$%^&*)');
        } else {
          setError(data.error || 'Registration failed');
        }
        setIsNavigating(false);
        return;
      }

      // Sign in the user after successful registration
      const signInResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password
        })
      });

      if (signInResponse.ok) {
        const loginData = await signInResponse.json();
        // Clear any existing session storage
        sessionStorage.clear();
        // Store user data in sessionStorage for immediate access after redirect
        sessionStorage.setItem('pendingLogin', JSON.stringify({
          user: loginData.user,
          timestamp: Date.now()
        }));
        // Force logout of any existing session and redirect to main page
        await fetch('/api/auth/logout', { method: 'POST' });
        // Redirect to main page (which will show the new Business Dashboard)
        window.location.href = '/';
      } else {
        setError('Registration successful! Please sign in.');
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('An error occurred. Please try again.');
      setIsNavigating(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '40px',
          textAlign: 'center',
          color: 'white'
        }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>
            Welcome to Corelytics
          </h1>
        </div>

        {/* Content */}
        <div style={{ padding: '40px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: '600', 
              color: '#1e293b', 
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Register Your Business
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: '#64748b', 
              lineHeight: '1.6',
              textAlign: 'center',
              marginBottom: '32px'
            }}>
              Get comprehensive financial insights and health scores for your business
            </p>
          </div>

          {/* Registration Form */}
          <div style={{
            background: '#f0fdf4',
            border: '2px solid #86efac',
            borderRadius: '12px',
            padding: '32px',
            marginBottom: '32px'
          }}>
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              {/* Name Field */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1e293b',
                  marginBottom: '8px'
                }}>
                  Business Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter your business name"
                  disabled={isNavigating}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Email Field */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1e293b',
                  marginBottom: '8px'
                }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  disabled={isNavigating}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Password Field */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1e293b',
                  marginBottom: '8px'
                }}>
                  Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Create a secure password"
                    disabled={isNavigating}
                    autoComplete="new-password"
                    style={{
                      width: '100%',
                      padding: '12px',
                      paddingRight: '45px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '18px'
                    }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#64748b', 
                  marginTop: '6px', 
                  lineHeight: '1.5' 
                }}>
                  Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
                </div>
              </div>

              {/* Affiliate Selection (Optional) */}
              {affiliates.length > 0 && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '16px', 
                  background: '#fffbeb', 
                  border: '2px solid #fbbf24', 
                  borderRadius: '8px' 
                }}>
                  <h3 style={{ 
                    fontSize: '14px', 
                    fontWeight: '600', 
                    color: '#92400e', 
                    marginBottom: '12px' 
                  }}>
                    Have an Affiliate Code? (Optional)
                  </h3>
                  
                  {/* Affiliate Dropdown */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#78350f',
                      marginBottom: '6px'
                    }}>
                      Select Affiliate Partner
                    </label>
                    <select
                      value={selectedAffiliateId}
                      onChange={(e) => {
                        setSelectedAffiliateId(e.target.value);
                        setAffiliateCode('');
                        setValidatedAffiliate(null);
                        setCodeError('');
                      }}
                      disabled={isNavigating}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d97706',
                        borderRadius: '6px',
                        fontSize: '13px',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- No Affiliate Code --</option>
                      {affiliates.map((affiliate) => (
                        <option key={affiliate.id} value={affiliate.id}>
                          {affiliate.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Affiliate Code Input */}
                  {selectedAffiliateId && (
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#78350f',
                        marginBottom: '6px'
                      }}>
                        Enter Affiliate Code
                      </label>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={affiliateCode}
                          onChange={(e) => {
                            setAffiliateCode(e.target.value.toUpperCase());
                            setValidatedAffiliate(null);
                            setCodeError('');
                          }}
                          placeholder="Enter code"
                          disabled={isNavigating || isValidatingCode}
                          style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #d97706',
                            borderRadius: '6px',
                            fontSize: '13px',
                            textTransform: 'uppercase'
                          }}
                        />
                        <button
                          type="button"
                          onClick={validateAffiliateCode}
                          disabled={!affiliateCode || isValidatingCode || isNavigating}
                          style={{
                            padding: '10px 16px',
                            background: (!affiliateCode || isValidatingCode) ? '#d1d5db' : '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: (!affiliateCode || isValidatingCode) ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isValidatingCode ? 'Checking...' : 'Validate'}
                        </button>
                      </div>

                      {/* Validation Messages */}
                      {codeError && (
                        <div style={{
                          padding: '8px 12px',
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          color: '#991b1b',
                          fontSize: '12px',
                          marginTop: '8px'
                        }}>
                          ❌ {codeError}
                        </div>
                      )}

                      {validatedAffiliate && (
                        <div style={{
                          padding: '12px',
                          background: '#d1fae5',
                          border: '1px solid #6ee7b7',
                          borderRadius: '6px',
                          marginTop: '8px'
                        }}>
                          <div style={{ color: '#065f46', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                            ✅ Valid Code! Special Pricing Applied:
                          </div>
                          <div style={{ color: '#047857', fontSize: '12px' }}>
                            <div>Monthly: ${validatedAffiliate.monthlyPrice}/month</div>
                            <div>Quarterly: ${validatedAffiliate.quarterlyPrice}/quarter</div>
                            <div>Annual: ${validatedAffiliate.annualPrice}/year</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={isNavigating}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: isNavigating ? '#94a3b8' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isNavigating ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
                }}
                onMouseEnter={(e) => {
                  if (!isNavigating) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
              >
                {isNavigating ? 'Creating Account...' : 'Create Account & Access Dashboard'}
              </button>
            </form>
          </div>

          {/* Features Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '20px',
            marginBottom: '32px'
          }}>
            {/* Feature 1 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                📊
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                Financial Analysis
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Comprehensive P&L and Balance Sheet analysis with trend tracking
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                🎯
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                Health Score
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Get a clear financial health score with actionable insights
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                🔗
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                Accounting System Integration
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Seamlessly sync your financial data from QuickBooks, Sage, Microsoft Dynamics 365, or NetSuite
              </p>
            </div>

            {/* Feature 4 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                📈
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                Benchmarking
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Compare your metrics against industry benchmarks
              </p>
            </div>

            {/* Feature 5 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                📋
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                MD&A Reports
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Management Discussion & Analysis with AI-powered insights
              </p>
            </div>

            {/* Feature 6 */}
            <div style={{
              padding: '24px',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                💼
              </div>
              <h3 style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1e293b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                Professional Reports
              </h3>
              <p style={{ 
                fontSize: '14px', 
                color: '#64748b',
                lineHeight: '1.5',
                margin: 0,
                textAlign: 'center'
              }}>
                Generate print-ready reports and custom packages
              </p>
            </div>
          </div>

          {/* Back Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              onClick={handleBackToLogin}
              style={{
                width: '100%',
                padding: '12px',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              ← Back to Login
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px',
          background: '#f8fafc',
          textAlign: 'center',
          borderTop: '1px solid #e2e8f0'
        }}>
          <p style={{ 
            fontSize: '13px', 
            color: '#94a3b8',
            margin: 0
          }}>
            Already have an account? <a href="/" style={{ color: '#667eea', textDecoration: 'none', fontWeight: '600' }}>Sign In</a>
          </p>
        </div>
      </div>
    </div>
  );
}
