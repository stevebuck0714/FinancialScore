## Sage Intacct — Accounting Integration Settings Intake (Credentials + Sync Settings)

### Purpose
Collect the **exact fields** needed to populate FinancialScore’s Sage Intacct Accounting Integration settings (credentials, secrets, and basic sync settings).

This does **not** cover mapping, COA design, posting behavior, or dimension mapping beyond basic context IDs.

---

### Prerequisites (in Sage Intacct)
- **Web Services enabled** in the target environment (Sandbox/Test and/or Production).
- A dedicated **integration user** exists (recommended; non-human).
- The integration user has permissions per your policy (least-privilege recommended).

---

### Required fields (matches our settings form)

#### 1) Sender credentials (Web Services)
- **Sender ID**: _____
- **Sender Password / secret**: _____ (share securely; see “Secure sharing”)

#### 2) Company + user credentials
- **Company ID**: _____
- **User ID**: _____
- **User Password / secret**: _____ (share securely; see “Secure sharing”)

#### 3) Endpoint + protocol
- **Endpoint URL**: _____
- **DTD Version** (optional): _____ (default `3.0`)

#### 4) Context (optional)
Provide these only if your Intacct setup requires a specific context for data access.

- **Entity ID** (optional): _____
- **Location ID** (optional): _____

#### 5) Sync settings (non-secret)
- **Sync frequency**: daily / weekly / monthly
- **Sync time (local)**: _____ (e.g. `08:00`)
- **Incremental sync**: YES / NO
- **Initial sync start date** (optional, `YYYY-MM-DD`): _____

---

### Secure sharing (required)
Do **not** paste secrets into tickets, chat, or email.

- **Approved method** (choose one):
  - 1Password / Bitwarden secure share
  - Customer-managed vault share (Azure Key Vault / AWS Secrets Manager / similar)
  - Other IT-approved encrypted exchange method: _____
- **Recipient (our side)**: name/email for the person/team who should receive the secret share: _____

---

### Validation (to confirm we connected to the right tenant)
Provide at least one validation hint:
- **Expected Company display name**: _____
- If multi-entity: **default Entity ID and/or Location ID for initial connection test**: _____

---

### Quick checklist (copy/paste)
- [ ] Sender ID: ___
- [ ] Sender password/secret (secure share): ___
- [ ] Company ID: ___
- [ ] User ID: ___
- [ ] User password/secret (secure share): ___
- [ ] Endpoint URL: ___
- [ ] DTD Version (optional; default 3.0): ___
- [ ] Entity ID (optional): ___
- [ ] Location ID (optional): ___
- [ ] Sync frequency (daily/weekly/monthly): ___
- [ ] Sync time (local): ___
- [ ] Incremental sync (YES/NO): ___
- [ ] Initial sync start date (optional YYYY-MM-DD): ___
- [ ] Secure sharing method: ___
- [ ] Validation (expected company name, optional entity/location): ___

