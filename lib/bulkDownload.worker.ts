/// <reference lib="webworker" />
/**
 * Builds the bulk-download ZIP off the main thread (#778) so a large archive
 * does not freeze the data room while it is assembled.
 */
import { createStoredZip, type ZipEntry } from "@/lib/invoiceDocumentDownloads";

self.onmessage = (event: MessageEvent<{ entries: ZipEntry[] }>) => {
  try {
    const blob = createStoredZip(event.data.entries);
    (self as unknown as Worker).postMessage({ blob });
  } catch (error) {
    (self as unknown as Worker).postMessage({
      error: error instanceof Error ? error.message : "Could not build the archive.",
    });
  }
};
