# Account Mapping Table - Integration Guide

## What's Been Done

✅ Created `AccountMappingTable.tsx` component with:
- Collapsible sections for Income Statement (Revenue, COGS, Operating Expenses)
- Collapsible sections for Balance Sheet (Assets, Liabilities, Equity)
- Visual section headers with icons and colors
- Account count badges
- All existing functionality (target field dropdown, LOB allocations, confidence)

✅ Added import to `app/page.tsx`

## What's Left To Do

### Simple Integration (Recommended)

In `app/page.tsx` around line 13542-14019, replace the entire mapping section with:

```typescript
{/* Mapping Results Section */}
{showMappingSection && aiMappings.length > 0 && (
  <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '32px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
        Account Mappings ({aiMappings.length} accounts)
      </h2>
    </div>

    <AccountMappingTable
      mappings={aiMappings}
      linesOfBusiness={linesOfBusiness}
      onMappingChange={(index, updates) => {
        const updated = [...aiMappings];
        updated[index] = { ...updated[index], ...updates };
        setAiMappings(updated);
      }}
    />
  </div>
)}
```

### Find the Section

Search for: `{/* Mapping Results Section */}`
Or line: ~13542

The section starts with:
```typescript
{showMappingSection && aiMappings.length > 0 && (
```

And ends around line 14019 with the closing:
```typescript
)}
```

### What to Replace

Replace EVERYTHING from the opening `{showMappingSection && aiMappings.length > 0 && (` 
to its matching closing `)}` with the code above.

## Benefits

- ✨ Income Statement sections appear first (Revenue → COGS → Expenses)
- ✨ Balance Sheet sections appear second (Assets → Liabilities → Equity)
- ✨ Each section is collapsible for easy navigation
- ✨ Visual indicators with icons and colors
- ✨ Account counts per section
- ✨ Cleaner, more organized UI

## Test After Integration

1. Upload CSV file
2. Go to Account Mapping
3. Run AI mapping
4. Verify sections are collapsible
5. Verify LOB allocations still work
6. Verify target field dropdowns still work
7. Save mappings and reload to ensure persistence

## Note

The component is self-contained and handles all the complex rendering logic that was previously inline in `app/page.tsx`.

