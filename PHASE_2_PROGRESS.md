# Phase 2: Extract View Components

## Phase 2.1: Login/Registration View ✅ COMPLETED

**Date:** Current session
**Status:** Ready for testing

### Changes Made:

1. **Created:** `app/components/auth/LoginView.tsx`
   - Extracted complete login/registration/forgot-password view
   - 340 lines of React component code
   - Includes:
     - Login form with email/password
     - Consultant registration form with company details
     - Forgot password flow
     - Password visibility toggle
     - Form validation and error handling
   
2. **Modified:** `app/page.tsx`
   - Added import: `import LoginView from './components/auth/LoginView';`
   - Replaced ~286 lines of JSX with `<LoginView />` component
   - Passes 22 props (state variables and handlers)
   - Clean integration with existing handlers

### File Size Impact:
- **Before:** ~25,195 lines
- **After:** ~24,956 lines
- **Reduction:** ~239 lines

### Component Structure:
```typescript
<LoginView
  // Email & Password
  loginEmail={...} setLoginEmail={...}
  loginPassword={...} setLoginPassword={...}
  
  // Registration Fields
  loginName={...} setLoginName={...}
  loginPhone={...} setLoginPhone={...}
  loginCompanyName={...} setLoginCompanyName={...}
  loginCompanyAddress1={...} setLoginCompanyAddress1={...}
  // ... more address fields
  
  // UI State
  isRegistering={...} setIsRegistering={...}
  loginError={...} setLoginError={...}
  showPassword={...} setShowPassword={...}
  showForgotPassword={...} setShowForgotPassword={...}
  
  // Handlers
  handleLogin={handleLogin}
  handleRegisterConsultant={handleRegisterConsultant}
/>
```

### Testing Status:
- ✅ No linter errors
- ✅ Dev server restarted
- ⏳ Awaiting user testing

### Test Checklist:
- [ ] Login form displays correctly
- [ ] Can log in with existing credentials
- [ ] Registration form works
- [ ] Forgot password flow functions
- [ ] Password visibility toggle works
- [ ] Form validation shows errors

---

## Phase 2.2: Extract Chart Components ✅ COMPLETED

**Date:** Current session
**Status:** Ready for testing

### Changes Made:

1. **Created:** `app/components/charts/Charts.tsx`
   - Extracted 2 chart components (458 total lines)
   - Components:
     - `LineChart`: Primary trend visualization for KPIs
       - Configurable axis ranges, colors, formatters
       - Supports goal lines and industry benchmarks
       - Quarterly table display option
       - 362 lines
     - `ProjectionChart`: Financial projections with scenarios
       - Historical vs projected data visualization
       - Best/Most Likely/Worst case scenarios
       - 6-month projection table
       - 179 lines
   
2. **Modified:** `app/page.tsx`
   - Added import: `import { LineChart, ProjectionChart } from './components/charts/Charts';`
   - Removed lines 330-875 (both chart component definitions)
   - Charts now imported and used throughout the app

### File Size Impact:
- **Before:** ~24,956 lines
- **After:** ~24,410 lines
- **Reduction:** ~546 lines

### Dependencies:
- Both charts import `sum` function from `app/utils/financial`
- Pure presentation components - no state management

### Testing Status:
- ✅ No linter errors
- ⏳ Dev server restart needed
- ⏳ Awaiting user testing

### Test Checklist:
- [ ] LineChart displays in consultant dashboard
- [ ] LineChart displays in financial statements
- [ ] ProjectionChart displays correctly
- [ ] Goal lines and benchmarks render
- [ ] Charts are responsive

---

## Phase 2.3: Extract Modal Components ✅ COMPLETED

**Date:** Current session
**Status:** Ready for testing

### Changes Made:

1. **Created:** `app/components/modals/CompanyDetailsModal.tsx`
   - Company address editing modal (135 lines)
   - Features:
     - Street address, city, state, ZIP, country inputs
     - US state selector (using US_STATES constant)
     - Industry sector dropdown with grouped NAICS codes
     - Selected industry description preview
     - Save/Cancel buttons
   
2. **Modified:** `app/page.tsx`
   - Added import: `import CompanyDetailsModal from './components/modals/CompanyDetailsModal';`
   - Replaced lines 8776-8911 (136 lines of modal JSX) with `<CompanyDetailsModal />` component
   - Passes 16 props (address fields, industry sector, handlers)

### File Size Impact:
- **Before:** ~24,410 lines
- **After:** ~24,290 lines
- **Reduction:** ~120 lines

### Component Props:
- `show`, `onClose`
- Address: `companyAddressStreet`, `companyAddressCity`, `companyAddressState`, `companyAddressZip`, `companyAddressCountry`
- Industry: `companyIndustrySector`
- Handlers: `onSave`

### Dependencies:
- Imports `INDUSTRY_SECTORS`, `SECTOR_CATEGORIES` from industry data
- Imports `US_STATES` from constants

### Testing Status:
- ✅ No linter errors
- ⏳ Dev server restart needed
- ⏳ Awaiting user testing

### Test Checklist:
- [ ] Modal opens when clicking "Edit Details" in Company Management
- [ ] Address fields can be edited
- [ ] State dropdown populated with all US states
- [ ] Industry selector shows grouped NAICS codes
- [ ] Save button updates company details
- [ ] Cancel button closes modal without saving

---

## Phase 2.4: Extract Utility Functions & Constants ✅ COMPLETED

**Date:** Current session
**Status:** Ready for testing

### Changes Made:

1. **Created:** `app/utils/scoring.ts`
   - Revenue growth scoring functions (33 lines)
   - `clamp`, `revenueGrowthScore_24mo`, `rgsAdjustmentFrom6mo`
   
2. **Created:** `app/utils/data-processing.ts`
   - Data transformation utilities (114 lines)
   - `getBenchmarkValue`, `sixMonthGrowthFromMonthly`, `normalizeRows`, `ltmVsPrior`
   
3. **Created:** `app/utils/excel-export.ts`
   - Excel export functions (72 lines)
   - `exportDataReviewToExcel`, `exportMonthlyRatiosToExcel`
   
4. **Created:** `app/constants/kpi-formulas.ts`
   - KPI formula definitions (103 lines)
   - Comprehensive formulas for all 20 KPIs with descriptions

5. **Modified:** `app/page.tsx`
   - Added imports from new utility files
   - Removed lines 29-333 (305 lines of function definitions and constants)
   - Now imports: scoring, data-processing, excel-export, kpi-formulas

### File Size Impact:
- **Before:** ~24,290 lines
- **After:** ~23,990 lines  
- **Reduction:** ~300 lines

### Files Created in Phase 2.4:
- 4 new utility/constant files
- Total: 322 lines across new files (cleaner than inline)

### Testing Status:
- ✅ No linter errors
- ⏳ Dev server restart needed
- ⏳ Awaiting user testing

### Test Checklist:
- [ ] Financial scoring calculations work
- [ ] Benchmark lookups function correctly
- [ ] Data normalization processes properly
- [ ] Excel exports generate files
- [ ] KPI formulas display in modals

---

## Phase 2.5: Next Steps (PENDING)

