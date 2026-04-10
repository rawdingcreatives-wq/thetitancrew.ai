/**
 * TitanCrew · Operational Kill Switches
 *
 * Simple env-var-based circuit breakers for risky automation paths.
 * During an incident, operators set an env var and restart (or use Vercel
 * dashboard env overrides) to immediately halt outbound actions.
 *
 * Defaults: all switches OFF (normal operation).
 * Set any of these env vars to "true" to BLOCK that path:
 *
 *   KILL_OUTBOUND_SMS=true        — blocks all Twilio SMS sends
 *   KILL_OUTBOUND_EMAIL=true      — blocks all SendGrid email sends
 *   KILL_AGENT_TRIGGERS=true      — blocks agent auto-triggering via API
 *   KILL_GROWTH_AUTOMATIONS=true  — blocks growth/meta-swarm scheduled flows
 *
 * Every blocked action is logged so the team can audit what was prevented.
 */

import { createLogger } from "./logger";

const log = createLogger("kill-switch");

export type KillSwitchName =
  | "KILL_OUTBOUND_SMS"
  | "KILL_OUTBOUND_EMAIL"
  | "KILL_AGENT_TRIGGERS"
  | "KILL_GROWTH_AUTOMATIONS";

/**
 * Check if a kill switch is active.
 * Returns true if the switch is ON (i.e., the action should be BLOCKED).
 */
export function isKilled(switchName: KillSwitchName): boolean {
  return process.env[switchName] === "true";
}

/**
 * Guard a code path with a kill switch.
 * If the switch is active, logs the block and returns true.
 * Callers should return early when this returns true.
 *
 * Usage:
 *   if (guardKillSwitch("KILL_OUTBOUND_SMS", { accountId, event: "sms_send" })) {
 *     return NextResponse.json({ blocked: true, reason: "kill-switch" });
 *   }
 */
export function guardKillSwitch(
  switchName: KillSwitchName,
  context: Record<string, unknown> = {}
): boolean {
  if (!isKilled(switchName)) return false;

  log.warn(
    { event: "action_blocked", killSwitch: switchName, ...context },
    `Kill switch ${switchName} is active — blocking action`
  );
  return true;
}

/**
 * Get the status of all kill switches. Useful for health/admin endpoints.
 */
export function getKillSwitchStatus(): Record<KillSwitchName, boolean> {
  return {
    KILL_OUTBOUND_SMS: isKilled("KILL_OUTBOUND_SMS"),
    KILL_OUTBOUND_EMAIL: isKilled("KILL_OUTBOUND_EMAIL"),
    KILL_AGENT_TRIGGERS: isKilled("KILL_AGENT_TRIGGERS"),
    KILL_GROWTH_AUTOMATIONS: isKilled("KILL_GROWTH_AUTOMATIONS"),
  };
}
