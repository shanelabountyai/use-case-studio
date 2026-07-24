/* Feature flag + kill switch for Build Kickoff (BK-1 trigger gate; BK-6 hardens
   telemetry/ceilings around these). Both default OFF — an unset env means the
   whole feature is invisible, which is the P0 launch posture. */

/** The feature is usable only when explicitly enabled AND not killed. */
export const kickoffEnabled = (): boolean =>
  process.env.KICKOFF_ENABLED === "true" && !kickoffKilled();

/** Kill switch: blocks new runs and (in the worker) fails in-flight ones. */
export const kickoffKilled = (): boolean => process.env.KICKOFF_KILL_SWITCH === "true";
