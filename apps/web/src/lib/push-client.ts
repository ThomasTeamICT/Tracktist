"use client";

/**
 * Browser-side web-push enrolment: register the service worker, ask
 * permission, subscribe and store the subscription server-side. Shared by
 * onboarding and settings so "push aan" always actually subscribes.
 */
export type PushEnrollResult = "enabled" | "denied" | "unavailable";

export async function subscribeToWebPush(): Promise<PushEnrollResult> {
  try {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return "unavailable";
    }
    const keyRes = await fetch("/api/push/public-key", { credentials: "same-origin" });
    const { publicKey } = (await keyRes.json().catch(() => ({}))) as { publicKey?: string };
    if (!publicKey) return "unavailable";

    // Use the registration we get back — `serviceWorker.ready` never
    // resolves when registration failed, which would hang this promise (and
    // the settings toggle) forever.
    const reg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
    if (!reg) return "unavailable";
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    // Wait for the worker to activate, but never indefinitely.
    const ready = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    if (!ready) return "unavailable";

    const sub = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok ? "enabled" : "unavailable";
  } catch {
    return "unavailable";
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
