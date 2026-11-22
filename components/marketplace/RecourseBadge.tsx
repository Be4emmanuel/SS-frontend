import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Invoice } from "@/lib/api";

interface RecourseBadgeProps {
  invoice: Pick<Invoice, "has_recourse" | "recourse">;
}

/**
 * Shown on marketplace cards only for invoices with a posted seller recourse
 * guarantee (#616).
 */
export function RecourseBadge({ invoice }: RecourseBadgeProps) {
  const hasPostedGuarantee =
    Boolean(invoice.has_recourse) || invoice.recourse?.status === "posted";

  if (!hasPostedGuarantee) {
    return null;
  }

  return (
    <Badge
      variant="secondary"
      className="gap-1 text-xs"
      data-testid="recourse-badge"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Recourse
    </Badge>
  );
}
