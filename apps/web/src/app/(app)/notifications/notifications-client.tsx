"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  CheckCheck,
  RefreshCw,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types (loose shapes matching the documented JSON API)              */
/* ------------------------------------------------------------------ */

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  eventId: string | null;
  artistId: string | null;
}

interface NotificationsData {
  notifications: NotificationItem[];
  unread: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// Keyed on the NotificationType enum values the API actually returns
// (see prisma schema + notify.ts).
const TYPE_LABELS: Record<string, string> = {
  NEW_SHOW_NEARBY: "nieuw optreden dichtbij",
  NEW_SHOW_MUST_SEE: "must-see",
  TICKETS_AVAILABLE: "tickets",
  RESCHEDULED: "verplaatst",
  CANCELLED: "geannuleerd",
  FRIEND_ACTIVITY: "vrienden",
  WEEKLY_DIGEST: "samenvatting",
};

const TYPE_TONES: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  NEW_SHOW_NEARBY: "accent",
  NEW_SHOW_MUST_SEE: "accent",
  TICKETS_AVAILABLE: "success",
  RESCHEDULED: "warning",
  CANCELLED: "danger",
  FRIEND_ACTIVITY: "neutral",
  WEEKLY_DIGEST: "neutral",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function typeTone(type: string): "neutral" | "accent" | "success" | "warning" | "danger" {
  return TYPE_TONES[type] ?? "neutral";
}

/** Relative time label in Dutch, e.g. "5 min geleden", "zojuist". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "zojuist";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} u geleden`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d geleden`;
  const week = Math.round(day / 7);
  if (week < 5) return `${week} w geleden`;
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EMPTY: NotificationsData = { notifications: [], unread: 0 };

/* ------------------------------------------------------------------ */

export function NotificationsClient() {
  const [data, setData] = useState<NotificationsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Laden mislukt");
      const json: Partial<NotificationsData> = await res.json();
      const notifications = json.notifications ?? [];
      setData({
        notifications,
        unread: json.unread ?? notifications.filter((n) => !n.readAt).length,
      });
      setError(null);
    } catch {
      setError("Kon je meldingen niet laden. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistically mark one notification as read, then persist. */
  const markRead = useCallback(async (id: string) => {
    let changed = false;
    setData((prev) => {
      const next = prev.notifications.map((n) => {
        if (n.id === id && !n.readAt) {
          changed = true;
          return { ...n, readAt: new Date().toISOString() };
        }
        return n;
      });
      if (!changed) return prev;
      return { notifications: next, unread: Math.max(0, prev.unread - 1) };
    });
    if (!changed) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Best-effort: a later refresh reconciles state with the server.
    }
  }, []);

  async function markAll() {
    const unreadIds = data.notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0 || markingAll) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setData((prev) => ({
      notifications: prev.notifications.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      unread: 0,
    }));
    try {
      await Promise.all(
        unreadIds.map((id) =>
          fetch(`/api/notifications/${id}/read`, {
            method: "POST",
            credentials: "same-origin",
          }),
        ),
      );
    } catch {
      // Best-effort.
    } finally {
      setMarkingAll(false);
    }
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await fetch("/api/notifications/run", {
        method: "POST",
        credentials: "same-origin",
      });
      await load();
    } catch {
      setError("Verversen mislukt. Probeer het opnieuw.");
    } finally {
      setRefreshing(false);
    }
  }

  const hasUnread = data.unread > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white/70">
          {hasUnread ? (
            <BellRing className="h-5 w-5 text-accent-soft" />
          ) : (
            <Bell className="h-5 w-5 text-white/50" />
          )}
          {hasUnread ? (
            <span>
              <span className="font-semibold text-white">{data.unread}</span> ongelezen
            </span>
          ) : (
            <span>Alles gelezen</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAll()}
            disabled={!hasUnread || markingAll}
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Markeer alles gelezen
          </Button>
          <Button size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Ververs meldingen
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : data.notifications.length === 0 ? (
        <EmptyNotifications onRefresh={refresh} refreshing={refreshing} />
      ) : (
        <ul className="space-y-3">
          {data.notifications.map((n) => (
            <li key={n.id}>
              <NotificationRow notification={n} onRead={markRead} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                */
/* ------------------------------------------------------------------ */

function NotificationRow({
  notification,
  onRead,
}: {
  notification: NotificationItem;
  onRead: (id: string) => void | Promise<void>;
}) {
  const isUnread = !notification.readAt;
  const handleActivate = () => {
    if (isUnread) void onRead(notification.id);
  };

  const content = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={
          isUnread
            ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent shadow-glow"
            : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white/15"
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={isUnread ? "font-semibold text-white" : "font-medium text-white/70"}>
            {notification.title}
          </span>
          <Badge tone={typeTone(notification.type)}>{typeLabel(notification.type)}</Badge>
        </div>
        {notification.body ? (
          <p className={isUnread ? "mt-1 text-sm text-white/65" : "mt-1 text-sm text-white/45"}>
            {notification.body}
          </p>
        ) : null}
        <p className="mt-1.5 text-xs text-white/40">{relativeTime(notification.createdAt)}</p>
      </div>
      {notification.eventId ? (
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/30" />
      ) : null}
    </div>
  );

  const cardClass = isUnread
    ? "card p-4 transition border-accent/20 bg-accent/[0.04]"
    : "card p-4 transition";

  if (notification.eventId) {
    return (
      <Link
        href={`/events/${notification.eventId}`}
        onClick={handleActivate}
        className={`block ${cardClass} hover:border-white/15`}
      >
        {content}
      </Link>
    );
  }

  if (isUnread) {
    return (
      <button
        type="button"
        onClick={handleActivate}
        className={`block w-full cursor-pointer text-left ${cardClass} hover:border-white/15`}
      >
        {content}
      </button>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyNotifications({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
}) {
  return (
    <Card className="text-center">
      <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-white/5 text-accent-soft">
        <Bell className="h-5 w-5" />
      </span>
      <p className="font-medium text-white">Nog geen meldingen</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/55">
        Zodra een van je artiesten een nieuw optreden aankondigt of er tickets vrijkomen, lees je
        het hier als eerste.
      </p>
      <div className="mt-4 flex justify-center">
        <Button size="sm" variant="outline" onClick={() => void onRefresh()} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Ververs meldingen
        </Button>
      </div>
    </Card>
  );
}
