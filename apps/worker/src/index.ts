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

async function withBullMq(): Promise<boolean> {
  if (!config.redisUrl) return false;
  try {
    const { Queue, Worker, QueueEvents } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

    const queue = new Queue("tracktist-sync", { connection });
    const events = new QueueEvents("tracktist-sync", { connection });
    events.on("failed", ({ jobId, failedReason }) =>
      console.error(`[worker] job ${jobId} failed: ${failedReason}`),
    );

    const worker = new Worker(
      "tracktist-sync",
      async (job) => {
        console.log(`[worker] running job ${job.name}`);
        return runTick({ limit: config.syncLimit, staleHours: config.staleHours });
      },
      { connection, concurrency: 1 },
    );
    worker.on("completed", (job, result) =>
      console.log(`[worker] ${job.name} done:`, result),
    );

    // Daily full scan + a faster scan for high-priority/must-see refresh.
    await queue.add("daily-scan", {}, {
      repeat: { pattern: config.dailyCron },
      jobId: "daily-scan",
      removeOnComplete: 50,
      removeOnFail: 50,
    });
    await queue.add("fast-scan", {}, {
      repeat: { pattern: config.fastCron },
      jobId: "fast-scan",
      removeOnComplete: 50,
      removeOnFail: 50,
    });

    console.log(`[worker] BullMQ ready. daily="${config.dailyCron}" fast="${config.fastCron}"`);
    // Kick one tick immediately on boot.
    await queue.add("boot-scan", {}, { removeOnComplete: true });
    return true;
  } catch (err) {
    console.error("[worker] BullMQ unavailable, falling back to interval:", err);
    return false;
  }
}

async function withInterval(): Promise<void> {
  const everyMs = config.intervalMinutes * 60_000;
  console.log(`[worker] interval mode: every ${config.intervalMinutes} min`);
  const tick = () =>
    runTick({ limit: config.syncLimit, staleHours: config.staleHours }).catch((e) =>
      console.error("[worker] tick error:", e),
    );
  await tick();
  setInterval(tick, everyMs);
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
