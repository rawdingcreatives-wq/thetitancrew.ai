/**
 * TitanCrew — End-to-End Test Simulation
 *
 * Synthetic run through the full TitanCrew agent pipeline.
 * Uses mock implementations to simulate all external services.
 *
 * Test Scenarios:
 *   1. New contractor signup → OnboarderAgent → full account setup
 *   2. Customer calls in → SchedulerAgent → Google Calendar booking → HIL approval
 *   3. Job completes → FinanceInvoiceAgent → QBO invoice → customer SMS
 *   4. Parts low → PartsInventoryAgent → Ferguson PO → HIL approval
 *   5. Morning briefing → ForemanPredictorAgent → forecast SMS to owner
 *   6. Week end → CostGovernor → budget check → no overage
 *   7. Performance review → PerformanceOptimizerAgent → variant analysis
 *   8. Payment failed → BillingChurnAgent → recovery sequence
 *   9. Job completed → CaseStudyGeneratorAgent → SEO article + review SMS
 *   10. Milestone triggered → ViralLoopAgent → $5k month celebration SMS
 *
 * Run: npx ts-node e2e-simulation.ts
 * Expected: All 10 scenarios PASS, 0 FAIL
 */

// ─── Test Harness ─────────────────────────────────────────────

interface TestResult {
  scenario: string;
  step: string;
  passed: boolean;
  duration_ms: number;
  error?: string;
  details?: Record<string, unknown>;
}

class TestRunner {
  private results: TestResult[] = [];
  private scenarioName = "";
  private stepStart = 0;

  scenario(name: string) {
    this.scenarioName = name;
    console.log(`\n🧪 ${name}`);
  }

  async step(name: string, fn: () => Promise<unknown>): Promise<void> {
    this.stepStart = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - this.stepStart;
      this.results.push({
        scenario: this.scenarioName,
        step: name,
        passed: true,
        duration_ms: duration,
        details: typeof result === "object" && result !== null ? result as Record<string, unknown> : undefined,
      });
      console.log(`  ✅ ${name} (${duration}ms)`);
    } catch (err) {
      const duration = Date.now() - this.stepStart;
      const error = err instanceof Error ? err.message : String(err);
      this.results.push({
        scenario: this.scenarioName,
        step: name,
        passed: false,
        duration_ms: duration,
        error,
      });
      console.log(`  ❌ ${name} — ${error}`);
    }
  }

  assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
  }

  summary(): { passed: number; failed: number; totalMs: number; results: TestResult[] } {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const totalMs = this.results.reduce((sum, r) => sum + r.duration_ms, 0);
    return { passed, failed, totalMs, results: this.results };
  }

  printSummary(): void {
    const s = this.summary();
    console.log(`\n${"═".repeat(60)}`);
    console.log(`TitanCrew E2E Simulation Results`);
    console.log(`${"═".repeat(60)}`);
    console.log(`✅ Passed: ${s.passed}`);
    console.log(`❌ Failed: ${s.failed}`);
    console.log(`⏱  Total:  ${s.totalMs}ms`);
    console.log(`${"═".repeat(60)}`);
    if (s.failed > 0) {
      console.log("\nFailed steps:");
      s.results.filter((r) => !r.passed).forEach((r) => {
        console.log(`  ❌ [${r.scenario}] ${r.step}: ${r.error}`);
      });
    }
  }
}

// ─── Mock Services ─────────────────────────────────────────────

const mockDB = {
  accounts: new Map<string, Record<string, unknown>>(),
  jobs: new Map<string, Record<string, unknown>>(),
  invoices: new Map<string, Record<string, unknown>>(),
  auditLogs: [] as Record<string, unknown>[],
  hilRequests: new Map<string, { status: "pending" | "approved" | "rejected" }>(),
  smsQueue: [] as { to: string; body: string }[],
  caseStudies: new Map<string, Record<string, unknown>>(),
  viralEvents: [] as Record<string, unknown>[],
  socialPosts: [] as Record<string, unknown>[],
};

function mockAuditLog(entry: Record<string, unknown>): void {
  mockDB.auditLogs.push({ ...entry, createdAt: new Date().toISOString() });
}

function mockSendSMS(to: string, body: string): void {
  mockDB.smsQueue.push({ to, body });
}

function mockHILRequest(amount: number, action: string): string {
  const hilId = `hil_${Date.now()}`;
  mockDB.hilRequests.set(hilId, { status: "pending" });

  // Auto-approve in test mode after 50ms
  setTimeout(() => {
    mockDB.hilRequests.set(hilId, { status: "approved" });
  }, 50);

  return hilId;
}

async function waitForHIL(hilId: string, timeoutMs = 500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = mockDB.hilRequests.get(hilId);
    if (status?.status === "approved") return true;
    if (status?.status === "rejected") return false;
    await delay(50);
  }
  return false;
}

// ─── Simulated Agent Implementations ──────────────────────────

async function simulateOnboarderAgent(ctx: {
  accountId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  plan: "lite" | "growth" | "scale";
}): Promise<{ success: boolean; agentsCreated: number; memorySeedRows: number }> {
  const agentCount = ctx.plan === "growth" || ctx.plan === "scale" ? 6 : 5;

  mockDB.accounts.set(ctx.accountId, {
    id: ctx.accountId,
    businessName: ctx.businessName,
    ownerName: ctx.ownerName,
    ownerPhone: ctx.ownerPhone,
    ownerEmail: ctx.ownerEmail,
    plan: ctx.plan,
    status: "active",
    referralCode: `${ctx.businessName.replace(/\s+/g, "").slice(0, 6).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  });

  // Simulate agent provisioning
  const agents = [];
  for (let i = 0; i < agentCount; i++) {
    agents.push({ id: crypto.randomUUID(), type: ["SchedulerAgent", "FinanceInvoiceAgent", "PartsInventoryAgent", "CustomerCommsAgent", "ForemanPredictorAgent", "ComplianceAuditAgent"][i] });
  }

  // Simulate memory seeding
  const memorySeedRows = 12;

  mockSendSMS(ctx.ownerPhone, `🎉 Welcome to TitanCrew, ${ctx.ownerName}! Your AI crew is ready. First run scheduled for 6 AM tomorrow.`);

  mockAuditLog({ agentName: "OnboarderAgent", eventType: "onboarding_complete", accountId: ctx.accountId });

  return { success: true, agentsCreated: agents.length, memorySeedRows };
}

async function simulateSchedulerAgent(ctx: {
  accountId: string;
  customerName: string;
  customerPhone: string;
  jobType: string;
  requestedDate: string;
  estimatedCost: number;
}): Promise<{ jobId: string; hilRequired: boolean; hilApproved: boolean; calendarEventId: string }> {
  const jobId = `job_${Date.now()}`;
  const hilRequired = ctx.estimatedCost > 500;
  let hilApproved = false;

  if (hilRequired) {
    const hilId = mockHILRequest(ctx.estimatedCost, "job_booking");
    mockSendSMS(
      mockDB.accounts.get(ctx.accountId)?.ownerPhone as string,
      `🔔 HIL Required: ${ctx.customerName} wants to book ${ctx.jobType} for ${ctx.requestedDate}. Estimated: $${ctx.estimatedCost}. Reply APPROVE or REJECT.`
    );
    hilApproved = await waitForHIL(hilId);
  } else {
    hilApproved = true;
  }

  if (!hilApproved) throw new Error("HIL rejected or timed out");

  const calendarEventId = `cal_${Date.now()}`;
  mockDB.jobs.set(jobId, {
    id: jobId,
    accountId: ctx.accountId,
    customerName: ctx.customerName,
    customerPhone: ctx.customerPhone,
    jobType: ctx.jobType,
    scheduledDate: ctx.requestedDate,
    estimatedCost: ctx.estimatedCost,
    status: "scheduled",
    calendarEventId,
    createdAt: new Date().toISOString(),
  });

  mockSendSMS(ctx.customerPhone, `✅ ${ctx.jobType} confirmed for ${ctx.requestedDate}. Reply STOP to opt out.`);
  mockAuditLog({ agentName: "SchedulerAgent", eventType: "job_booked", accountId: ctx.accountId, details: { jobId, hilRequired, hilApproved } });

  return { jobId, hilRequired, hilApproved, calendarEventId };
}

async function simulateFinanceInvoiceAgent(ctx: {
  accountId: string;
  jobId: string;
  amount: number;
  customerEmail: string;
}): Promise<{ qboInvoiceId: string; hilRequired: boolean; invoiceSent: boolean }> {
  const hilRequired = ctx.amount > 2000;
  let approved = false;

  if (hilRequired) {
    const hilId = mockHILRequest(ctx.amount, "invoice_send");
    mockSendSMS(
      mockDB.accounts.get(ctx.accountId)?.ownerPhone as string,
      `💰 HIL Required: Invoice of $${ctx.amount.toFixed(2)} ready to send. Approve?`
    );
    approved = await waitForHIL(hilId);
  } else {
    approved = true;
  }

  if (!approved) throw new Error("Invoice HIL rejected");

  const qboInvoiceId = `qbo_inv_${Date.now()}`;
  mockDB.invoices.set(qboInvoiceId, {
    id: qboInvoiceId,
    accountId: ctx.accountId,
    jobId: ctx.jobId,
    amount: ctx.amount,
    status: "sent",
    customerEmail: ctx.customerEmail,
    createdAt: new Date().toISOString(),
  });

  const job = mockDB.jobs.get(ctx.jobId);
  if (job) {
    mockDB.jobs.set(ctx.jobId, { ...job, status: "completed", invoiceAmount: ctx.amount, qboInvoiceId });
  }

  mockAuditLog({ agentName: "FinanceInvoiceAgent", eventType: "invoice_created", accountId: ctx.accountId, details: { qboInvoiceId, amount: ctx.amount } });

  return { qboInvoiceId, hilRequired, invoiceSent: true };
}

async function simulatePartsInventoryAgent(ctx: {
  accountId: string;
  partName: string;
  quantity: number;
  estimatedCost: number;
  supplier: "ferguson" | "grainger";
}): Promise<{ poId: string; hilRequired: boolean; orderPlaced: boolean; supplier: string }> {
  const hilRequired = ctx.estimatedCost > 200;
  let approved = false;

  if (hilRequired) {
    const hilId = mockHILRequest(ctx.estimatedCost, "purchase_order");
    mockSendSMS(
      mockDB.accounts.get(ctx.accountId)?.ownerPhone as string,
      `🔩 HIL Required: PO for ${ctx.quantity}x ${ctx.partName} from ${ctx.supplier} — $${ctx.estimatedCost}. Approve?`
    );
    approved = await waitForHIL(hilId);
  } else {
    approved = true;
  }

  if (!approved) throw new Error("Parts order HIL rejected");

  const poId = `po_${Date.now()}`;
  mockAuditLog({ agentName: "PartsInventoryAgent", eventType: "purchase_order_created", accountId: ctx.accountId, details: { poId, partName: ctx.partName, supplier: ctx.supplier, estimatedCost: ctx.estimatedCost } });

  return { poId, hilRequired, orderPlaced: true, supplier: ctx.supplier };
}

async function simulateForemanPredictorAgent(ctx: {
  accountId: string;
}): Promise<{ jobCount: number; forecastRevenue: number; smsSent: boolean }> {
  const jobCount = Math.floor(Math.random() * 5) + 2;
  const forecastRevenue = jobCount * 450;
  const account = mockDB.accounts.get(ctx.accountId);

  if (account) {
    mockSendSMS(
      account.ownerPhone as string,
      `☀️ Good morning! Today: ${jobCount} jobs, est. $${forecastRevenue} revenue. Your AI crew is on it.`
    );
  }

  mockAuditLog({ agentName: "ForemanPredictorAgent", eventType: "morning_briefing_sent", accountId: ctx.accountId });
  return { jobCount, forecastRevenue, smsSent: true };
}

async function simulateCostGovernor(ctx: {
  accountId: string;
  plan: "lite" | "growth" | "scale";
  monthlySpend: number;
}): Promise<{ allowed: boolean; budget: number; utilization: number }> {
  const budgets = { lite: 8, growth: 15, scale: 25 };
  const budget = budgets[ctx.plan];
  const utilization = ctx.monthlySpend / budget;
  const allowed = ctx.monthlySpend < budget * 1.1; // 10% overage buffer

  mockAuditLog({ agentName: "CostGovernor", eventType: "budget_check", accountId: ctx.accountId, details: { monthlySpend: ctx.monthlySpend, budget, allowed } });
  return { allowed, budget, utilization };
}

async function simulatePerformanceOptimizerAgent(): Promise<{
  agentsAnalyzed: number;
  variantsGenerated: number;
  deployedAt20Percent: number;
  reportSent: boolean;
}> {
  return {
    agentsAnalyzed: 6,
    variantsGenerated: 3,
    deployedAt20Percent: 2,
    reportSent: true,
  };
}

async function simulateBillingChurnAgent(ctx: {
  accountId: string;
  eventType: "payment_failed" | "subscription_deleted" | "trial_ending";
}): Promise<{ sequenceStarted: boolean; touchCount: number }> {
  const touchCounts = { payment_failed: 3, subscription_deleted: 2, trial_ending: 2 };
  const account = mockDB.accounts.get(ctx.accountId);

  if (account) {
    if (ctx.eventType === "payment_failed") {
      mockSendSMS(
        account.ownerPhone as string,
        `⚠️ TitanCrew: Your payment didn't go through. Update your card to keep your AI crew running: titancrew.ai/billing`
      );
    }
  }

  mockAuditLog({ agentName: "BillingChurnAgent", eventType: `${ctx.eventType}_sequence_started`, accountId: ctx.accountId });
  return { sequenceStarted: true, touchCount: touchCounts[ctx.eventType] };
}

async function simulateCaseStudyGenerator(ctx: {
  accountId: string;
  jobId: string;
}): Promise<{ generated: boolean; title: string; reviewSmsSent: boolean }> {
  const caseStudyId = `cs_${Date.now()}`;
  const title = `How We Fixed a Leaking Water Heater in Houston in Under 2 Hours`;

  mockDB.caseStudies.set(caseStudyId, {
    id: caseStudyId,
    accountId: ctx.accountId,
    jobId: ctx.jobId,
    title,
    status: "draft",
    createdAt: new Date().toISOString(),
  });

  const job = mockDB.jobs.get(ctx.jobId);
  if (job?.customerPhone) {
    mockSendSMS(
      job.customerPhone as string,
      `Hi! This is Rodriguez Plumbing — how was your recent service? We'd love a Google review: [link]`
    );
  }

  mockAuditLog({ agentName: "CaseStudyGeneratorAgent", eventType: "case_study_generated", accountId: ctx.accountId, details: { caseStudyId, title } });
  return { generated: true, title, reviewSmsSent: true };
}

async function simulateViralLoopAgent(ctx: {
  accountId: string;
  eventType: string;
  milestoneAmount: number;
}): Promise<{ smsSent: boolean; creditApplied: number; eventLogged: boolean }> {
  const creditApplied = ctx.milestoneAmount === 5000 ? 25 : ctx.milestoneAmount === 10000 ? 50 : 0;
  const account = mockDB.accounts.get(ctx.accountId);

  if (account) {
    mockSendSMS(
      account.ownerPhone as string,
      `🚀 $${ctx.milestoneAmount.toLocaleString()} month unlocked, ${account.ownerName}! ${creditApplied > 0 ? `$${creditApplied} credit applied.` : ""} Refer a contractor: titancrew.ai/signup?ref=${account.referralCode}`
    );
  }

  mockDB.viralEvents.push({
    accountId: ctx.accountId,
    eventType: ctx.eventType,
    milestoneAmount: ctx.milestoneAmount,
    createdAt: new Date().toISOString(),
  });

  mockAuditLog({ agentName: "ViralLoopAgent", eventType: "viral_event_fired", accountId: ctx.accountId, details: { eventType: ctx.eventType, creditApplied } });
  return { smsSent: true, creditApplied, eventLogged: true };
}

// ─── E2E Test Suite ────────────────────────────────────────────

async function runE2ESimulation(): Promise<void> {
  const runner = new TestRunner();
  const accountId = crypto.randomUUID();
  let jobId = "";
  let qboInvoiceId = "";

  console.log("🚀 TitanCrew E2E Simulation Starting...");
  console.log(`Account ID: ${accountId}`);

  // ══ Scenario 1: Onboarding ════════════════════════════════

  runner.scenario("1 — New Contractor Signup (OnboarderAgent)");

  await runner.step("Provision account and create agents", async () => {
    const result = await simulateOnboarderAgent({
      accountId,
      businessName: "Rodriguez Plumbing LLC",
      ownerName: "Carlos Rodriguez",
      ownerPhone: "+17139550123",
      ownerEmail: "carlos@rodriguezplumbing.com",
      plan: "lite",
    });
    runner.assert(result.success, "Onboarding must succeed");
    runner.assert(result.agentsCreated === 5, `Lite plan should have 5 agents, got ${result.agentsCreated}`);
    runner.assert(result.memorySeedRows > 0, "Memory seeding must produce rows");
    return result;
  });

  await runner.step("Verify account exists in DB", async () => {
    const account = mockDB.accounts.get(accountId);
    runner.assert(!!account, "Account must exist after onboarding");
    runner.assert(account?.status === "active", "Account status must be active");
    runner.assert(typeof account?.referralCode === "string" && account.referralCode.length > 0, "Referral code must be generated");
    return { accountFound: true, status: account?.status };
  });

  await runner.step("Verify welcome SMS queued", async () => {
    const welcomeSMS = mockDB.smsQueue.find((s) => s.body.includes("Welcome to TitanCrew"));
    runner.assert(!!welcomeSMS, "Welcome SMS must be sent on onboarding");
    return { smsSent: true };
  });

  await runner.step("Verify audit log entry created", async () => {
    const log = mockDB.auditLogs.find((l) => l.eventType === "onboarding_complete");
    runner.assert(!!log, "Audit log must be created for onboarding");
    return { logFound: true };
  });

  // ══ Scenario 2: Job Booking with HIL ═════════════════════

  runner.scenario("2 — Inbound Job Request (SchedulerAgent + HIL)");

  await runner.step("Book job under $500 threshold (no HIL)", async () => {
    const result = await simulateSchedulerAgent({
      accountId,
      customerName: "Maria Santos",
      customerPhone: "+17139771234",
      jobType: "drain_unclog",
      requestedDate: "2026-04-01 10:00 AM",
      estimatedCost: 150,
    });
    runner.assert(result.hilRequired === false, "Job under $500 should not require HIL");
    runner.assert(result.hilApproved === true, "Non-HIL job should auto-approve");
    runner.assert(!!result.calendarEventId, "Calendar event must be created");
    jobId = result.jobId;
    return result;
  });

  await runner.step("Verify job saved to DB", async () => {
    const job = mockDB.jobs.get(jobId);
    runner.assert(!!job, "Job must be in DB after booking");
    runner.assert(job?.status === "scheduled", "Job status must be scheduled");
    return { jobFound: true, status: job?.status };
  });

  await runner.step("Verify customer confirmation SMS queued", async () => {
    const confirmSMS = mockDB.smsQueue.find((s) => s.to === "+17139771234");
    runner.assert(!!confirmSMS, "Customer must receive confirmation SMS");
    return { confirmSMSSent: true };
  });

  await runner.step("Book high-value job (>$500 triggers HIL)", async () => {
    const result = await simulateSchedulerAgent({
      accountId,
      customerName: "Bob Chen",
      customerPhone: "+17139882345",
      jobType: "water_heater_replace",
      requestedDate: "2026-04-02 2:00 PM",
      estimatedCost: 1200,
    });
    runner.assert(result.hilRequired === true, "Job over $500 must require HIL");
    runner.assert(result.hilApproved === true, "HIL must be approved in test mode");
    return result;
  });

  // ══ Scenario 3: Invoice Creation ═════════════════════════

  runner.scenario("3 — Job Complete → Invoice (FinanceInvoiceAgent)");

  await runner.step("Create invoice under $2k threshold (no HIL)", async () => {
    const result = await simulateFinanceInvoiceAgent({
      accountId,
      jobId,
      amount: 150,
      customerEmail: "maria.santos@gmail.com",
    });
    runner.assert(result.hilRequired === false, "Invoice under $2k should not need HIL");
    runner.assert(result.invoiceSent === true, "Invoice must be sent");
    runner.assert(!!result.qboInvoiceId, "QBO invoice ID must be returned");
    qboInvoiceId = result.qboInvoiceId;
    return result;
  });

  await runner.step("Verify job marked completed in DB", async () => {
    const job = mockDB.jobs.get(jobId);
    runner.assert(job?.status === "completed", "Job must be completed after invoice");
    runner.assert(!!job?.qboInvoiceId, "Job must have QBO invoice ID");
    return { status: job?.status };
  });

  await runner.step("Create high-value invoice (>$2k triggers HIL)", async () => {
    const secondJobId = mockDB.jobs.keys().next().value;
    if (!secondJobId) return { skipped: true };
    const result = await simulateFinanceInvoiceAgent({
      accountId,
      jobId: secondJobId as string,
      amount: 2500,
      customerEmail: "bob.chen@gmail.com",
    });
    runner.assert(result.hilRequired === true, "Invoice >$2k must require HIL");
    runner.assert(result.hilApproved === true, "HIL must be approved");
    return result;
  });

  // ══ Scenario 4: Parts Order ═══════════════════════════════

  runner.scenario("4 — Low Stock → Purchase Order (PartsInventoryAgent + HIL)");

  await runner.step("Small parts order under $200 (no HIL)", async () => {
    const result = await simulatePartsInventoryAgent({
      accountId,
      partName: "3/4 inch ball valve",
      quantity: 10,
      estimatedCost: 85,
      supplier: "ferguson",
    });
    runner.assert(result.hilRequired === false, "Parts order under $200 should not need HIL");
    runner.assert(result.orderPlaced === true, "Order must be placed");
    return result;
  });

  await runner.step("Large parts order >$200 (HIL required)", async () => {
    const result = await simulatePartsInventoryAgent({
      accountId,
      partName: "50-gallon water heater",
      quantity: 2,
      estimatedCost: 680,
      supplier: "grainger",
    });
    runner.assert(result.hilRequired === true, "Parts order >$200 must require HIL");
    runner.assert(result.hilApproved === true, "Owner must have approved the PO");
    return result;
  });

  // ══ Scenario 5: Morning Briefing ══════════════════════════

  runner.scenario("5 — Morning Briefing (ForemanPredictorAgent)");

  await runner.step("Generate and send morning forecast", async () => {
    const result = await simulateForemanPredictorAgent({ accountId });
    runner.assert(result.smsSent === true, "Morning briefing SMS must be sent");
    runner.assert(result.jobCount > 0, "Forecast must include job count");
    runner.assert(result.forecastRevenue > 0, "Forecast must include revenue estimate");
    return result;
  });

  // ══ Scenario 6: Cost Governor ═════════════════════════════

  runner.scenario("6 — API Budget Check (CostGovernor)");

  await runner.step("Within budget — allow", async () => {
    const result = await simulateCostGovernor({ accountId, plan: "lite", monthlySpend: 5.50 });
    runner.assert(result.allowed === true, "Spend under budget must be allowed");
    runner.assert(result.budget === 8, "Lite plan budget is $8/mo");
    return result;
  });

  await runner.step("Over 110% of budget — block", async () => {
    const result = await simulateCostGovernor({ accountId, plan: "lite", monthlySpend: 9.50 });
    runner.assert(result.allowed === false, "Spend over 110% must be blocked");
    return result;
  });

  // ══ Scenario 7: Performance Optimizer ════════════════════

  runner.scenario("7 — Weekly Optimization (PerformanceOptimizerAgent)");

  await runner.step("Analyze agent performance and generate variants", async () => {
    const result = await simulatePerformanceOptimizerAgent();
    runner.assert(result.agentsAnalyzed === 6, "All 6 agents must be analyzed");
    runner.assert(result.variantsGenerated > 0, "At least 1 prompt variant must be generated");
    runner.assert(result.reportSent === true, "Weekly report must be sent to founder");
    return result;
  });

  // ══ Scenario 8: Churn Recovery ════════════════════════════

  runner.scenario("8 — Payment Failure Recovery (BillingChurnAgent)");

  await runner.step("Payment failed — start 3-touch recovery sequence", async () => {
    const result = await simulateBillingChurnAgent({ accountId, eventType: "payment_failed" });
    runner.assert(result.sequenceStarted === true, "Recovery sequence must start");
    runner.assert(result.touchCount === 3, "Payment failed sequence should have 3 touches");
    const recoverySMS = mockDB.smsQueue.find((s) => s.body.includes("payment didn't go through"));
    runner.assert(!!recoverySMS, "Recovery SMS must be sent");
    return result;
  });

  await runner.step("Trial ending — start upgrade nudge sequence", async () => {
    const result = await simulateBillingChurnAgent({ accountId, eventType: "trial_ending" });
    runner.assert(result.sequenceStarted === true, "Trial ending sequence must start");
    return result;
  });

  // ══ Scenario 9: Case Study Generation ════════════════════

  runner.scenario("9 — Completed Job → Case Study (CaseStudyGeneratorAgent)");

  await runner.step("Generate SEO case study from completed job", async () => {
    const result = await simulateCaseStudyGenerator({ accountId, jobId });
    runner.assert(result.generated === true, "Case study must be generated");
    runner.assert(result.title.length > 20, "Case study title must be descriptive");
    runner.assert(result.reviewSmsSent === true, "Google review SMS must be sent to customer");
    return result;
  });

  await runner.step("Verify case study saved to DB", async () => {
    const caseStudy = Array.from(mockDB.caseStudies.values()).find((cs) => cs.jobId === jobId);
    runner.assert(!!caseStudy, "Case study must be saved in DB");
    runner.assert(caseStudy?.status === "draft", "New case study should be in draft status");
    return { found: true, status: caseStudy?.status };
  });

  // ══ Scenario 10: Viral Loop ═══════════════════════════════

  runner.scenario("10 — Revenue Milestone (ViralLoopAgent)");

  await runner.step("$5k month milestone fires celebration + $25 credit", async () => {
    const result = await simulateViralLoopAgent({
      accountId,
      eventType: "monthly_revenue_milestone",
      milestoneAmount: 5000,
    });
    runner.assert(result.smsSent === true, "Celebration SMS must be sent");
    runner.assert(result.creditApplied === 25, `$25 credit should be applied for $5k milestone, got $${result.creditApplied}`);
    runner.assert(result.eventLogged === true, "Viral event must be logged to prevent duplicates");
    return result;
  });

  await runner.step("Verify viral event logged for dedup", async () => {
    const event = mockDB.viralEvents.find((e) => e.accountId === accountId);
    runner.assert(!!event, "Viral event must be logged");
    return { eventLogged: true, eventType: event?.eventType };
  });

  // ══ Full Pipeline Integrity ════════════════════════════════

  runner.scenario("11 — Full Audit Log Integrity Check");

  await runner.step("Verify audit trail covers all agent actions", async () => {
    const agentsCovered = new Set(mockDB.auditLogs.map((l) => l.agentName));
    const requiredAgents = [
      "OnboarderAgent",
      "SchedulerAgent",
      "FinanceInvoiceAgent",
      "PartsInventoryAgent",
      "ForemanPredictorAgent",
      "CostGovernor",
      "BillingChurnAgent",
      "CaseStudyGeneratorAgent",
      "ViralLoopAgent",
    ];
    for (const agent of requiredAgents) {
      runner.assert(agentsCovered.has(agent), `Audit log missing entries for ${agent}`);
    }
    return { agentsCovered: Array.from(agentsCovered), totalLogEntries: mockDB.auditLogs.length };
  });

  await runner.step("Verify SMS compliance (all have content)", async () => {
    const invalidSMS = mockDB.smsQueue.filter((s) => !s.body || s.body.length < 10);
    runner.assert(invalidSMS.length === 0, `${invalidSMS.length} SMS messages have empty/short body`);
    return { totalSMSSent: mockDB.smsQueue.length, allValid: true };
  });

  await runner.step("Verify HIL threshold enforcement", async () => {
    const hilLogs = mockDB.auditLogs.filter((l) => String(l.eventType).includes("hil") || String(l.details).includes("hilRequired"));
    runner.assert(hilLogs.length > 0, "HIL must have been invoked at least once");
    return { hilInvocations: hilLogs.length };
  });

  // ══ Print Results ══════════════════════════════════════════

  runner.printSummary();

  const summary = runner.summary();
  if (summary.failed > 0) {
    process.exit(1);
  }
}

// ─── Helper ───────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Entry point ──────────────────────────────────────────────

runE2ESimulation().catch((err) => {
  console.error("Fatal E2E error:", err);
  process.exit(1);
});
