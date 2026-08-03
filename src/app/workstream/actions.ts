"use server";

// Server actions for the local-first Workstream Brief flow (task #22, Phase B).
//
// EVERY action calls assertLocalWorkstreams() FIRST. In hosted Production the local
// flag is unset, so these fail closed and a private evidence bundle can never be
// processed on the server. The bundle is parsed and turned into a brief entirely
// in-process; nothing is persisted server-side or forwarded anywhere.

import { assertLocalWorkstreams, HostedModeError } from "@/lib/workstream/local-mode";
import {
  preflightBundle,
  generateBrief,
  correctBrief,
  type PreflightResult,
  type BriefResult,
  type CorrectionResult,
} from "@/lib/workstream/engine";
import type { CorrectionInput } from "@/lib/workstream/types";

function parseBundle(raw: string): { ok: true; bundle: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, bundle: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `Bundle is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Preflight a pasted/uploaded bundle: coverage, exclusions, freshness, validation failures. */
export async function preflightAction(rawBundle: string): Promise<PreflightResult> {
  try {
    assertLocalWorkstreams();
  } catch (e) {
    if (e instanceof HostedModeError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = parseBundle(rawBundle);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return preflightBundle(parsed.bundle);
}

/** Generate the trusted brief from a pasted/uploaded bundle (runs the full integrity gate). */
export async function generateBriefAction(rawBundle: string): Promise<BriefResult> {
  try {
    assertLocalWorkstreams();
  } catch (e) {
    if (e instanceof HostedModeError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = parseBundle(rawBundle);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return generateBrief(parsed.bundle);
}

/** Apply a correction, producing an immutable linked successor checkpoint. */
export async function correctBriefAction(
  rawBundle: string,
  correction: CorrectionInput,
): Promise<CorrectionResult> {
  try {
    assertLocalWorkstreams();
  } catch (e) {
    if (e instanceof HostedModeError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = parseBundle(rawBundle);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return correctBrief(parsed.bundle, correction);
}
