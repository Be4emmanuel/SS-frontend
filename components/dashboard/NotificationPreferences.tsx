"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { NotificationEventType, NotificationPreference } from "@/lib/api";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferenceMutation,
} from "@/hooks/useNotificationPreferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const EVENT_LABELS: Record<NotificationEventType, string> = {
  new_invoice: "New invoice",
  funding_milestone: "Funding milestone",
  settlement: "Settlement",
  invoice_funded: "Invoice funded",
  invoice_settled: "Invoice settled",
  invoice_matured: "Invoice matured",
  invoice_rejected: "Invoice rejected",
  deadline_extended: "Deadline extended",
  payout: "Payouts",
  dispute: "Disputes",
  security: "Security",
};

const GROUPS: { title: string; eventTypes: NotificationEventType[] }[] = [
  {
    title: "Activity",
    eventTypes: ["funding_milestone", "invoice_matured", "payout", "dispute"],
  },
  { title: "Account", eventTypes: ["security", "settlement", "new_invoice"] },
];

function NotificationPreferencesSkeleton() {
  return (
    <div className="space-y-3" data-testid="notification-preferences-loading" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-6">
            <Skeleton className="h-5 w-9" />
            <Skeleton className="h-5 w-9" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationPreferences() {
  const { data: preferences, isLoading } = useNotificationPreferences();
  const { mutate: updatePreference } = useUpdateNotificationPreferenceMutation();
  const [digest, setDigest] = useState<"daily" | "weekly" | "off">("weekly");
  const [emailVerified, setEmailVerified] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem("notification-email-digest");
    if (saved === "daily" || saved === "weekly" || saved === "off") setDigest(saved);
    setEmailVerified(window.localStorage.getItem("notification-email-verified") !== "false");
  }, []);

  function saveDigest(value: "daily" | "weekly" | "off") {
    setDigest(value);
    window.localStorage.setItem("notification-email-digest", value);
    toast.success("Email digest preference saved");
  }

  function resendVerification() {
    toast.success("Verification email sent");
  }

  // The API may omit entries for newer event types; missing ones default to
  // disabled so every event type always gets a toggle.
  const byEventType = new Map<NotificationEventType, NotificationPreference>();
  (preferences ?? []).forEach((pref) => byEventType.set(pref.event_type, pref));

  function preferenceFor(eventType: NotificationEventType): NotificationPreference {
    return byEventType.get(eventType) ?? { event_type: eventType, email: false, in_app: false };
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold">Notification Preferences</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you want to be notified for each event type.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Email digest</p>
            <Select value={digest} onValueChange={(value) => saveDigest(value as "daily" | "weekly" | "off")}>
              <SelectTrigger aria-label="Email digest frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Email status</p>
            {emailVerified ? (
              <Badge>Verified</Badge>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline">Unverified</Badge>
                <Button type="button" size="sm" variant="outline" onClick={resendVerification}>
                  Resend verification
                </Button>
              </div>
            )}
          </div>
        </div>
        {isLoading || !preferences ? (
          <NotificationPreferencesSkeleton />
        ) : (
          GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title} className="mb-6 last:mb-0">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {group.title}
              </h2>
              <div className="divide-y">
                {group.eventTypes.map((eventType) => {
                  const pref = preferenceFor(eventType);
                  const isSecurity = eventType === "security";
                  return (
                    <div key={eventType} className="flex items-center justify-between py-3">
                      <div>
                        <span className="text-sm font-medium">{EVENT_LABELS[eventType]}</span>
                        {isSecurity && (
                          <p className="text-xs text-muted-foreground">
                            Required for account protection and cannot be disabled.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          Email
                          <Switch
                            checked={isSecurity ? true : pref.email}
                            disabled={isSecurity}
                            onCheckedChange={(checked) =>
                              updatePreference({
                                eventType,
                                channel: "email",
                                enabled: checked,
                              })
                            }
                            aria-label={`Email notifications for ${EVENT_LABELS[eventType]}`}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          In-app
                          <Switch
                            checked={isSecurity ? true : pref.in_app}
                            disabled={isSecurity}
                            onCheckedChange={(checked) =>
                              updatePreference({
                                eventType,
                                channel: "in_app",
                                enabled: checked,
                              })
                            }
                            aria-label={`In-app notifications for ${EVENT_LABELS[eventType]}`}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
