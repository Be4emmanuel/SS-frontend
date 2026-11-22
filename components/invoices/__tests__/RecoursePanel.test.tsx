import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecoursePanel } from "../RecoursePanel";
import { RecourseBadge } from "@/components/marketplace/RecourseBadge";

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

describe("RecoursePanel & RecourseBadge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows RecourseBadge only when invoice has a posted guarantee", () => {
    const { rerender } = render(<RecourseBadge invoice={{ has_recourse: true }} />);
    expect(screen.getByTestId("recourse-badge")).toHaveTextContent("Recourse");

    rerender(<RecourseBadge invoice={{ has_recourse: false }} />);
    expect(screen.queryByTestId("recourse-badge")).not.toBeInTheDocument();
  });

  it("displays posted guarantee, coverage ratio, proportional recovery, and hides trigger before grace period", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          invoice_id: "inv-1",
          has_guarantee: true,
          guarantee_amount: 200,
          funded_principal: 1000,
          status: "posted",
          is_past_due_beyond_grace: false,
          is_unpaid: true,
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(<RecoursePanel invoiceId="inv-1" investorPosition={250} />);

    expect(await screen.findByTestId("recourse-status-badge")).toHaveTextContent("Posted");
    expect(screen.getByTestId("recourse-amount")).toHaveTextContent("200.00 XLM");
    // Coverage = 200 / 1000 = 20.0%
    expect(screen.getByTestId("recourse-coverage")).toHaveTextContent("20.0%");
    // Potential recovery = 200 * (250 / 1000) = 50.00 XLM
    expect(screen.getByTestId("recourse-potential-recovery")).toHaveTextContent("50.00 XLM");
    expect(screen.queryByTestId("recourse-trigger-button")).not.toBeInTheDocument();
  });

  it("shows Trigger action when past due beyond grace period and unpaid", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/recourse/trigger") && init?.method === "POST") {
        return new Response(JSON.stringify({ status: "triggered" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          invoice_id: "inv-2",
          has_guarantee: true,
          guarantee_amount: 500,
          funded_principal: 1000,
          status: "posted",
          is_past_due_beyond_grace: true,
          is_unpaid: true,
        }),
        { status: 200 },
      );
    });

    renderWithQuery(<RecoursePanel invoiceId="inv-2" investorPosition={100} />);

    const triggerBtn = await screen.findByTestId("recourse-trigger-button");
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/invoices/inv-2/recourse/trigger"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("renders triggered and released states with explanations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          invoice_id: "inv-3",
          has_guarantee: true,
          guarantee_amount: 300,
          funded_principal: 1000,
          status: "triggered",
          is_past_due_beyond_grace: true,
          is_unpaid: true,
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(<RecoursePanel invoiceId="inv-3" />);
    expect(await screen.findByTestId("recourse-status-badge")).toHaveTextContent("Triggered");
    expect(screen.getByTestId("recourse-explanation")).toHaveTextContent("triggered");
    expect(screen.queryByTestId("recourse-trigger-button")).not.toBeInTheDocument();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          invoice_id: "inv-4",
          has_guarantee: true,
          guarantee_amount: 300,
          funded_principal: 1000,
          status: "released",
          is_past_due_beyond_grace: false,
          is_unpaid: false,
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(<RecoursePanel invoiceId="inv-4" />);
    await waitFor(() => {
      expect(screen.getAllByTestId("recourse-status-badge").pop()).toHaveTextContent("Released");
    });
  });
});
