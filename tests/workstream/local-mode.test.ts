import { afterEach, describe, expect, it } from "vitest";

import {
  assertLocalWorkstreams,
  isLocalWorkstreamsEnabled,
  HostedModeError,
  LOCAL_WORKSTREAMS_ENV,
} from "@/lib/workstream/local-mode";

// The Workstream Brief flow ingests private evidence and must be local-first. These
// tests pin the fail-closed contract (task #22, PM constraint 1): the hosted server
// (flag unset) can NEVER accept a bundle.
describe("local-mode gate", () => {
  const original = process.env[LOCAL_WORKSTREAMS_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[LOCAL_WORKSTREAMS_ENV];
    else process.env[LOCAL_WORKSTREAMS_ENV] = original;
  });

  it("is disabled by default (hosted mode)", () => {
    delete process.env[LOCAL_WORKSTREAMS_ENV];
    expect(isLocalWorkstreamsEnabled()).toBe(false);
    expect(() => assertLocalWorkstreams()).toThrow(HostedModeError);
  });

  it("stays disabled for any value other than exactly '1'", () => {
    for (const v of ["", "0", "true", "yes", "2", " 1", "1 "]) {
      process.env[LOCAL_WORKSTREAMS_ENV] = v;
      expect(isLocalWorkstreamsEnabled()).toBe(false);
      expect(() => assertLocalWorkstreams()).toThrow(HostedModeError);
    }
  });

  it("is enabled only when the flag is exactly '1'", () => {
    process.env[LOCAL_WORKSTREAMS_ENV] = "1";
    expect(isLocalWorkstreamsEnabled()).toBe(true);
    expect(() => assertLocalWorkstreams()).not.toThrow();
  });

  it("HostedModeError carries a stable code and explains the local-first reason", () => {
    const err = new HostedModeError();
    expect(err.code).toBe("LOCAL_WORKSTREAMS_DISABLED");
    expect(err.message).toMatch(/local-first/i);
    expect(err.message).toContain(LOCAL_WORKSTREAMS_ENV);
  });
});
