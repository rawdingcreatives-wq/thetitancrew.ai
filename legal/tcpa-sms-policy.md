# TitanCrew SMS & Communications Policy
## TCPA Compliance Framework

**Version:** 1.0 | **Effective:** March 28, 2026
**Applicable Law:** Telephone Consumer Protection Act (47 U.S.C. § 227), FCC Regulations, State ATDS Laws

---

## 1. Overview

TitanCrew's CustomerCommAgent sends SMS and email communications to your customers on your behalf. This policy describes:

- What types of SMS messages are sent
- When messages can and cannot be sent (quiet hours)
- How customer consent is obtained and tracked
- How opt-outs are processed
- Your obligations as the business owner
- Our technical compliance implementation

---

## 2. Message Categories and Consent Requirements

### 2.1 Transactional Messages (No Separate Consent Required)

These messages are sent in connection with a confirmed service engagement:

| Message Type | Trigger | Consent Required |
|-------------|---------|-----------------|
| Appointment confirmation | New job booked | Implied (service relationship) |
| Appointment reminder | 24h before scheduled job | Implied |
| Technician on-the-way | Day of job | Implied |
| Invoice sent notification | Invoice created | Implied |
| Payment received confirmation | Payment recorded | Implied |

**Important:** Even for transactional messages, customers must have provided their phone number voluntarily and knowingly as part of requesting your services.

### 2.2 Marketing/Promotional Messages (Prior Express Written Consent Required)

These messages require explicit, documented consent before sending:

| Message Type | Example |
|-------------|---------|
| Seasonal promotions | "Winter HVAC tune-up — 20% off through January" |
| Re-engagement campaigns | Reaching out to customers who haven't booked in 90+ days |
| Upsell / cross-sell | "Did you know we also handle [other service]?" |
| Referral requests | "Know anyone who needs a plumber?" |

**Prior Express Written Consent** means the customer has:
1. Signed a paper or electronic consent form, OR
2. Checked an opt-in box on your website or booking page, OR
3. Replied affirmatively to a consent request SMS
4. The consent must be specific to SMS marketing from your business

### 2.3 Survey / Review Requests

Review request messages (asking customers to leave a Google review) are sent after job completion. These are considered **relationship messages** and require implied consent (the customer is an existing customer who received services).

---

## 3. Quiet Hours — Enforced Automatically

### 3.1 Default Quiet Hours

TitanCrew's TCPAGuard module enforces mandatory quiet hours:

- **No SMS before 8:00 AM** in the recipient's local timezone
- **No SMS after 9:00 PM** in the recipient's local timezone
- **No calls or SMS on federal holidays** (for marketing messages)

These limits **cannot be disabled** and are enforced at the code level.

### 3.2 Timezone Detection

The system detects recipient timezone based on:
1. Area code of the phone number (primary method)
2. Customer address (if on file)
3. Default to business timezone if unknown

### 3.3 Message Queuing

Messages that would violate quiet hours are **held in queue** and delivered at the next available time (8:00 AM the following morning). They are NOT silently dropped.

---

## 4. Opt-Out Processing

### 4.1 STOP Command (Mandatory, Instant)

When a recipient replies **STOP, UNSUBSCRIBE, CANCEL, END, or QUIT** to any TitanCrew-sent SMS:

1. The system immediately flags the customer record: `comms_opt_out = true`
2. No further SMS will be sent to that number — **ever**, from any agent
3. An automated confirmation is sent: *"You've been unsubscribed from [Business Name] messages. Reply START to re-subscribe."*
4. The opt-out is logged in the audit trail with timestamp
5. You receive a notification in your dashboard that a customer opted out

**This process is automatic and cannot be overridden by you or the AI agents.**

### 4.2 HELP Command

When a recipient replies **HELP** or **INFO**:

An automated message is sent:
> *"[Business Name] via TitanCrew: Service appointment updates & reminders. Msg & data rates may apply. Reply STOP to unsubscribe."*

### 4.3 START / Re-subscription

When a customer who previously opted out replies **START** or **YES**:

1. The opt-out flag is cleared: `comms_opt_out = false, sms_opt_in = true`
2. The customer can now receive transactional messages again
3. Marketing messages require new explicit consent

### 4.4 Suppression List

TitanCrew maintains a suppression list of opted-out numbers. This list persists even if:
- You delete and re-add the customer record
- You cancel and re-subscribe to TitanCrew

**The suppression list is permanent and cannot be manually overridden** to comply with carrier requirements.

---

## 5. A2P 10DLC Registration (Your Responsibility)

### 5.1 What is A2P 10DLC?

Application-to-Person (A2P) 10DLC is a US carrier framework requiring businesses that send SMS from 10-digit local numbers to register their messaging use case. **Unregistered A2P traffic is filtered/blocked by carriers.**

### 5.2 Registration Status

TitanCrew provides a shared messaging number for trial accounts. For production use:

| Option | Setup | Monthly Cost | Throughput |
|--------|-------|-------------|-----------|
| Shared number (trial) | Automatic | Included | Limited |
| Dedicated number + 10DLC | 2–4 weeks | ~$10/mo | High |
| Toll-free number | 1–2 weeks | ~$15/mo | Medium |

**We strongly recommend registering a dedicated 10DLC number** before sending more than 100 SMS/month to avoid carrier filtering.

### 5.3 How to Register

1. Go to Dashboard → Settings → Phone & Messaging
2. Click "Register A2P Campaign"
3. Complete the campaign registration form (business name, use case, sample messages)
4. Submit — TitanCrew will handle submission to The Campaign Registry (TCR) via Twilio
5. Approval typically takes 5–15 business days

### 5.4 Required Information for Registration

- Legal business name
- Business address and EIN
- Primary contact information
- Description of messaging use case (e.g., "Appointment reminders and transactional messages for plumbing service customers")
- Sample message templates (2–3 examples)

---

## 6. Consent Tracking and Documentation

### 6.1 How Consent is Stored

TitanCrew tracks consent at the customer record level:

```
trade_customers table:
  comms_opt_out      boolean  -- STOP received
  sms_opt_in         boolean  -- Explicit marketing consent
  sms_opt_in_date    timestamp
  sms_opt_in_source  text     -- "booking_form" | "verbal" | "reply_yes"
  sms_opt_out_date   timestamp
```

### 6.2 Consent Documentation Best Practices

For marketing SMS, document consent at the point of collection:
- Add an SMS consent checkbox to your booking form or invoice
- Save the consent timestamp and IP address (for web forms)
- Keep written records of verbal consent with date and staff initials

### 6.3 How to Mark Consent

In the TitanCrew dashboard:
1. Open a customer record
2. Toggle "SMS Marketing Consent" and select the consent source
3. The timestamp is automatically recorded

---

## 7. Message Identification Requirements

Every TitanCrew SMS includes:

1. **Business identification:** Your business name appears at the start or end of every message
2. **Opt-out instructions:** All marketing messages end with "Reply STOP to unsubscribe"
3. **Help information:** Available via HELP reply

Example:
> *"Hi Sarah, this is Austin Plumbing Pro — your water heater install is confirmed for Tuesday, April 2 at 10 AM. Questions? Call (512) 555-0123. Reply STOP to opt out."*

---

## 8. Prohibited Message Types

TitanCrew agents will refuse to send SMS that:

- Contain false, misleading, or deceptive content
- Include sexually explicit material
- Promote illegal activities
- Are sent to numbers on the National Do Not Call Registry (for sales calls)
- Contain phishing links or malicious URLs
- Use deceptive sender ID

---

## 9. Bulk SMS Limits and Controls

- **Standard limit:** Up to 10 recipients per message campaign without HIL approval
- **HIL required:** Any campaign > 10 recipients requires your explicit approval via SMS confirmation
- **Daily limit:** 100 outbound SMS per account per day (Basic plan), 500 (Pro plan)
- **Rate limiting:** Maximum 1 SMS per customer per hour to prevent harassment

---

## 10. Record Retention

TitanCrew retains the following records for TCPA compliance:

| Record | Retention |
|--------|----------|
| Opt-out requests and timestamps | 7 years |
| Consent records | 7 years |
| Message logs (body + metadata) | 2 years |
| A2P registration documentation | Duration + 3 years |
| HELP/STOP response logs | 7 years |

---

## 11. Your Compliance Obligations

While TitanCrew provides technical compliance infrastructure, **you remain legally responsible** for:

- Ensuring all customers you add to TitanCrew provided their phone number voluntarily
- Obtaining and documenting prior express written consent for marketing messages
- Completing A2P 10DLC registration for your messaging program
- Consulting with legal counsel if you send more than 500 SMS/month or operate in California
- Maintaining your own opt-out suppression list as a backup
- Promptly notifying TitanCrew of any customer complaints about unwanted messages

---

## 12. Incident Reporting

If you receive a customer complaint about an unwanted SMS or believe a TCPA violation occurred:

1. Contact compliance@titancrew.ai **immediately**
2. We will pull the audit log for the relevant message
3. We will provide you with delivery confirmation, consent status, and quiet hours check
4. If a violation occurred on our end, we will cover our portion of any legal costs

---

*Questions? Contact: compliance@titancrew.ai*
*TitanCrew, LLC | titancrew.ai/legal/sms-policy*
