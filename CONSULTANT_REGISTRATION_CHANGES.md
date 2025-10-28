# Consultant Registration Form - Add Company Fields

## Summary
Adding company name, company address, company website, and phone number fields to the consultant registration form. All fields are required except company website.

## Changes Required

### 1. Update Consultant Interface (page.tsx line ~202-210)
```typescript
interface Consultant {
  id: string;
  type: string;
  fullName: string;
  address: string;
  email: string;
  phone: string;
  password: string;
  // NEW FIELDS TO ADD:
  companyName?: string;
  companyAddress?: string;
  companyWebsite?: string;
}
```

### 2. Add State Variables (page.tsx around line 1088-1096)
After the existing consultant state variables, add:
```typescript
  const [newConsultantCompanyName, setNewConsultantCompanyName] = useState('');
  const [newConsultantCompanyAddress, setNewConsultantCompanyAddress] = useState('');
  const [newConsultantCompanyWebsite, setNewConsultantCompanyWebsite] = useState('');
```

Also add state for registration form (around line 1080):
```typescript
  const [loginCompanyName, setLoginCompanyName] = useState('');
  const [loginCompanyAddress, setLoginCompanyAddress] = useState('');
  const [loginCompanyWebsite, setLoginCompanyWebsite] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
```

### 3. Update Registration Form (page.tsx lines 3666-3710)
Replace the existing registration form section with:
```typescript
<form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleRegisterConsultant(); }}>
  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Register as Consultant</h2>
  
  <input 
    type="text" 
    name={`fullname_${Date.now()}`}
    placeholder="Full Name *" 
    value={loginName} 
    onChange={(e) => setLoginName(e.target.value)} 
    autoComplete="off" 
    required
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  <input 
    type="text" 
    name={`email_${Date.now()}`}
    placeholder="Email *" 
    value={loginEmail} 
    onChange={(e) => setLoginEmail(e.target.value)} 
    autoComplete="off" 
    required
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  <input 
    type="tel" 
    name={`phone_${Date.now()}`}
    placeholder="Phone Number *" 
    value={loginPhone} 
    onChange={(e) => setLoginPhone(e.target.value)} 
    autoComplete="off" 
    required
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  <input 
    type="text" 
    name={`company_name_${Date.now()}`}
    placeholder="Company Name *" 
    value={loginCompanyName} 
    onChange={(e) => setLoginCompanyName(e.target.value)} 
    autoComplete="off" 
    required
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  <input 
    type="text" 
    name={`company_address_${Date.now()}`}
    placeholder="Company Address *" 
    value={loginCompanyAddress} 
    onChange={(e) => setLoginCompanyAddress(e.target.value)} 
    autoComplete="off" 
    required
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  <input 
    type="url" 
    name={`company_website_${Date.now()}`}
    placeholder="Company Website (Optional)" 
    value={loginCompanyWebsite} 
    onChange={(e) => setLoginCompanyWebsite(e.target.value)} 
    autoComplete="off" 
    style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
  />
  
  {/* Password field with toggle */}
  <div style={{ position: 'relative', marginBottom: '12px' }}>
    <input 
      type={showPassword ? "text" : "password"} 
      name={`password_${Date.now()}`}
      placeholder="Password *" 
      value={loginPassword} 
      onChange={(e) => setLoginPassword(e.target.value)} 
      autoComplete="new-password"
      required
      style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} 
    />
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b', padding: '4px' }}
      title={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? '👁️' : '👁️‍🗨️'}
    </button>
  </div>
  
  <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '14px', background: isLoading ? '#94a3b8' : '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', marginBottom: '12px', opacity: isLoading ? 0.7 : 1 }}>
    {isLoading ? 'Registering...' : 'Register'}
  </button>
  <button type="button" onClick={() => { setIsRegistering(false); setLoginError(''); setShowPassword(false); }} disabled={isLoading} style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>Back to Login</button>
</form>
```

### 4. Update handleRegisterConsultant Function (page.tsx lines 2306-2352)
```typescript
const handleRegisterConsultant = async () => {
  setLoginError('');
  setIsLoading(true);
  
  // Validate required fields
  if (!loginName || !loginEmail || !loginPassword || !loginPhone || !loginCompanyName || !loginCompanyAddress) { 
    setLoginError('Please fill in all required fields');
    setIsLoading(false);
    return; 
  }
  
  try {
    const { user } = await authApi.register({
      name: loginName,
      email: loginEmail,
      password: loginPassword,
      fullName: loginName,
      phone: loginPhone,
      companyName: loginCompanyName,
      companyAddress: loginCompanyAddress,
      companyWebsite: loginCompanyWebsite || undefined
    });
    
    // Normalize role and userType to lowercase for frontend compatibility
    const normalizedUser = {
      ...user,
      role: user.role.toLowerCase(),
      userType: user.userType?.toLowerCase()
    };
    
    setCurrentUser(normalizedUser);
    setIsLoggedIn(true);
    setCurrentView('admin');
    
    // Clear all form fields
    setLoginName('');
    setLoginEmail('');
    setLoginPassword('');
    setLoginPhone('');
    setLoginCompanyName('');
    setLoginCompanyAddress('');
    setLoginCompanyWebsite('');
    setIsRegistering(false);
    setLoginError('');
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        setLoginError('This email is already registered. Please login instead.');
      } else {
        setLoginError(error.message);
      }
    } else {
      setLoginError('Registration failed. Please try again.');
    }
  } finally {
    setIsLoading(false);
  }
};
```

### 5. Update authApi.register in API Client (lib/api-client.ts lines 45-58)
```typescript
async register(data: {
  name: string;
  email: string;
  password: string;
  fullName?: string;
  address?: string;
  phone?: string;
  type?: string;
  companyName?: string;
  companyAddress?: string;
  companyWebsite?: string;
}) {
  return fetchApi('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
},
```

### 6. Update Site Admin Display (page.tsx around lines 4846-4935)
In the expanded consultant details section, add the new fields after phone:
```typescript
{/* Display Mode */}
<div style={{ fontSize: '11px', color: '#475569', marginTop: '6px' }}>
  <div><strong>Email:</strong> {consultant.email}</div>
  <div><strong>Phone:</strong> {consultant.phone || 'N/A'}</div>
  <div><strong>Address:</strong> {consultant.address || 'N/A'}</div>
  <div><strong>Type:</strong> {consultant.type || 'N/A'}</div>
  <div><strong>Company Name:</strong> {consultant.companyName || 'N/A'}</div>
  <div><strong>Company Address:</strong> {consultant.companyAddress || 'N/A'}</div>
  <div><strong>Company Website:</strong> {consultant.companyWebsite ? <a href={consultant.companyWebsite} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'underline' }}>{consultant.companyWebsite}</a> : 'N/A'}</div>
</div>
```

And in the edit mode section, add input fields for the new fields.

### 7. Update Backend API Route (app/api/auth/register/route.ts)
The backend needs to accept and store these new fields. Make sure the Prisma schema includes these fields on the User model or related Consultant model.

### 8. Update Prisma Schema (if needed)
Add to the User or Consultant model:
```prisma
model User {
  // ... existing fields ...
  companyName     String?
  companyAddress  String?
  companyWebsite  String?
}
```

Then run:
```bash
npx prisma generate
npx prisma db push
```

## Testing Checklist
- [ ] New consultant can register with all required fields
- [ ] Company website (optional) can be left blank
- [ ] Form validation prevents submission without required fields
- [ ] Site admin page displays all new fields
- [ ] Data persists correctly in database
- [ ] Edit functionality works for new fields in site admin


