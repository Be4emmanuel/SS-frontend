/**
 * Masking for sandbox request history (#696).
 *
 * History is stored and shown masked: secret-looking keys and values are
 * redacted, and identifiers/addresses are shortened so a screenshot or a
 * copied log never exposes a full credential or account.
 */

const SECRET_KEY = /secret|api[-_]?key|token|authorization|password|seed|signature/i;
const SECRET_VALUE = /\b(ss_(test|live)_[A-Za-z0-9]+|S[A-Z2-7]{55})\b/g;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const ID_KEY = /(^|_)id$|^id$|address|account|wallet/i;

export const REDACTED = "[redacted]";

export function maskId(value: string): string {
  if (STELLAR_ADDRESS.test(value)) return `${value.slice(0, 4)}…${value.slice(-4)}`;
  if (value.length <= 6) return "…";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

function maskString(value: string, key?: string): string {
  const scrubbed = value.replace(SECRET_VALUE, REDACTED);
  if (scrubbed !== value) return scrubbed;
  if (key && ID_KEY.test(key) && value.length > 6) return maskId(value);
  if (STELLAR_ADDRESS.test(value)) return maskId(value);
  return value;
}

/** Deep-masks a JSON-like value. Never mutates its input. */
export function maskValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (key && SECRET_KEY.test(key) && typeof value !== "object") return REDACTED;
  if (typeof value === "string") return maskString(value, key);
  if (Array.isArray(value)) return value.map((v) => maskValue(v, key));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskValue(v, k)]),
    );
  }
  return value;
}

/** Mask a request path such as /invoices/sbx_inv_0001/fund. */
export function maskPath(path: string): string {
  return path
    .split("/")
    .map((segment) => (/^(sbx|evt|ss)_/i.test(segment) ? maskString(segment, "id") : segment))
    .join("/");
}
