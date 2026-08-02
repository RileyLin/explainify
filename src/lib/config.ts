export const CONFIGURATION_ERROR_CODE = "SERVICE_NOT_CONFIGURED";

export class ConfigurationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required configuration: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
    this.missing = missing;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigurationError([name]);
  }
  return value;
}

export function configurationErrorPayload(error: unknown) {
  if (!(error instanceof ConfigurationError)) return null;
  return {
    error: "This service is not configured",
    code: CONFIGURATION_ERROR_CODE,
    missing: error.missing,
  };
}
