# Loan Covenants Module - Implementation Plan

## Overview
This module implements a comprehensive loan covenants monitoring system for financial consultants. The module is completely isolated from the main application and can be enabled/disabled or completely removed without affecting existing functionality.

## Architecture

### Isolated Module Structure
```
app/
├── covenants/           # NEW: Completely separate module
│   ├── components/      # Covenant-specific UI components
│   ├── data/           # Covenant configurations & thresholds
│   ├── calculations/   # Covenant compliance logic
│   ├── alerts/         # Alert system
│   ├── hooks/          # Covenant-specific React hooks
│   └── README.md       # This documentation
├── shared/             # NEW: Shared data access layer
│   └── data-access.ts  # Read-only interface to existing data
```

### Key Principles
- **Zero Impact**: Existing application runs identically with/without covenants
- **Read-Only Data**: Uses existing processed financial data without modification
- **Complete Isolation**: Separate components, data models, and business logic
- **Easy Rollback**: Can be completely removed in minutes

## Covenant Types Supported

### 1. Financial Covenants
#### 1.1 Leverage-Based Covenants
- Total Leverage Ratio: Total Debt ÷ EBITDA
- Net Leverage Ratio: (Total Debt – Cash) ÷ EBITDA
- Senior Leverage Ratio: Senior Debt ÷ EBITDA
- Debt-to-Equity Ratio: Total Debt ÷ Shareholders' Equity

#### 1.2 Coverage-Based Covenants
- Interest Coverage Ratio: EBITDA ÷ Interest Expense
- Fixed-Charge Coverage Ratio: (EBITDA – Capex) ÷ (Interest + Scheduled Principal + Lease Payments)
- Debt Service Coverage Ratio (DSCR): Net Operating Income ÷ Debt Service
- Cash Flow Coverage: (Operating Cash Flow – Capex) ÷ Debt Service

#### 1.3 Liquidity-Based Covenants
- Minimum Liquidity: Cash + Available Revolver ≥ threshold
- Current Ratio: Current Assets ÷ Current Liabilities
- Quick Ratio (Acid Test): (Cash + AR + Marketable Securities) ÷ Current Liabilities

#### 1.4 Profitability Covenants
- Minimum EBITDA: EBITDA ≥ threshold
- Minimum Gross Margin: Gross Profit ÷ Revenue
- Minimum Net Income: Net Income ≥ threshold

### 2. Negative Covenants (Restrictions)
- Debt Incurrence Covenant
- Lien Covenant
- Dividend/Distribution Covenant
- Capital Expenditure Covenant
- Asset Sale Covenant
- M&A/Investment Covenant

### 3. Affirmative Covenants (Requirements)
- Financial Reporting Covenant
- Insurance Covenant
- Taxes Covenant
- Compliance Certificate
- Maintenance of Collateral

### 4. Maintenance Covenants
- Maximum Leverage: Ongoing leverage ratio ≤ threshold
- Minimum DSCR: Ongoing DSCR ≥ threshold
- Minimum Net Worth: Tangible Net Worth ≥ threshold

### 5. Incurrence Covenants
- Incurrence Leverage Test: Leverage ratio must be below limit after transaction
- Interest Coverage Incurrence Test: Coverage must stay above threshold after action
- Restricted Payments Builder Basket

## Implementation Phases

### Phase 1: Foundation (Current - Lowest Risk)
- [x] Set up isolated module structure
- [ ] Create shared data access service
- [ ] Build basic covenant data models
- [ ] Implement feature flags for conditional loading

### Phase 2: Core Functionality (Isolated Development)
- [ ] Develop covenant calculation engine using existing ratios
- [ ] Build Covenants tab UI (separate from main app components)
- [ ] Implement role-based access controls
- [ ] Create alert system infrastructure

### Phase 3: Advanced Features (Gradual Integration)
- [ ] Add time-series graphs
- [ ] Implement alert notifications
- [ ] Build covenant configuration interfaces
- [ ] Add comprehensive testing

### Phase 4: Production (Controlled Rollout)
- [ ] Feature flag activation
- [ ] Performance monitoring
- [ ] User acceptance testing
- [ ] Full rollback testing

## Data Access Strategy

### Shared Data Access
- Read-only interface to existing processed financial data
- No modifications to current data structures or calculations
- Uses existing data exactly as-is for covenant calculations
- Proper error handling if shared data is unavailable

### Covenant-Specific Data
- Separate database/storage for covenant configurations (thresholds, requirements)
- Independent from main application data models
- Can be completely removed without affecting core data

## Risk Mitigation & Rollback

### Feature Flags
- Environment variable: `ENABLE_COVENANTS_MODULE=false`
- Conditional loading in main app routing
- Zero impact when disabled

### Rollback Strategy
- Automated script to remove all covenant-related files
- Database migration to drop covenant tables (if using separate schema)
- Clear separation ensures no orphaned code in main application
- Can rollback instantly without data loss

### Testing Isolation
- Separate test suite with mock data
- Integration tests verify shared data access works
- No tests touch existing application code
- CI/CD pipeline can exclude covenants module

## UI Integration (Non-Invasive)

### Covenants Tab Location
- Added to existing company management interface
- Positioned to the right of the Profile tab
- Separate route handling that doesn't interfere with current routing
- Independent state management (no shared Redux/context)

### Access Control
- Only users with consultant role can configure covenants
- General users can view covenant status as part of company reports
- Clear visual indicators distinguish view-only vs. editable content

## Alert System

### Alert Types
- **Threshold Alerts**: Immediate notifications when covenants breach limits
- **Trending Alerts**: Warnings when covenants are approaching limits
- **Trend Direction Alerts**: Alerts when metrics start moving in the wrong direction
- **Escalation Levels**: Different severity levels (warning → critical → breach)

### Alert Delivery
- In-app notifications
- Email alerts to consultants and relevant stakeholders
- Dashboard indicators with color coding

## Time-Series Visualization

### Graph Requirements
- **Dual Y-Axis**: One for actual metric values, one for covenant thresholds
- **Historical Context**: Show covenant performance over quarters/months/years
- **Threshold Lines**: Clear visual indicators of minimum/maximum requirements
- **Interactive Elements**: Hover to see exact values, zoom for detailed periods
- **Color Coding**: Green (compliant), yellow (approaching), red (breached)

## Technical Implementation Details

### Data Access Pattern
```typescript
// Shared read-only access - NO modifications to existing data
const sharedData = useSharedDataAccess();
const financialRatios = sharedData.getFinancialRatios(companyId);

// Covenant calculations use existing ratios
const covenantCompliance = calculateCovenantCompliance(
  financialRatios, // From existing data
  covenantThresholds // Separate covenant config
);
```

### Error Boundaries
- Complete module isolation with error boundaries
- If covenants module fails, main app continues unaffected
- Graceful degradation when shared data is unavailable

## Success Criteria

- [ ] **Zero Impact**: Existing application runs identically with/without covenants
- [ ] **Data Integrity**: All calculations use existing processed data without changes
- [ ] **Easy Rollback**: 5-minute complete removal if issues arise
- [ ] **Consultant Access**: Only users with consultant role can configure covenants
- [ ] **Performance**: No degradation to existing report generation

## Next Steps

1. **Complete Phase 1**: Finish shared data access service and basic data models
2. **Begin Phase 2**: Start with covenant calculation engine
3. **Test Integration**: Verify shared data access works with existing financial data
4. **UI Development**: Build Covenants tab interface
5. **Feature Flag Testing**: Ensure enable/disable works correctly

## Contact & Documentation
- This plan serves as the primary reference for the covenants module implementation
- All changes must maintain the isolation principles outlined above
- Any modifications to existing application code are strictly prohibited

---

**Created**: December 11, 2025
**Last Updated**: December 11, 2025
**Version**: 1.0
