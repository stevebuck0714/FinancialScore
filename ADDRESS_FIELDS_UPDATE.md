# Company Address Fields Update - Complete ✅

## Summary
Successfully updated the consultant registration form to use proper address fields with separate inputs for Address Line 1, Address Line 2, City, State (dropdown), and ZIP Code.

## Changes Implemented

### 1. Added US States Array (`app/page.tsx`)
- ✅ Added complete list of US states with codes
- Used for dropdown in both registration form and site admin edit mode

### 2. Updated Consultant Interface (`app/page.tsx`)
Replaced single `companyAddress` with:
- ✅ `companyAddress1?: string` (Address Line 1)
- ✅ `companyAddress2?: string` (Address Line 2 - Optional)
- ✅ `companyCity?: string` (City)
- ✅ `companyState?: string` (State Code)
- ✅ `companyZip?: string` (ZIP Code)
- ✅ `companyWebsite?: string` (Website - kept from before)

### 3. Updated State Variables (`app/page.tsx`)
Replaced `loginCompanyAddress` with:
- ✅ `loginCompanyAddress1`
- ✅ `loginCompanyAddress2`
- ✅ `loginCompanyCity`
- ✅ `loginCompanyState`
- ✅ `loginCompanyZip`

### 4. Updated Registration Form (`app/page.tsx`)
**Company Address Section:**
- ✅ Address Line 1 input (required)
- ✅ Address Line 2 input (optional)
- ✅ City, State (dropdown), ZIP in a 3-column grid
- ✅ State dropdown with all 50 US states
- ✅ ZIP code with maxLength of 10 characters
- ✅ Proper labels and placeholders

### 5. Updated Registration Validation (`handleRegisterConsultant`)
- ✅ Validates Address Line 1, City, State, and ZIP are filled
- ✅ Address Line 2 is optional
- ✅ Sends all separate fields to API
- ✅ Clears all fields after successful registration

### 6. Updated API Client (`lib/api-client.ts`)
**authApi.register():**
- ✅ Added `companyAddress1?: string`
- ✅ Added `companyAddress2?: string`
- ✅ Added `companyCity?: string`
- ✅ Added `companyState?: string`
- ✅ Added `companyZip?: string`

**consultantsApi.update():**
- ✅ Added all same address fields for editing

### 7. Updated Site Admin Display (`app/page.tsx`)
**View Mode:**
- ✅ Shows formatted address in single line:
  - "123 Main St, Suite 100, New York, NY 10001"
- ✅ Gracefully handles missing fields
- ✅ Shows "N/A" if no address provided

### 8. Updated Site Admin Edit Mode (`app/page.tsx`)
**Edit Form:**
- ✅ Separate input for Address Line 1
- ✅ Separate input for Address Line 2 (Optional)
- ✅ City, State dropdown, ZIP in a 3-column grid
- ✅ State dropdown shows state codes (e.g., "NY", "CA")
- ✅ All fields properly initialize from consultant data

## Field Requirements Summary

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| Full Name | Yes | text | |
| Email | Yes | email | |
| Phone Number | Yes | tel | |
| Company Name | Yes | text | |
| **Address Line 1** | **Yes** | **text** | **New** |
| **Address Line 2** | No | text | **New** - Optional |
| **City** | **Yes** | **text** | **New** |
| **State** | **Yes** | **dropdown** | **New** - US States |
| **ZIP Code** | **Yes** | **text** | **New** - Max 10 chars |
| Company Website | No | url | Optional |
| Password | Yes | password | |

## Display Format

### Registration Form
```
Company Address
[Address Line 1 *]
[Address Line 2 (Optional)]
[City *]  [State ▼]  [ZIP Code *]
```

### Site Admin View Mode
```
Company Address: 123 Main St, Suite 100, New York, NY 10001
```

### Site Admin Edit Mode
```
Company Address
[Address Line 1]
[Address Line 2 (Optional)]
[City]  [State ▼]  [ZIP]
```

## Backend Changes Required ⚠️

You still need to update the backend to handle these fields:

### 1. Database Schema
Update your Prisma schema (or database) to change from single address field to separate fields:

```prisma
model User {
  // ... existing fields ...
  phone            String?
  companyName      String?
  // REPLACE companyAddress with:
  companyAddress1  String?
  companyAddress2  String?
  companyCity      String?
  companyState     String?
  companyZip       String?
  companyWebsite   String?
}
```

Run migration:
```bash
npx prisma generate
npx prisma db push
```

### 2. Registration API (`app/api/auth/register/route.ts`)
Update to accept and save new fields:
```typescript
const { 
  name, email, password, fullName, phone, 
  companyName, companyAddress1, companyAddress2, 
  companyCity, companyState, companyZip, companyWebsite 
} = await req.json();

const user = await prisma.user.create({
  data: {
    name,
    email,
    password: hashedPassword,
    fullName,
    phone,
    companyName,
    companyAddress1,
    companyAddress2,
    companyCity,
    companyState,
    companyZip,
    companyWebsite,
    // ... other fields ...
  },
});
```

### 3. Consultants API (`app/api/consultants/route.ts`)
Update PUT endpoint to handle all address fields:
```typescript
const { 
  id, fullName, email, address, phone, type,
  companyName, companyAddress1, companyAddress2,
  companyCity, companyState, companyZip, companyWebsite
} = await req.json();

await prisma.user.update({
  where: { id },
  data: {
    fullName,
    email,
    address,
    phone,
    type,
    companyName,
    companyAddress1,
    companyAddress2,
    companyCity,
    companyState,
    companyZip,
    companyWebsite,
  },
});
```

## Testing Checklist

### Frontend ✅ (All Complete)
- [x] Registration form displays all address fields properly
- [x] Address Line 2 shows as optional
- [x] State dropdown contains all 50 US states
- [x] ZIP field limits to 10 characters
- [x] Form validation requires all mandatory fields
- [x] Site admin displays formatted address
- [x] Site admin edit mode has separate address fields
- [x] State dropdown works in edit mode
- [x] No linter errors

### Backend (To Do)
- [ ] Database schema updated with new fields
- [ ] Migration run successfully
- [ ] Registration API saves all address fields
- [ ] Consultant update API saves all address fields
- [ ] Test registration with complete address
- [ ] Test registration with optional Address Line 2 empty
- [ ] Test viewing consultant in site admin
- [ ] Test editing consultant address in site admin

## Files Modified

1. ✅ `app/page.tsx`
   - Added US_STATES constant
   - Updated Consultant interface
   - Updated state variables
   - Updated registration form UI
   - Updated handleRegisterConsultant
   - Updated site admin display
   - Updated site admin edit mode

2. ✅ `lib/api-client.ts`
   - Updated authApi.register interface
   - Updated consultantsApi.update interface

3. 📄 Created documentation:
   - `ADDRESS_FIELDS_UPDATE.md` (this file)

## Example Data Structure

### Registration Data Sent to API:
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "password": "********",
  "fullName": "John Smith",
  "phone": "555-123-4567",
  "companyName": "Acme Corporation",
  "companyAddress1": "123 Main Street",
  "companyAddress2": "Suite 100",
  "companyCity": "New York",
  "companyState": "NY",
  "companyZip": "10001",
  "companyWebsite": "https://www.acme.com"
}
```

### Display Format:
```
Company Address: 123 Main Street, Suite 100, New York, NY 10001
```

## Success Criteria

✅ **Frontend Complete** - All UI and validation implemented
⏳ **Backend Pending** - Database and API routes need updates

Once backend is updated, the feature will be fully functional with proper address validation and display!

## Next Steps

1. Update Prisma schema with new address fields
2. Run database migration
3. Update registration API route
4. Update consultants API route  
5. Test end-to-end registration
6. Test site admin view and edit
7. Deploy to production

---

**Status**: Frontend Implementation Complete ✅  
**No Linter Errors**: Confirmed ✅  
**Ready for Backend Integration**: Yes ✅


