import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreeningBanner } from "../ScreeningBanner";
import { ScreeningActionGuard } from "../ScreeningActionGuard";
import { Button } from "@/components/ui/button";

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GABC1234567890",
    isConnected: true,
    network: "testnet",
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ScreeningBanner & ScreeningActionGuard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders no banner for CLEAR accounts and keeps actions enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "CLEAR" }), { status: 200 }),
    );

    renderWithQuery(
      <>
        <ScreeningBanner />
        <ScreeningActionGuard actionLabel="Publishing">
          <Button data-testid="publish-btn">Publish</Button>
        </ScreeningActionGuard>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("publish-btn")).toBeEnabled();
    });
    expect(screen.queryByTestId("screening-banner-restricted")).not.toBeInTheDocument();
    expect(screen.queryByTestId("screening-banner-pending")).not.toBeInTheDocument();
  });

  it("renders pending-review explanation with expected timing and support link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "PENDING_REVIEW",
          expected_timing: "24 hours",
          provider: "SecretProvider",
          match_details: "Sensitive match info",
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(
      <>
        <ScreeningBanner />
        <ScreeningActionGuard actionLabel="Investing">
          <Button data-testid="invest-btn">Invest</Button>
        </ScreeningActionGuard>
      </>,
    );

    const banner = await screen.findByTestId("screening-banner-pending");
    expect(banner).toHaveTextContent("24 hours");
    expect(screen.getByTestId("screening-support-link")).toHaveAttribute("href", "/help");
    expect(screen.getByTestId("invest-btn")).toBeEnabled();

    // Never render provider or match details
    expect(document.body.textContent).not.toContain("SecretProvider");
    expect(document.body.textContent).not.toContain("Sensitive match info");
  });

  it("renders restricted banner, disables actions, and reflects status updates without reload", async () => {
    let currentStatus = "RESTRICTED";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          status: currentStatus,
          provider: "InternalAMLVendor",
          matches: [{ score: 98 }],
        }),
        { status: 200 },
      );
    });

    renderWithQuery(
      <>
        <ScreeningBanner />
        <ScreeningActionGuard actionLabel="Withdrawing">
          <Button data-testid="withdraw-btn">Withdraw</Button>
        </ScreeningActionGuard>
      </>,
    );

    const banner = await screen.findByTestId("screening-banner-restricted");
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId("screening-support-link")).toHaveAttribute("href", "/help");
    expect(screen.getByTestId("withdraw-btn")).toBeDisabled();
    expect(screen.getByTestId("screening-restricted-guard")).toBeInTheDocument();

    // Never render provider or match details
    expect(document.body.textContent).not.toContain("InternalAMLVendor");
    expect(document.body.textContent).not.toContain("98");

    // Simulate returning from support flow with cleared status
    currentStatus = "CLEAR";
    fireEvent.click(screen.getByTestId("screening-refresh-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("screening-banner-restricted")).not.toBeInTheDocument();
      expect(screen.getByTestId("withdraw-btn")).toBeEnabled();
    });
  });
});
