import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RedemptionPanel } from "../RedemptionPanel";

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GPOOLINVESTOR123",
    isConnected: true,
    network: "testnet",
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("RedemptionPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates estimated payout, blocks over-balance requests, and displays queue/epoch/processed states", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/redemptions/req-1/cancel") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "req-1", status: "cancelled" }), {
          status: 200,
        });
      }
      if (url.includes("/redemptions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "req-3",
            pool_id: "pool-1",
            shares: 50,
            status: "queued",
            queue_position: 4,
            estimated_epoch: 8,
            created_at: "2026-11-22T00:00:00Z",
          }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify({
          pool_id: "pool-1",
          user_shares: 100,
          current_nav: 1.25,
          queue_position: 2,
          epoch: {
            epoch_number: 7,
            filled_shares: 400,
            cap_shares: 1000,
          },
          requests: [
            {
              id: "req-1",
              pool_id: "pool-1",
              shares: 25,
              status: "queued",
              queue_position: 2,
              estimated_epoch: 7,
              created_at: "2026-11-21T00:00:00Z",
            },
            {
              id: "req-2",
              pool_id: "pool-1",
              shares: 40,
              status: "processed",
              queue_position: null,
              estimated_epoch: 6,
              payout_amount: 48.0,
              nav_used: 1.2,
              created_at: "2026-11-15T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      );
    });

    renderWithQuery(<RedemptionPanel poolId="pool-1" />);

    const sharesInput = await screen.findByTestId("redemption-shares-input");
    expect(screen.getByTestId("queue-position")).toHaveTextContent("#2");
    expect(screen.getByTestId("epoch-capacity-text")).toHaveTextContent("400 / 1,000 shares (40%)");
    expect(screen.getByTestId("queue-carryover-note")).toBeInTheDocument();

    // Processed request shows payout and NAV used, and Cancel button is hidden
    const processedRow = screen.getByTestId("redemption-request-req-2");
    expect(processedRow).toHaveTextContent("48.00 XLM");
    expect(processedRow).toHaveTextContent("1.2000 XLM");
    expect(screen.queryByTestId("cancel-redemption-req-2")).not.toBeInTheDocument();

    // Payout updates as shares change
    fireEvent.change(sharesInput, { target: { value: "50" } });
    expect(screen.getByTestId("redemption-estimated-payout")).toHaveTextContent("62.50 XLM");
    expect(screen.getByTestId("redemption-submit-btn")).toBeEnabled();

    // Exceeding share balance blocks submission
    fireEvent.change(sharesInput, { target: { value: "150" } });
    expect(screen.getByTestId("redemption-balance-error")).toBeInTheDocument();
    expect(screen.getByTestId("redemption-submit-btn")).toBeDisabled();

    // Valid request submission
    fireEvent.change(sharesInput, { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("redemption-submit-btn"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pools/pool-1/redemptions"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Cancel queued request with confirmation dialog
    fireEvent.click(screen.getByTestId("cancel-redemption-req-1"));
    expect(screen.getByTestId("cancel-redemption-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-cancel-redemption"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pools/pool-1/redemptions/req-1/cancel"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
