# Frontend Migration Plan - localStorage → API

## Overview
Migrating the 5000-line `app/page.tsx` from localStorage to API-based architecture while maintaining all functionality.

---

## Current State Analysis

### Data Currently in localStorage:
1. `fs_consultants` - Consultant list
2. `fs_companies` - Companies list
3. `fs_users` - Users list
4. `fs_currentUser` - Current session
5. `fs_financialDataRecords` - Financial data
6. `fs_selectedCompanyId` - Selected company
7. `fs_projectionDefaults` - Projection settings
8. `fs_assessmentResponses` - Current assessment
9. `fs_assessmentNotes` - Assessment notes
10. `fs_assessmentRecords` - Completed assessments
11. `fs_companyProfiles` - Company profiles

### Functions to Update:
- `handleLogin()` → Use `/api/auth/login`
- `handleRegisterConsultant()` → Use `/api/auth/register`
- `addCompany()` → Use `/api/companies POST`
- `deleteCompany()` → Use `/api/companies DELETE`
- `addUser()` → Use `/api/users POST`
- `deleteUser()` → Use `/api/users DELETE`
- `addConsultant()` → Use `/api/consultants POST`
- `deleteConsultant()` → Use `/api/consultants DELETE`
- `handleFile()` → Use `/api/financials POST`
- Save assessment → Use `/api/assessments POST`
- Save profile → Use `/api/profiles POST`

---

## Migration Strategy

### Phase 1: Add Loading States
```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [loadingCompanies, setLoadingCompanies] = useState(false);
const [loadingUsers, setLoadingUsers] = useState(false);
// ... etc
```

### Phase 2: Replace Authentication
- Remove localStorage for currentUser
- Use API for login/register
- Store session token (NextAuth handles this)
- Fetch user data on mount

### Phase 3: Replace Company Management
- Load companies from API on mount
- Create/delete via API calls
- Remove localStorage sync

### Phase 4: Replace User Management
- Load users from API
- Create/delete via API
- Update assessment user limit check

### Phase 5: Replace Financial Data
- Upload via API (store in DB, not localStorage)
- Load monthly data from API
- Remove rawRows/mapping from state (load from API)

### Phase 6: Replace Assessment Data
- Save responses to API
- Load assessment records from API
- Remove localStorage sync

### Phase 7: Replace Company Profiles
- Load/save via API
- Remove localStorage sync

---

## Implementation Approach

### Option 1: Big Bang (Risky)
Replace everything at once, test thoroughly.

### Option 2: Incremental (Safer) ✅ RECOMMENDED
1. Auth first (login/register)
2. Then companies
3. Then users
4. Then financial data
5. Then assessments
6. Then profiles
7. Test each step

### Option 3: Parallel (Hybrid)
Keep localStorage as backup, try API first, fallback if error.

**We'll use Option 2: Incremental**

---

## Code Changes Required

### 1. Add API Client Import
```typescript
import { authApi, companiesApi, usersApi, /* ... */ } from '@/lib/api-client';
```

### 2. Add Loading States
```typescript
const [isLoading, setIsLoading] = useState(false);
const [apiError, setApiError] = useState<string | null>(null);
```

### 3. Update useEffect Hooks
Remove localStorage loading, add API data fetching:
```typescript
useEffect(() => {
  const loadData = async () => {
    if (currentUser) {
      const { companies } = await companiesApi.getAll(currentUser.consultantId);
      setCompanies(companies);
    }
  };
  loadData();
}, [currentUser]);
```

### 4. Update CRUD Functions
Example for addCompany:
```typescript
const addCompany = async () => {
  if (!newCompanyName || !currentUser) return;
  setIsLoading(true);
  try {
    const { company } = await companiesApi.create({
      name: newCompanyName,
      consultantId: currentUser.consultantId!
    });
    setCompanies([...companies, company]);
    setNewCompanyName('');
  } catch (error) {
    setApiError(error.message);
  } finally {
    setIsLoading(false);
  }
};
```

### 5. Remove localStorage useEffect Hooks
Delete all the `useEffect(() => { localStorage.setItem(...) }, [deps])` calls.

---

## Testing Checklist

After each phase, test:
- [ ] Feature works as before
- [ ] Data persists in database
- [ ] Errors handled gracefully
- [ ] Loading states display
- [ ] No console errors

---

## Rollback Plan

If issues arise:
- Keep backup of current `page.tsx`
- Git allows easy revert
- Can pause and resume anytime

---

**Starting with Authentication...**


