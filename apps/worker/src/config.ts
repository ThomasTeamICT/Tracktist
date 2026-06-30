export const config = {
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  internalSecret: process.env.INTERNAL_API_SECRET ?? "",
  redisUrl: process.env.REDIS_URL,
  // How many unique artists to sync per tick (Ticketmaster free tier ≈ 5000/day).
  syncLimit: Number(process.env.SYNC_LIMIT ?? 25),
  staleHours: Number(process.env.SYNC_STALE_HOURS ?? 24),
  // BullMQ cron patterns.
  dailyCron: process.env.SYNC_DAILY_CRON ?? "0 4 * * *", // 04:00 daily
  fastCron: process.env.SYNC_FAST_CRON ?? "0 */6 * * *", // every 6 hours
  // Interval fallback (no Redis).
  intervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 60),
};
