import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const AUTH_ENV_KEYS = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

const originalValues = Object.fromEntries(
  AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function clearProviderEnv() {
  for (const key of AUTH_ENV_KEYS) {
    delete process.env[key];
  }
}

async function loadAuthConfig() {
  vi.resetModules();
  return import("@/lib/auth");
}

function providerIds(
  providers: Awaited<ReturnType<typeof loadAuthConfig>>["authConfig"]["providers"],
) {
  return providers.map((provider) => {
    const config = typeof provider === "function" ? provider() : provider;
    return config.id;
  });
}

afterEach(() => {
  for (const key of AUTH_ENV_KEYS) {
    const value = originalValues[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

describe("Auth.js configuration", () => {
  it("exports callable App Router handlers without provider credentials", async () => {
    clearProviderEnv();

    const { handlers, authConfig } = await loadAuthConfig();
    const route = await import("@/app/api/auth/[...nextauth]/route");

    expect(handlers.GET).toBeTypeOf("function");
    expect(handlers.POST).toBeTypeOf("function");
    expect(route.GET).toBe(handlers.GET);
    expect(route.POST).toBe(handlers.POST);
    expect(providerIds(authConfig.providers)).toEqual([]);
  });

  it("enables only providers with complete credentials", async () => {
    clearProviderEnv();
    process.env.GITHUB_CLIENT_ID = "github-client";
    process.env.GITHUB_CLIENT_SECRET = "github-secret";
    process.env.GOOGLE_CLIENT_ID = "google-client";

    let { authConfig } = await loadAuthConfig();
    expect(providerIds(authConfig.providers)).toEqual(["github"]);

    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    ({ authConfig } = await loadAuthConfig());
    expect(providerIds(authConfig.providers)).toEqual(["github", "google"]);
  });

  it("copies the persisted user id from the token into the session", async () => {
    clearProviderEnv();
    const { authConfig } = await loadAuthConfig();
    const sessionCallback = authConfig.callbacks?.session;

    expect(sessionCallback).toBeTypeOf("function");
    if (typeof sessionCallback !== "function") return;

    const session = {
      user: { id: "", name: "Test User", email: "test@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
    const result = await sessionCallback({
      session,
      token: { userId: "user-123" },
    } as unknown as Parameters<typeof sessionCallback>[0]);

    expect(result).toMatchObject({ user: { id: "user-123" } });
  });
});
