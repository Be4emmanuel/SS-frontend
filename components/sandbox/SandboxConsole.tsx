"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSandboxEnvironment } from "@/hooks/useSandboxEnvironment";
import {
  SIMULATION_CONTROLS,
  blockedReason,
} from "@/lib/sandbox/engine";
import { RESPONSE_FIXTURES, SANDBOX_EVENT_TYPES } from "@/lib/sandbox/fixtures";
import { maskId, REDACTED } from "@/lib/sandbox/mask";

/**
 * API partner sandbox (#696): sample wallets, issuers and invoices, a
 * simulation control for every funding / settlement / reversal event, the
 * masked request history, response fixtures, and a reset.
 *
 * Everything here is simulated locally with test funds; nothing is sent to
 * production and sandbox credentials cannot be used there.
 */
export function SandboxConsole() {
  const { state, simulate, reset, rotate } = useSandboxEnvironment();

  return (
    <div className="space-y-6" data-testid="sandbox-console">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">API partner sandbox</h1>
        <p className="text-sm text-muted-foreground">
          Test your integration end to end with simulated settlements. No real assets move,
          and sandbox credentials are rejected by production.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Environment</h2>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Base URL: <code data-testid="sandbox-base">{state.settings.apiBase}</code>
          </p>
          <p>
            API key: <code data-testid="sandbox-key">{state.settings.apiKey.slice(0, 8)}{REDACTED}</code>
          </p>
          <Button size="sm" variant="outline" onClick={rotate} data-testid="sandbox-rotate">
            Rotate sandbox key
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Sample wallets &amp; issuers</h2>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <ul className="space-y-1" aria-label="Sample wallets">
            {state.wallets.map((w) => (
              <li key={w.id} data-testid={`sandbox-wallet-${w.id}`}>
                {w.label} · <span className="font-mono">{maskId(w.address)}</span> ·{" "}
                {w.balance.toLocaleString()} test XLM
              </li>
            ))}
          </ul>
          <ul className="space-y-1" aria-label="Sample issuers">
            {state.issuers.map((i) => (
              <li key={i.id}>
                {i.name} · {i.tier} · <span className="font-mono">{maskId(i.address)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Invoices &amp; event simulation</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.invoices.map((invoice) => (
            <div key={invoice.id} className="space-y-2 rounded-md border p-3" data-testid={`sandbox-invoice-${invoice.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{invoice.title}</span>
                <span data-testid={`sandbox-status-${invoice.id}`}>{invoice.status}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SANDBOX_EVENT_TYPES.map((type) => {
                  const control = SIMULATION_CONTROLS[type];
                  const reason = blockedReason(type, invoice);
                  return (
                    <Button
                      key={type}
                      size="sm"
                      variant="outline"
                      disabled={reason !== null}
                      title={reason ?? control.description}
                      onClick={() => simulate(type, invoice.id)}
                      data-testid={`sandbox-sim-${type}-${invoice.id}`}
                    >
                      {control.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-semibold">Request history</h2>
          <Button size="sm" variant="destructive" onClick={reset} data-testid="sandbox-reset">
            Reset sandbox
          </Button>
        </CardHeader>
        <CardContent>
          {state.history.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="sandbox-history-empty">
              No requests yet. Simulate an event above.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="sandbox-history">
              {state.history.map((entry) => (
                <li key={entry.id} className="rounded-md border p-2 text-xs">
                  <p className="font-mono">
                    {entry.method} {entry.path} → {entry.status}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">Details (masked)</summary>
                    <pre className="overflow-x-auto">{JSON.stringify({ request: entry.request, response: entry.response }, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Response fixtures</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {SANDBOX_EVENT_TYPES.map((type) => (
            <details key={type}>
              <summary className="cursor-pointer font-mono text-sm">{type}</summary>
              <pre className="overflow-x-auto text-xs">{JSON.stringify(RESPONSE_FIXTURES[type], null, 2)}</pre>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
