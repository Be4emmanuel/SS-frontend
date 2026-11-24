"use client";

import React from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScreeningStatus } from "@/hooks/useScreeningStatus";

interface ScreeningActionGuardProps {
  children: React.ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean }>;
  actionLabel?: string;
}

/**
 * Disables publish, invest, and withdraw actions for `RESTRICTED` accounts
 * and shows a tooltip pointing to support (#615).
 */
export function ScreeningActionGuard({
  children,
  actionLabel = "This action",
}: ScreeningActionGuardProps) {
  const { isRestricted, supportUrl } = useScreeningStatus();

  if (!isRestricted) {
    return children;
  }

  const disabledChild = React.cloneElement(children, {
    disabled: true,
    "aria-disabled": true,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="inline-flex"
            data-testid="screening-restricted-guard"
          >
            {disabledChild}
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="screening-restricted-tooltip">
          <span>
            {actionLabel} is disabled while your account is restricted.{" "}
            <Link href={supportUrl} className="underline">
              Contact support
            </Link>
            .
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
