import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInvoiceNotes } from "../useInvoiceNotes";
import * as notesApi from "@/lib/api/invoiceNotes";
import type { InvoiceNote } from "@/lib/invoiceNotes";

const SERVER: InvoiceNote = {
  invoiceId: "inv-1",
  body: "saved earlier",
  tags: ["energy"],
  version: 3,
  updatedAt: "2026-01-01T00:00:00Z",
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(notesApi, "fetchInvoiceNote").mockResolvedValue(SERVER);
  vi.spyOn(notesApi, "fetchNoteIndex").mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useInvoiceNotes (#777)", () => {
  it("loads the saved note, so it survives a reload", async () => {
    const { result } = renderHook(() => useInvoiceNotes("inv-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.body).toBe("saved earlier"));
    expect(result.current.tags).toEqual(["energy"]);
  });

  it("autosaves once typing stops, sending the last server version", async () => {
    const save = vi
      .spyOn(notesApi, "saveInvoiceNote")
      .mockResolvedValue({ ...SERVER, body: "abc", version: 4 });
    const { result } = renderHook(() => useInvoiceNotes("inv-1", { debounceMs: 50 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setBody("a"));
    act(() => result.current.setBody("ab"));
    act(() => result.current.setBody("abc"));
    expect(result.current.status).toBe("dirty");
    expect(save).not.toHaveBeenCalled(); // still typing

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(save).toHaveBeenCalledWith("inv-1", {
      body: "abc",
      tags: ["energy"],
      baseVersion: 3,
    });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("saves tag changes through the same debounce", async () => {
    const save = vi.spyOn(notesApi, "saveInvoiceNote").mockResolvedValue(SERVER);
    const { result } = renderHook(() => useInvoiceNotes("inv-1", { debounceMs: 20 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setTags(["energy", "q3"]));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1].tags).toEqual(["energy", "q3"]);
  });

  it("surfaces a conflict and lets the user keep their version", async () => {
    const theirs: InvoiceNote = { ...SERVER, body: "from another tab", version: 9 };
    const save = vi
      .spyOn(notesApi, "saveInvoiceNote")
      .mockRejectedValueOnce(new notesApi.NoteConflictError(theirs))
      .mockResolvedValueOnce({ ...SERVER, body: "mine", version: 10 });
    const { result } = renderHook(() => useInvoiceNotes("inv-1", { debounceMs: 10 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setBody("mine"));
    await waitFor(() => expect(result.current.status).toBe("conflict"));
    expect(result.current.conflict?.body).toBe("from another tab");

    act(() => result.current.keepMine());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toMatchObject({ body: "mine", baseVersion: 9 });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("can discard local edits and take the other version", async () => {
    const theirs: InvoiceNote = { ...SERVER, body: "from another tab", version: 9 };
    vi.spyOn(notesApi, "saveInvoiceNote").mockRejectedValue(new notesApi.NoteConflictError(theirs));
    const { result } = renderHook(() => useInvoiceNotes("inv-1", { debounceMs: 10 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setBody("mine"));
    await waitFor(() => expect(result.current.status).toBe("conflict"));

    act(() => result.current.takeTheirs());
    await waitFor(() => expect(result.current.body).toBe("from another tab"));
    expect(result.current.status).toBe("idle");
  });
});
