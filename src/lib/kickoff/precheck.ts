/* Deterministic pre-dispatch guards (BK-1). Pure — no I/O, no LLM.

   Two gates run before any spend:
   - inputsPrecheck: the case must be complete enough to ground a plan. A thin
     case is refused (422) with the exact fields to fill — never a wasted call.
   - needsPiiConfirm: sensitive free-text requires an explicit send-to-provider
     confirmation before it leaves for the LLM (409 until confirmed). */

import { optLabel, type UseCase } from "../engine";

const has = (v: string) => v.trim().length > 0;
const KNOWN_SHAPES = new Set(["lookup", "classify", "actions", "process", "generate"]);

export interface PrecheckResult {
  ok: boolean;
  missing: { field: string; label: string }[];
}

/** The acceptance bar is the plan's spine; sources/sensitivity/taskShape are the
 *  minimum grounding the planner needs to be case-specific rather than generic. */
export function inputsPrecheck(uc: UseCase): PrecheckResult {
  const missing: { field: string; label: string }[] = [];
  if (!has(uc.acceptanceBar))
    missing.push({ field: "acceptanceBar", label: "a measurable acceptance bar (the plan's spine)" });
  if (!has(uc.dataSources))
    missing.push({ field: "dataSources", label: "named data source(s)" });
  if (!has(uc.dataSensitivity))
    missing.push({ field: "dataSensitivity", label: "data sensitivity" });
  if (!KNOWN_SHAPES.has(uc.taskShape))
    missing.push({ field: "taskShape", label: "a resolvable task shape" });
  return { ok: missing.length === 0, missing };
}

// ponytail: sensitivity flag is the primary PII signal; the regex is a light
// backstop for obviously-sensitive free-text (email / SSN-like / long digit
// runs) when a user left sensitivity unset. Not a DLP engine — a confirm gate.
const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN-shaped
  /\b\d{13,19}\b/, // card/account-length digit run
];

const FREE_TEXT_FIELDS: (keyof UseCase)[] = [
  "problem", "currentCost", "users", "outcome", "dataSources", "compliance",
];

/** True when the case must be explicitly confirmed before dispatch: either the
 *  sensitivity is pii/regulated, or a detector hits the free-text. */
export function needsPiiConfirm(uc: UseCase): boolean {
  if (uc.dataSensitivity === "pii" || uc.dataSensitivity === "regulated") return true;
  const blob = FREE_TEXT_FIELDS.map((f) => String(uc[f] ?? "")).join("\n");
  return PII_PATTERNS.some((re) => re.test(blob));
}

/** Human label for the sensitivity, for the confirm prompt. */
export const sensitivityLabel = (uc: UseCase): string => optLabel("dataSensitivity", uc.dataSensitivity);
