/** Positive number from the environment, or the fallback on anything bogus. */
function num(raw: string | undefined, fallback: number, min = 1): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export const config = {
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  internalSecret: process.env.INTERNAL_API_SECRET ?? "",
  redisUrl: process.env.REDIS_URL,
  // How many unique artists to sync per tick (Ticketmaster free tier ≈ 5000/day).
  syncLimit: num(process.env.SYNC_LIMIT, 25),
  staleHours: num(process.env.SYNC_STALE_HOURS, 24),
  // BullMQ cron patterns.
  dailyCron: process.env.SYNC_DAILY_CRON ?? "0 4 * * *", // 04:00 daily
  fastCron: process.env.SYNC_FAST_CRON ?? "0 */6 * * *", // every 6 hours
  digestCron: process.env.DIGEST_CRON ?? "0 8 * * 1", // Monday 08:00 weekly digest
  // Interval fallback (no Redis). Guarded against NaN — a typo'd env var
  // would otherwise make setInterval fire every ~1 ms.
  intervalMinutes: num(process.env.SYNC_INTERVAL_MINUTES, 60),
};
