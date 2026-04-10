/**
 * TitanCrew · Agent-side Kill Switches
 *
 * Same env-var contract as the dashboard kill-switches module.
 * Agent processes read the same env vars, so flipping a switch blocks
 * both the dashboard API paths AND the agent-side automation paths.
 *
 * Env vars:
 *   KILL_OUTBOUND_SMS=true        — blocks all Twilio SMS sends
 *   KILL_OUTBOUND_EMAIL=true      — blocks all SendGrid email sends
 *   KILL_AGENT_TRIGGERS=true      — blocks agent auto-triggering
 *   KILL_GROWTH_AUTOMATIONS=true  — blocks growth/meta-swarm scheduled flows
 */

import { createLogger } from "./logger";

const log = createLogger("kill-switch");

export type KillSwitchName =
  | "KILL_OUTBOUND_SMS"
  | "KILL_OUTBOUND_EMAIL"
  | "KILL_AGENT_TRIGGERS"
  | "KILL_GROWTH_AUTOMATIONS";

export function isKilled(switchName: KillSwitchName): boolean {
  return process.env[switchName] === "true";
}

/**
 * Guard an agent code path. Returns true if the switch is active (action should be blocked).
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
