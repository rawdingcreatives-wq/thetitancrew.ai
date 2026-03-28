# TitanCrew AI Agent Liability Disclaimer & Scope of Service

**Version:** 1.0 | **Effective:** March 28, 2026

---

## IMPORTANT — PLEASE READ BEFORE USING AI AGENTS

This document describes the scope, limitations, and liability boundaries for TitanCrew's AI agent system. By enabling AI agents for your account, you acknowledge and accept the terms in this disclaimer.

---

## Part I: What TitanCrew AI Agents Are

TitanCrew's AI agents are **Business Process Automation (BPA) tools** powered by large language models. They are:

✅ **Designed to:**
- Suggest scheduling options based on calendar availability
- Draft invoice line items based on job records
- Write customer communication drafts for your review
- Monitor inventory levels and suggest reorder quantities
- Summarize business performance and flag anomalies
- Route technicians based on location and skill match

❌ **NOT designed to:**
- Replace your judgment as a licensed professional
- Provide tax, legal, or accounting advice
- Guarantee accuracy of any generated content
- Operate without human oversight or the ability to intervene
- Execute irreversible financial transactions autonomously

---

## Part II: Human-in-Loop (HIL) System — Your Safety Net

### How It Works

Every high-stakes action requires your explicit approval before execution. When an agent wants to take a significant action, you receive:

1. **An SMS message** describing the proposed action in plain English
2. **An approval URL** (tap to approve) and a **rejection URL** (tap to reject)
3. A **countdown timer** — if you don't respond within **4 hours**, the action is **automatically rejected** (not executed)

### Actions That Always Require Your Approval

| Agent | Action | HIL Threshold |
|-------|--------|--------------|
| Scheduler | Book a job | > $500 estimated value |
| Scheduler | Cancel a confirmed job | Any cancellation |
| Finance | Create an invoice | > $2,000 |
| Finance | Send an invoice to customer | > $2,000 |
| Finance | Void/delete an invoice | Any void |
| Parts/Inventory | Create a purchase order | > $200 |
| Customer Comms | Bulk SMS campaign | > 10 recipients |
| TechDispatch | Emergency re-route | Any emergency dispatch |

### What Approval Means — Legal Significance

**When you tap "Approve" on a HIL confirmation, you are giving express authorization for that specific action. This constitutes your direct instruction to TitanCrew to execute the action. TitanCrew's liability for an approved action is limited to gross negligence or willful misconduct only.**

By approving:
- An invoice: You confirm the amount and recipient are correct
- A job booking: You confirm the time, technician, and customer are correct
- A purchase order: You confirm the parts, quantities, and price are acceptable
- A job cancellation: You confirm this cancellation is intentional

**Do not approve HIL requests you haven't read carefully.**

---

## Part III: Known AI Limitations and Your Responsibilities

### 3.1 The AI Can Be Wrong

AI language models can and do make errors. Known failure modes include:

| Error Type | Example | How to Catch It |
|------------|---------|----------------|
| Invoice math errors | Incorrect total from line items | Review HIL confirmation before approving |
| Scheduling conflicts | Double-booking two techs | Check your calendar after each booking |
| Communication tone | Overly formal or casual customer SMS | Review outbound messages in the Comms log |
| Part pricing errors | Stale pricing from supplier API | Confirm current pricing before PO approval |
| Customer name errors | Wrong "John" in a job with multiple Johns | Verify the job ID in HIL requests |

### 3.2 What You Must Do

You are required to:

1. **Monitor your dashboard daily** — Review the AI Crew activity feed
2. **Respond to HIL requests promptly** — Unreviewed requests expire and are rejected
3. **Verify invoices before payment deadlines** — The Finance agent drafts; you send
4. **Check the Audit Log weekly** — Confirm all agent actions match your expectations
5. **Correct errors immediately** — If an agent made an error, fix it before it compounds

### 3.3 What TitanCrew Cannot Guarantee

TitanCrew makes **no guarantee** that AI agents will:
- Correctly interpret ambiguous job descriptions
- Accurately price services based on incomplete job records
- Send communications that comply with all applicable laws in every jurisdiction
- Detect fraud or misrepresentation by your customers
- Never make scheduling errors, even with calendar integration enabled

---

## Part IV: Financial Action Liability

### 4.1 Invoice-Related Actions

TitanCrew will not be held liable for:
- Incorrect invoice amounts that you approved via HIL
- Invoices sent to incorrect email addresses that you approved
- Tax calculation errors (consult a licensed accountant for tax compliance)
- Collection failures on invoices created via the Service
- QuickBooks sync discrepancies if your QBO data was already inconsistent

### 4.2 Purchase Order Actions

TitanCrew will not be held liable for:
- Price changes between supplier quote and order execution
- Incorrect parts ordered from supplier catalogs with inaccurate data
- Shipping delays or fulfillment failures by Ferguson or Grainger
- Parts that are incompatible with your specific job requirements
- Orders you approved via HIL that turn out to be wrong

### 4.3 What We Are Responsible For

TitanCrew accepts responsibility for:
- Technical failures in the HIL system that result in an approved action not being executed
- Gross negligence in the design of the LiabilityFilter that allows a prohibited action to execute
- Security breaches caused by our failure to maintain the security measures described in the DPA
- Billing errors on your subscription account

---

## Part V: Communication Liability (SMS & Email)

### 5.1 TCPA Compliance Framework

TitanCrew's CustomerCommAgent includes built-in TCPA compliance measures:
- **Quiet Hours:** No SMS sent before 8:00 AM or after 9:00 PM in the recipient's local timezone
- **Opt-Out Processing:** STOP commands are processed immediately and permanently
- **Consent Verification:** Marketing SMS require verified consent before sending
- **Bulk SMS Limit:** > 10 recipient campaigns require explicit HIL approval

**However**, TitanCrew does not guarantee that using these features constitutes full TCPA compliance for your specific use case. You are responsible for:
- Ensuring you have proper consent for each type of communication
- Maintaining records of customer consent
- Consulting with legal counsel about your SMS marketing program
- Registering for A2P 10DLC (Application-to-Person) messaging as required by US carriers

### 5.2 Content Accuracy

Customer-facing messages generated by AI agents are **drafts**. You acknowledge:
- AI-generated messages may contain factual errors about pricing, scheduling, or service details
- Messages are based on your job records — if your records are incomplete or wrong, the message will be too
- TitanCrew is not liable for customer disputes arising from AI-generated messages that you approved or allowed to send

---

## Part VI: Scheduling and Dispatch Liability

### 6.1 Calendar Integration

When Google Calendar integration is enabled:
- The AI reads your calendar to suggest available slots
- External calendar events created outside TitanCrew may not always be detected
- Calendar sync can have up to 5-minute delays

TitanCrew is not liable for:
- Double bookings caused by simultaneous external calendar modifications
- Missed appointments resulting from calendar sync failures
- Customer delays or loss caused by scheduling errors you approved

### 6.2 Route Optimization (TechDispatch — Pro Plan)

The TechDispatch agent provides routing suggestions only:
- Actual travel times may differ from estimates due to traffic, weather, or road conditions
- Technician actual availability may differ from calendar data
- Emergency dispatch decisions remain at the owner's discretion

---

## Part VII: Audit Trail Access

### 7.1 Your Right to Review

You have a **permanent right** to access the full audit log of all actions taken by TitanCrew AI agents on your account. The Audit Log is available at:

**Dashboard → Audit Log** (or: `https://app.titancrew.ai/audit-log`)

The audit log records:
- Every action taken by every agent
- The AI's stated reason for the action
- Whether HIL approval was obtained
- The exact timestamp and account context
- Success or failure of the action

### 7.2 Immutability

The audit log is **append-only and immutable**. TitanCrew cannot delete audit log entries, and neither can you. This ensures an unalterable record of all agent activity for your protection.

### 7.3 Using the Audit Log in Disputes

If you believe an agent made an unauthorized or erroneous action:
1. Access the Audit Log and find the relevant entry
2. The entry will show whether HIL approval was obtained
3. If the action was approved by you via HIL, it is considered authorized
4. If the action was taken without HIL approval and violated the thresholds above, contact support@titancrew.ai immediately

---

## Part VIII: Acknowledgment

By enabling TitanCrew AI agents, you acknowledge that you have:

- [ ] Read and understood this AI Liability Disclaimer
- [ ] Understood that AI agents are assistive tools, not autonomous decision-makers
- [ ] Agreed to maintain active oversight of all agent activity
- [ ] Understood the HIL approval system and your responsibility when approving actions
- [ ] Consulted appropriate legal, financial, and professional advisors for your compliance obligations
- [ ] Agreed that TitanCrew's liability is limited as described in the Terms of Service and this Disclaimer

---

*For questions, contact: legal@titancrew.ai*
*TitanCrew, LLC | Austin, Texas | titancrew.ai/legal*
