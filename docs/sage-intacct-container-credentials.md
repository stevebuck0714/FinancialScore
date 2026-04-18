## Sage Intacct — Accounting Integration Container Credentials (Customer Intake)

### Purpose
Collect the **minimum connection details and credentials** required to configure the Sage Intacct accounting integration in FinancialScore.

This intake is intentionally limited to **container credentials / connectivity** (not mappings, dimensions, COA strategy, or posting behavior).

---

### Prerequisites (in Sage Intacct)
- **Web Services enabled** in the target environment (Sandbox/Test and/or Production).
- A dedicated **integration user** exists (recommended; non-human).
- Integration user permissions are provisioned per your policy (least-privilege recommended).

---

### Required fields (provide / confirm)

#### 1) Target environment + connectivity
- **Environment**: Sandbox/Test or Production
- **Region**: US / Canada / UK-EU / Other
- **Endpoint URL**:
  - Usually **not required** (we use a default appropriate to your region)
  - If your Intacct instance requires a specific endpoint, provide it here: _____
- **Network restrictions**:
  - IP allowlist required? Yes / No / Unknown
  - Proxy required? Yes / No / Unknown
  - VPN required? Yes / No / Unknown
  - If any are “Yes”, describe requirements and the allowlisting process: _____

#### 2) Intacct tenant identifiers
- **Company ID**: _____

#### 3) Integration user credentials
- **User ID**: _____
- **User password / secret**: (share securely; see below)

#### 4) Entity scope (only if applicable)
- **Entity ID**:
  - If you are multi-entity and this connection must run under a specific entity context, provide the **Entity ID**: _____
  - Otherwise: N/A

#### 5) Intacct Web Services “Sender” credentials
Sage Intacct Web Services requires a **Sender ID** and **Sender Password**.

- **Sender credential source** (choose one):
  - Our vendor Sender ID (typical)
  - Customer-provided Sender ID
- If customer-provided:
  - **Sender ID**: _____
  - **Sender password/secret**: (share securely; see below)

---

### Secure sharing (required)
Do **not** paste secrets into tickets, chat, or email.

- **Approved sharing method** (choose one):
  - 1Password / Bitwarden secure share
  - Customer-managed vault share (Azure Key Vault / AWS Secrets Manager / similar)
  - Other IT-approved encrypted exchange method: _____
- **Recipient (our side)**: name/email for the person/team who should receive the secret share: _____

---

### Validation (so we confirm the right tenant)
Provide at least one validation hint:
- **Expected Company display name**: _____
- If multi-entity: **default Entity ID for initial connection test**: _____

---

### Quick checklist (copy/paste)
- [ ] Environment (Sandbox/Test or Production): ___
- [ ] Region: ___
- [ ] Endpoint URL (only if required): ___
- [ ] Company ID: ___
- [ ] User ID: ___
- [ ] User password/secret (secure share): ___
- [ ] Entity ID (if applicable): ___ / N/A
- [ ] Sender credentials source (vendor vs customer): ___
- [ ] (If customer-provided) Sender ID: ___
- [ ] (If customer-provided) Sender password/secret (secure share): ___
- [ ] Secure sharing method: ___
- [ ] Validation (expected company name, optional entity): ___

