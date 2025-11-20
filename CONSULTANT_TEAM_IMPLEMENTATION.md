# Consultant Team Management Implementation

## Overview
Implemented multi-user support for consultant firms, allowing a primary contact to add multiple team members who can all access the same client companies.

## Changes Made

### 1. Database Schema Updates (`prisma/schema.prisma`)

#### Updated Models:
- **User Model**: Added new fields
  - `consultantId` (String?) - Links team members to their consultant firm
  - `isPrimaryContact` (Boolean) - Flags the primary contact (defaults to false)
  - New relation: `consultantFirm` - Links to the consultant firm they belong to
  - Renamed `consultant` relation to `primaryConsultant` for clarity

- **Consultant Model**: Added new relation
  - `teamMembers` (User[]) - Array of all team members in the firm

#### Schema Changes Applied:
- ✅ Database schema pushed successfully with `npx prisma db push`
- ⚠️ Note: Prisma client generation had a file lock issue on Windows, but schema is updated

---

### 2. API Endpoints Created

#### New Route: `/app/api/consultants/team/route.ts`
Complete CRUD operations for team management:

- **GET** `/api/consultants/team?consultantId={id}`
  - Fetches all team members for a consultant firm
  - Returns users sorted by isPrimaryContact (primary first)

- **POST** `/api/consultants/team`
  - Adds new team member to consultant firm
  - Creates user with CONSULTANT role
  - Links to consultantId
  - Validates unique email

- **DELETE** `/api/consultants/team?userId={id}&consultantId={id}`
  - Removes team member
  - Prevents deletion of primary contact
  - Requires primary contact confirmation

- **PATCH** `/api/consultants/team`
  - Updates team member details
  - Supports transferring primary contact role
  - Atomic transaction for primary contact transfer

---

### 3. Authentication Updates

#### Files Modified:

**`auth.config.ts`**
- Updated user query to include `primaryConsultant` and `consultantFirm` relations
- Determines consultantId from either primary relation or team member relation
- Added `isPrimaryContact` to JWT and session

**`types/next-auth.d.ts`**
- Added `isPrimaryContact` field to Session, User, and JWT interfaces

**`app/api/auth/login/route.ts`**
- Updated to fetch both `primaryConsultant` and `consultantFirm` relations
- Returns `isPrimaryContact` status in response

**`app/api/auth/register/route.ts`**
- Sets `isPrimaryContact: true` for new consultant registrations
- Links user's `consultantId` to their consultant firm
- Ensures new consultants are automatically primary contacts

---

### 4. UI Components Added

#### Location: `app/page.tsx`

**New State Variables:**
```typescript
const [consultantTeamMembers, setConsultantTeamMembers] = useState<any[]>([]);
const [showAddTeamMemberForm, setShowAddTeamMemberForm] = useState(false);
const [newTeamMember, setNewTeamMember] = useState({
  name: '', email: '', phone: '', title: '', password: ''
});
```

**New Tab Added:**
- "Team Management" tab in consultant dashboard
- Only visible to primary contacts (`currentUser?.isPrimaryContact === true`)
- Located after the Profile tab

**New Functions:**
- `fetchTeamMembers()` - Loads team members from API
- `addTeamMember()` - Creates new team member
- `removeTeamMember()` - Removes team member with confirmation

**Team Management UI Features:**
- Table view of all team members
- Shows name, email, phone, title, role badge (Primary Contact vs Team Member)
- Add Team Member form with fields:
  - Full Name (required)
  - Email (required)
  - Phone (optional)
  - Title/Role (optional)
  - Password (required)
- Remove button (disabled for primary contact)
- Visual indicators for primary contact
- Empty state when no team members exist

---

### 5. Data Migration Script

**File**: `scripts/migrate-existing-consultants.ts`

Purpose: Updates existing consultant users in the database

Actions:
- Sets `isPrimaryContact = true` for all existing consultants
- Sets `consultantId` to link user to their consultant firm
- Provides detailed logging and error handling

**To Run:**
```bash
npx tsx scripts/migrate-existing-consultants.ts
```

⚠️ **IMPORTANT**: Run this script once before deploying to production to migrate existing data!

---

## How It Works

### For Primary Contacts:
1. Log in as usual
2. Navigate to consultant dashboard
3. Click "Team Management" tab (only visible to primary contacts)
4. Add team members with email/password
5. Team members automatically get access to all companies

### For Team Members:
1. Log in with credentials provided by primary contact
2. See all companies from their consultant firm
3. Have same permissions as primary contact (except can't manage team)
4. Cannot access Team Management tab

### Access Control:
- **Primary Contact**: Full access + team management
- **Team Members**: Full access to companies, no team management
- **All consultant users**: See ALL companies under their consultant firm

---

## Database Relationships

```
Consultant (Firm)
  └── teamMembers (User[])
       ├── Primary Contact (isPrimaryContact: true, consultantId: consultantId)
       └── Team Members (isPrimaryContact: false, consultantId: consultantId)
  └── companies (Company[])
       └── All team members see these companies
```

---

## Security Considerations

✅ Primary contact cannot be deleted (must transfer role first)
✅ Email uniqueness enforced
✅ Only primary contact can manage team
✅ Team member removal requires confirmation
✅ Passwords are hashed using bcrypt
✅ consultantId validated on all team operations

---

## Testing Checklist

Before deploying, test:

- [ ] Run migration script for existing consultants
- [ ] Primary contact can add team members
- [ ] Team members can log in
- [ ] Team members see all companies from consultant firm
- [ ] Team members cannot access Team Management tab
- [ ] Primary contact cannot be removed
- [ ] Regular team members can be removed
- [ ] New consultant registration sets isPrimaryContact correctly
- [ ] Multiple team members from same firm see same data

---

## Files Modified

### Core Files:
- ✅ `prisma/schema.prisma` - Database schema
- ✅ `auth.config.ts` - Authentication configuration
- ✅ `types/next-auth.d.ts` - TypeScript types
- ✅ `app/api/auth/login/route.ts` - Login endpoint
- ✅ `app/api/auth/register/route.ts` - Registration endpoint
- ✅ `app/page.tsx` - Main UI with Team Management tab

### New Files:
- ✅ `app/api/consultants/team/route.ts` - Team management API
- ✅ `scripts/migrate-existing-consultants.ts` - Migration script

---

## Next Steps (Before Git Push)

1. **Review this implementation document**
2. **Run the migration script** to update existing consultants:
   ```bash
   npx tsx scripts/migrate-existing-consultants.ts
   ```
3. **Test the functionality** in your development environment
4. **Verify** team management tab appears for primary contacts
5. **Confirm** team members can be added and removed
6. **Check** that team members see all companies
7. **Only then** commit and push to GitHub

---

## Questions or Issues?

If you find any issues during review, let me know and I'll fix them before you push to GitHub.

