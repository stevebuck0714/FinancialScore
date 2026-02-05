# Infor M3 Integration Questionnaire

**Client Name:**  
**Primary Contact:**  
**Email / Phone:**  
**Time Zone:**  

---

## 1) Environment & Edition
- M3 edition (choose one): **BE (on-prem)** / **CE (cloud)**
- Exact version/build (from About/Release screen):  
- Hosting location (if cloud):  
- Environments available: **dev / test / prod** (list)  

---

## 2) Access & Connectivity
- Integration method approved (choose all that apply):  
  - M3 REST APIs  
  - M3 Business Engine APIs  
  - Infor ION  
  - Other (describe)  
- Authentication method: **OAuth2 / API token / basic auth / other**  
- IP allowlisting or VPN required?  
- Can we use a **service account**? If yes, who provisions it?  

---

## 3) Monthly COA Data
- Which COA entities/tables should we use?  
- Companies/legal entities to include:  
- Include inactive accounts? **Yes / No**  
- Include effective dates or historical changes? **Yes / No**  
- Required dimensions (e.g., department, cost center, location):  

---

## 4) Nightly Ops Data
- Modules/entities required (check all that apply):  
  - GL transactions  
  - AP/AR  
  - Inventory  
  - Orders  
  - Payroll/Headcount  
  - Other (list)  
- Required data freshness (e.g., "up to prior day close"):  
- Preferred cutoff time (local time):  
- Incremental sync supported? **Yes / No**  
- Change tracking fields (e.g., lastModified, transactionDate):  

---

## 5) Data Volumes & Performance
- Estimated monthly COA record counts:  
- Estimated nightly ops record counts:  
- Rate limits or batch size limits?  
- Typical API response size constraints?  

---

## 6) Mapping & Transformations
- Fiscal calendar type (calendar vs 4-4-5, etc.):  
- Currency handling (single vs multi-currency):  
- Sign conventions (credits/debits) we must follow:  
- Required transformations or exclusions:  

---

## 7) Validation & Reconciliation
- Reconciliation reports we must match (GL totals, inventory balances, etc.):  
- Acceptable variance thresholds:  
- Who signs off on reconciliation?  

---

## 8) Security & Compliance
- Data classification (PII/PHI/PCI) included?  
- Masking or exclusion rules:  
- Audit/logging requirements:  
- Retention requirements for raw data:  

---

## 9) Operations & Support
- Desired start date for data loads:  
- Preferred cadence for monthly COA (date/time):  
- Expected support window (business hours):  
- Escalation contact:  
