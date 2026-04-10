# Runbook: Agent Queue Stalled

## Symptoms
- Scheduled agent runs not executing (no new `agent_runs` rows)
- Growth tasks piling up in `growth_task_queue` with no processing
- Customer-facing automations (scheduling, invoicing) not firing
- Owner reports AI crew is "stuck" or "nothing is happening"

## Likely Causes
1. **Agent service crashed** — the Railway/Fly.io process hosting agents is down
2. **Supabase connection exhausted** — agent pool ran out of connections
3. **Kill switch active** — `KILL_AGENT_TRIGGERS=true` or `KILL_GROWTH_AUTOMATIONS=true` set
4. **CostGovernor budget exceeded** — account or agent hit monthly/daily budget cap
5. **Missing env vars** — `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `AGENT_API_URL` not set

## How to Verify

### Step 1 — Dashboard health (what it CAN tell you)
`GET /api/health?deep=1` checks:
- **Supabase connectivity** and query latency
- **Required env vars** present (SUPABASE, ANTHROPIC, STRIPE keys)
- **Kill switches** active status

It does **NOT** inspect queue depth, agent heartbeats, or agent run recency.
Use it to rule out infrastructure-level problems before digging into agent state.

### Step 2 — Check kill switches
Look at the health response `killSwitches.active` array, or check env vars directly:
```sh
echo $KILL_AGENT_TRIGGERS
echo $KILL_GROWTH_AUTOMATIONS
```

### Step 3 — Query queue depth directly in Supabase
```sql
SELECT status, count(*) FROM growth_task_queue GROUP BY status;
```
A growing `pending` count with zero `processing` or `completed` rows indicates the agent service is not picking up work.

### Step 4 — Check recent agent runs
```sql
SELECT agent_type, status, created_at
FROM agent_runs
ORDER BY created_at DESC
LIMIT 20;
```
If the most recent row is hours old, the agent service likely isn't running.

### Step 5 — Check agent instance status
```sql
SELECT id, account_id, agent_type, status, updated_at
FROM agent_instances
WHERE status IN ('running', 'waiting_human', 'error')
ORDER BY updated_at DESC
LIMIT 20;
```
- `waiting_human` rows → agents blocked on HIL approval (see hil-backlog.md)
- `error` rows → agents that crashed mid-run

### Step 6 — Check CostGovernor logs
Filter agent service logs for `budget_exceeded` or `cost_limit` events. Budget caps per plan: lite = $2/mo, growth = $15/mo, scale = $40/mo.

## Mitigation Steps
1. **If agent service is down**: Check Railway/Fly.io dashboard, restart the service
2. **If kill switch is on**: Unset the relevant env var (`KILL_AGENT_TRIGGERS` or `KILL_GROWTH_AUTOMATIONS`), redeploy
3. **If budget exceeded**: Check `PLAN_BUDGETS` in `CostGovernor.ts`. If the usage is legitimate, wait for the next billing cycle or manually adjust the cap.
4. **If connection pool exhausted**: Restart agent service to release connections
5. **If env vars missing**: Check `GET /api/health?deep=1` → `checks.envRequired` for the specific missing vars
6. **If agents stuck in `waiting_human`**: Follow the hil-backlog.md runbook to resolve pending HIL confirmations

## Logs to Check
- Agent service logs (Railway/Fly.io dashboard)
- Dashboard structured logs: filter by `service: "agent-trigger"` for trigger failures
- Dashboard structured logs: filter by `event: "action_blocked"` for kill-switch-blocked actions
- Supabase: `agent_runs`, `agent_instances`, and `growth_task_queue` tables

## Kill Switches
- `KILL_AGENT_TRIGGERS=true` — stops all agent triggering from dashboard API
- `KILL_GROWTH_AUTOMATIONS=true` — stops growth/meta-swarm scheduled flows (social posting, case studies, viral scans, growth reports)
