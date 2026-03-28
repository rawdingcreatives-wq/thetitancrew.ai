# Data Processing Agreement (DPA)

**TitanCrew, LLC — Data Processing Agreement**
**Version:** 1.0 | **Effective:** March 28, 2026
**Parties:** TitanCrew, LLC ("Processor") and the subscribing business ("Controller")

---

## 1. Purpose and Definitions

This Data Processing Agreement ("DPA") supplements the TitanCrew Terms of Service and governs the processing of Personal Data by TitanCrew on behalf of the Controller (the trade contractor business using the Service).

**Definitions:**
- **Personal Data** — Any information relating to an identified or identifiable natural person (your customers, technicians, suppliers)
- **Processing** — Any operation performed on Personal Data (collection, storage, use, transmission, deletion)
- **Sub-processor** — Third parties engaged by TitanCrew to process Personal Data
- **Data Subject** — The natural person whose Personal Data is being processed (primarily your customers)
- **CCPA** — California Consumer Privacy Act (Cal. Civ. Code § 1798.100 et seq.)
- **GDPR** — General Data Protection Regulation (EU) 2016/679

---

## 2. Role of the Parties

| Party | Role | Responsibility |
|-------|------|----------------|
| Controller (you) | Determines the purposes and means of processing | Ensuring legal basis for collecting customer data; honoring data subject rights |
| Processor (TitanCrew) | Processes data on Controller's behalf | Security, confidentiality, compliance with this DPA |

---

## 3. Scope of Personal Data Processed

TitanCrew processes the following categories of Personal Data on your behalf:

### 3.1 Customer Data (your trade customers)
- Contact information: name, phone number, email address, physical address
- Service history: job descriptions, dates, amounts, technician assignments
- Communication records: SMS/email messages sent/received
- Payment-adjacent data: invoice amounts, payment status (no payment card data is stored)

### 3.2 Technician Data (your employees/subcontractors)
- Contact information: name, phone, email
- Schedule data: availability, job assignments, GPS routing (if using TechDispatch)
- Performance data: jobs completed, response times

### 3.3 Business Operations Data
- Job records, estimates, and invoices
- Parts inventory and purchase orders
- Calendar events and appointments
- QuickBooks financial data (accessed via OAuth, not stored long-term)

### 3.4 Data We Do NOT Collect
- Social Security Numbers or tax ID numbers
- Payment card numbers (handled exclusively by Stripe)
- Medical information
- Children's data (under age 13)

---

## 4. Legal Basis for Processing

### 4.1 Your Responsibility
You (Controller) are responsible for establishing and maintaining a lawful legal basis for processing your customers' Personal Data. Appropriate legal bases include:
- **Performance of a contract** (providing trade services to your customers)
- **Legitimate interests** (business communications, invoicing)
- **Consent** (SMS marketing, where applicable)

### 4.2 TitanCrew's Basis
TitanCrew processes data under the legal basis of **contract performance** (providing the Service you've subscribed to) and **legitimate interests** (service improvement, security, fraud prevention).

---

## 5. Data Minimization Principles

TitanCrew is designed around data minimization:

- We collect only the data necessary to provide the Service
- AI agents are instructed **never to log Personally Identifiable Information (PII) in audit trails** — only action types, amounts, and job IDs are logged
- Vector memory (pgvector) stores **semantic context**, not raw customer records
- Customer phone numbers are stored in encrypted columns and masked in logs
- Data is automatically purged based on the retention schedule in Section 10

---

## 6. Security Measures

TitanCrew implements the following technical and organizational security measures:

### 6.1 Technical Measures
| Measure | Implementation |
|---------|---------------|
| Encryption at rest | AES-256 via Supabase (PostgreSQL) |
| Encryption in transit | TLS 1.3 for all API calls |
| Database isolation | Row-Level Security (RLS) — each account can only read its own rows |
| Secret storage | API keys and OAuth tokens stored in Supabase Vault (encrypted secrets store) |
| Access control | JWT-based authentication, service role keys never exposed to frontend |
| Audit logging | Immutable append-only audit_log table (no UPDATE/DELETE permissions) |
| API rate limiting | Per-account rate limits, Cost Governor budget caps |

### 6.2 Organizational Measures
- Employee access to production data limited to need-to-know basis
- Background checks for employees with production database access
- Incident response plan with 72-hour breach notification commitment
- Annual security training for all employees with data access

### 6.3 Row-Level Security Details

All primary tables enforce the following RLS policy pattern:

```sql
-- Example: jobs table
CREATE POLICY "account_isolation" ON jobs
  USING (account_id = auth.jwt() -> 'account_id');
```

This means: even if a bug or misconfiguration occurred, a database query from Account A **cannot return data belonging to Account B** at the database level.

---

## 7. Sub-Processors

TitanCrew uses the following sub-processors to deliver the Service:

| Sub-processor | Purpose | Location | DPA/Privacy |
|---------------|---------|----------|-------------|
| Supabase, Inc. | Database, Auth, Storage | US (AWS us-east-1) | [Supabase DPA](https://supabase.com/privacy) |
| Anthropic, PBC | AI language model (Claude) | US | [Anthropic Privacy](https://anthropic.com/privacy) |
| Twilio, Inc. | SMS/Voice communications | US | [Twilio DPA](https://www.twilio.com/en-us/legal/data-processing-addendum) |
| SendGrid (Twilio) | Email communications | US | [SendGrid DPA](https://sendgrid.com/policies/privacy/) |
| Stripe, Inc. | Payment processing | US | [Stripe DPA](https://stripe.com/privacy) |
| Vercel, Inc. | Frontend hosting | US | [Vercel Privacy](https://vercel.com/legal/privacy-policy) |
| Railway/Fly.io | Agent API hosting | US | Provider DPA on file |
| OpenAI, Inc. | Text embeddings only | US | [OpenAI DPA](https://openai.com/policies/data-processing-addendum) |

**Change Notification:** We will provide 30 days' advance notice of any material changes to sub-processors via email. You may object to a new sub-processor within 14 days; if we cannot accommodate your objection, you may terminate the Service.

---

## 8. Data Subject Rights

### 8.1 Your Customers' Rights
Under CCPA, your California customers have the right to:
- **Know** what data is collected about them
- **Delete** their personal data
- **Opt-out** of sale of personal data (TitanCrew does not sell personal data)
- **Non-discrimination** for exercising rights

### 8.2 How We Help You Honor These Rights
TitanCrew provides tools to help you respond to data subject requests:

- **Data export**: Download all data for a specific customer from Settings → Customer → Export
- **Data deletion**: Delete a customer's record (and associated jobs/comms) from the dashboard
- **SMS opt-out**: TitanCrew automatically processes STOP commands — customer is flagged comms_opt_out = true
- **Right to know**: Contact support@titancrew.ai — we will provide a data inventory within 45 days

### 8.3 Our Assistance Obligation
TitanCrew will promptly notify you of any data subject requests received directly (e.g., a customer emails us asking about their data). We will assist you in responding within the legally required timeframe.

---

## 9. International Data Transfers

TitanCrew processes and stores all Personal Data in the **United States**. If you have EU/EEA customers, you represent that you have a lawful basis for transferring their data to the US (e.g., Standard Contractual Clauses, Privacy Shield successor frameworks, or explicit consent).

TitanCrew can execute Standard Contractual Clauses (SCCs) upon request for EU-based businesses. Contact legal@titancrew.ai.

---

## 10. Data Retention Schedule

| Data Category | Retention Period | Basis |
|---------------|-----------------|-------|
| Active account data | Duration of subscription | Contract |
| Customer contact records | Duration + 2 years | Business records |
| Job records | Duration + 5 years | Tax/legal compliance |
| Invoice records | Duration + 7 years | IRS/tax requirements |
| SMS/Email logs | 2 years | TCPA compliance |
| Audit logs | 7 years | Legal/regulatory |
| AI agent run logs | 90 days | Operational |
| Account data post-cancellation | 90 days then deletion | Contract |

---

## 11. Breach Notification

In the event of a Personal Data breach that is likely to result in risk to individuals:
- TitanCrew will notify you within **72 hours** of becoming aware of the breach
- Notification will include: nature of the breach, categories and approximate number of data subjects affected, likely consequences, and measures taken or proposed
- You are responsible for notifying affected data subjects and regulators as required by applicable law

---

## 12. AI-Specific Data Processing Disclosures

### 12.1 What AI Models See
AI agents process Personal Data to generate responses and take actions. Specifically:
- Customer names and phone numbers are passed to agents for communication tasks
- Job descriptions and locations are used for scheduling
- Invoice amounts and customer details are used for finance tasks

### 12.2 Data Used for Model Training
- **Your customer data is NEVER used to train Anthropic's foundational Claude models** (per Anthropic's API terms)
- TitanCrew may use **anonymized, aggregated** patterns (not individual records) to improve TitanCrew-specific prompting
- You may opt out of this anonymized use by contacting support@titancrew.ai

### 12.3 Vector Embeddings
Customer and job descriptions may be converted to numerical vector embeddings (semantic representations) stored in our pgvector database. These vectors do not contain raw text and cannot be meaningfully reversed to recover PII.

---

## 13. Audit Rights

You have the right to audit TitanCrew's compliance with this DPA once per year, with 30 days' notice:
- TitanCrew will provide access to the immutable audit log for your account at any time via the dashboard
- For broader security audits, TitanCrew will share its most recent third-party security assessment report (SOC 2 or equivalent)
- Physical access to TitanCrew's hosting environment is subject to Supabase's and Railway's audit terms

---

## 14. Termination of DPA

This DPA terminates upon termination of the Terms of Service. Upon termination:
- TitanCrew will cease processing Personal Data within 30 days
- Data will be deleted per the schedule in Section 10
- TitanCrew will provide written confirmation of deletion upon request

---

## 15. Governing Law

This DPA is governed by the same jurisdiction as the Terms of Service (State of Texas).

---

*For questions about this DPA, contact: privacy@titancrew.ai*
*TitanCrew, LLC | Austin, Texas | titancrew.ai*
