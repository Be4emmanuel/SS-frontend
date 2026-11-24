/**
 * Sandbox credential isolation (#696).
 *
 * Sandbox keys (`ss_test_…`) only ever work against the sandbox. Production
 * keys (`ss_live_…`) are never accepted by it. Both directions are enforced
 * here, and the production API helpers call `assertProductionCredential`, so
 * a sandbox key cannot reach production by mistake.
 */

export const SANDBOX_KEY_PREFIX = "ss_test_";
export const PRODUCTION_KEY_PREFIX = "ss_live_";
export const SANDBOX_API_BASE = "/api/sandbox";

export class SandboxIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxIsolationError";
  }
}

export function isSandboxKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(SANDBOX_KEY_PREFIX);
}

export function isProductionKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(PRODUCTION_KEY_PREFIX);
}

/** Throw if a sandbox credential is about to be used against production. */
export function assertProductionCredential(token: string | null | undefined): void {
  if (isSandboxKey(token)) {
    throw new SandboxIsolationError(
      "Sandbox credentials cannot be used against production.",
    );
  }
}

/** Throw unless `key` is a sandbox key. */
export function assertSandboxKey(key: string | null | undefined): asserts key is string {
  if (!isSandboxKey(key)) {
    throw new SandboxIsolationError(
      isProductionKey(key)
        ? "Production credentials are not accepted by the sandbox."
        : "A sandbox API key (ss_test_…) is required.",
    );
  }
}

/** A sandbox request may only target the sandbox API base. */
export function assertSandboxTarget(url: string, key: string | null | undefined): void {
  assertSandboxKey(key);
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  if (path !== SANDBOX_API_BASE && !path.startsWith(`${SANDBOX_API_BASE}/`)) {
    throw new SandboxIsolationError("Sandbox credentials can only call the sandbox API.");
  }
}

export function generateSandboxKey(
  random: (bytes: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
): string {
  const hex = Array.from(random(12), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${SANDBOX_KEY_PREFIX}${hex}`;
}
