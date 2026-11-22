import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettleNowButton } from "../SettleNowButton";
import { toast } from "sonner";

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
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

describe("SettleNowButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("enables button for settleable invoice and displays bounty and fee before confirming", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/settleable")) {
        return new Response(
          JSON.stringify({
            invoice_id: "inv-1",
            is_settleable: true,
            bounty_amount: 12.5,
            estimated_network_fee: 0.001,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/settle") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ tx_hash: "txhash1234567890" }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    const { queryClient } = renderWithQuery(
      <SettleNowButton invoiceId="inv-1" invoiceTitle="INV-001" />,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const btn = await screen.findByTestId("settle-now-button");
    expect(btn).toBeEnabled();
    expect(screen.getByTestId("settle-bounty-badge")).toHaveTextContent("12.5 XLM");

    fireEvent.click(btn);
    expect(screen.getByTestId("settle-confirm-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("settle-confirm-bounty")).toHaveTextContent("12.5 XLM");
    expect(screen.getByTestId("settle-confirm-fee")).toHaveTextContent("0.001 XLM");

    fireEvent.click(screen.getByTestId("settle-confirm-submit"));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Invoice settled successfully",
        expect.objectContaining({
          action: expect.objectContaining({ label: "View transaction" }),
        }),
      );
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["invoice", "inv-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["settlements"] });

    // After settlement, button is disabled with already-settled message
    await waitFor(() => {
      expect(screen.getByTestId("settle-now-button")).toBeDisabled();
      expect(screen.getByTestId("settle-now-button")).toHaveTextContent("Already settled");
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it.each([
    ["unpaid", "Invoice is unpaid"],
    ["disputed", "Invoice is disputed"],
    ["already_settled", "Already settled"],
  ])("disables button with reason for %s invoice", async (reason, expectedLabel) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          invoice_id: "inv-2",
          is_settleable: false,
          bounty_amount: 0,
          estimated_network_fee: 0.001,
          ineligible_reason: reason,
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(<SettleNowButton invoiceId="inv-2" />);

    const btn = await screen.findByTestId("settle-now-button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(expectedLabel);
  });

  it("shows readable error toast when settlement fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/settleable")) {
        return new Response(
          JSON.stringify({
            invoice_id: "inv-3",
            is_settleable: true,
            bounty_amount: 5,
            estimated_network_fee: 0.001,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/settle") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ message: "Invoice is already settled on-chain" }),
          { status: 409 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    renderWithQuery(<SettleNowButton invoiceId="inv-3" />);

    fireEvent.click(await screen.findByTestId("settle-now-button"));
    fireEvent.click(screen.getByTestId("settle-confirm-submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invoice is already settled on-chain");
    });
  });
});
