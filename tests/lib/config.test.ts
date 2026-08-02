import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  CONFIGURATION_ERROR_CODE,
  ConfigurationError,
  requireEnv,
} from "@/lib/config";
import { getServiceClient } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { POST as joinWaitlist } from "@/app/api/waitlist/route";
import { POST as handleStripeWebhook } from "@/app/api/stripe/webhook/route";

const CONFIG_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

const originalValues = Object.fromEntries(
  CONFIG_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of CONFIG_KEYS) {
    const value = originalValues[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("runtime configuration", () => {
  it("reports the missing environment variable without exposing values", () => {
    delete process.env.STRIPE_SECRET_KEY;

    expect(() => requireEnv("STRIPE_SECRET_KEY")).toThrow(ConfigurationError);
    try {
      requireEnv("STRIPE_SECRET_KEY");
    } catch (error) {
      expect(error).toMatchObject({ missing: ["STRIPE_SECRET_KEY"] });
    }
  });

  it("initializes external clients lazily", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    expect(() => getServiceClient()).toThrow(ConfigurationError);
    expect(() => getStripe()).toThrow(ConfigurationError);
  });

  it("returns a controlled 503 from the waitlist API", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const request = new NextRequest("http://localhost/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email: "person@example.com" }),
      headers: { "content-type": "application/json" },
    });

    const response = await joinWaitlist(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: CONFIGURATION_ERROR_CODE,
      missing: ["NEXT_PUBLIC_SUPABASE_URL"],
    });
  });

  it("returns a controlled 503 from the Stripe webhook API", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const request = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "test-signature" },
    });

    const response = await handleStripeWebhook(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: CONFIGURATION_ERROR_CODE,
      missing: ["STRIPE_WEBHOOK_SECRET"],
    });
  });
});
