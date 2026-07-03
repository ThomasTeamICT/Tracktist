/**
 * Tracktist worker (brief §5.2).
 *
 * A thin scheduler: it drives the sync + notification pipeline on a cadence by
 * calling the web app's guarded internal endpoint (`/api/internal/tick`). All
 * DB/sync logic lives in the web app so there is a single source of truth; the
 * worker only decides *when* work runs.
 *
 * With Redis present it uses BullMQ repeatable jobs (the production path:
 * durable, observable, rate-limit friendly). Without Redis it falls back to a
 * simple in-process interval so local dev still works.
 */
import { config } from "./config.js";
import { runTick } from "./tick.js";

const REPEATABLES: { name: string; pattern: string }[] = [
  { name: "daily-scan", pattern: config.dailyCron },
  { name: "fast-scan", pattern: config.fastCron },
  { name: "weekly-digest", pattern: config.digestCron },
];

async function withBullMq(): Promise<boolean> {
  if (!config.redisUrl) return false;
  // Track partially constructed resources so a failed boot tears them down —
  // otherwise the interval fallback would double-run every tick.
  const cleanup: { close: () => Promise<unknown> }[] = [];
  try {
    const { Queue, Worker, QueueEvents } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    cleanup.push({ close: () => Promise.resolve(connection.quit()).catch(() => undefined) });

    // Preflight with a timeout: an unreachable Redis must fail fast into the
    // interval fallback instead of hanging the worker at boot forever.
    await Promise.race([
      connection.connect().then(() => connection.ping()),
      new Promise((_, reject) => setTimeout(() => reject(new Error("redis ping timeout")), 5000)),
    ]);

    const queue = new Queue("tracktist-sync", { connection });
    cleanup.push(queue);
    const events = new QueueEvents("tracktist-sync", { connection });
    cleanup.push(events);
    events.on("failed", ({ jobId, failedReason }) =>
      console.error(`[worker] job ${jobId} failed: ${failedReason}`),
    );

    // Reconcile repeatables BEFORE starting the Worker: an overdue iteration
    // of a stale schedule grabbed mid-reconcile would re-register the old
    // cron alongside the new one.
    const existing = await queue.getRepeatableJobs();
    for (const job of existing) {
      const wanted = REPEATABLES.find((r) => r.name === job.name);
      if (!wanted || wanted.pattern !== job.pattern) {
        await queue.removeRepeatableByKey(job.key);
        console.log(`[worker] removed stale repeatable ${job.name} (${job.pattern})`);
      }
    }
    for (const r of REPEATABLES) {
      await queue.add(r.name, {}, {
        repeat: { pattern: r.pattern },
        jobId: r.name,
        removeOnComplete: 50,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      });
    }

    const worker = new Worker(
      "tracktist-sync",
      async (job) => {
        console.log(`[worker] running job ${job.name}`);
        const result = await runTick({
          limit: config.syncLimit,
          staleHours: config.staleHours,
          digest: job.name === "weekly-digest",
        });
        // Throw on HTTP-level failure so BullMQ's attempts/backoff actually
        // fire — a returned {ok:false} would count as success and silently
        // skip e.g. the weekly digest for the whole week.
        if (!result.ok) throw new Error(result.error ?? "tick failed");
        return result;
      },
      { connection, concurrency: 1 },
    );
    cleanup.push(worker);
    worker.on("completed", (job, result) =>
      console.log(`[worker] ${job.name} done:`, result),
    );

    console.log(
      `[worker] BullMQ ready. daily="${config.dailyCron}" fast="${config.fastCron}" digest="${config.digestCron}"`,
    );
    // Kick one tick immediately on boot.
    await queue.add("boot-scan", {}, { removeOnComplete: true });
    return true;
  } catch (err) {
    console.error("[worker] BullMQ unavailable, falling back to interval:", err);
    for (const c of cleanup.reverse()) {
      await c.close().catch(() => undefined);
    }
    return false;
  }
}

async function withInterval(): Promise<void> {
  const everyMs = config.intervalMinutes * 60_000;
  console.log(`[worker] interval mode: every ${config.intervalMinutes} min`);
  let running = false; // overlap guard: slow ticks must not stack up
  const tick = async () => {
    if (running) {
      console.warn("[worker] previous tick still running — skipping this interval");
      return;
    }
    running = true;
    try {
      await runTick({
        limit: config.syncLimit,
        staleHours: config.staleHours,
        // No cron in interval mode: piggyback the digest on Monday ticks; the
        // web side is idempotent per ISO week, so repeats are harmless.
        digest: new Date().getDay() === 1,
      });
    } catch (e) {
      console.error("[worker] tick error:", e);
    } finally {
      running = false;
    }
  };
  await tick();
  setInterval(() => void tick(), everyMs);
}

async function main() {
  console.log("[worker] starting Tracktist worker");
  if (!config.internalSecret) {
    console.warn(
      "[worker] INTERNAL_API_SECRET is not set — /api/internal/tick will reject. Set it in both web and worker.",
    );
  }
  const usingBull = await withBullMq();
  if (!usingBull) await withInterval();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
