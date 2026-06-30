import "server-only";
import { z } from "zod";

/**
 * Server-side environment configuration (brief §9: all keys server-side only).
 * Validated once at startup; never import this from a client component.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(1).optional(),
  REDIS_URL: z.string().optional(),
  /** Shared secret protecting /api/internal/* (worker → web). */
  INTERNAL_API_SECRET: z.string().optional(),

  // Auth providers
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  EMAIL_SERVER: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Event sources
  TICKETMASTER_API_KEY: z.string().optional(),
  TICKETMASTER_AFFILIATE_PUBLISHER_ID: z.string().optional(),
  BANDSINTOWN_APP_ID: z.string().optional(),
  SETLISTFM_API_KEY: z.string().optional(),

  // Metadata / import
  MUSICBRAINZ_USER_AGENT: z.string().default("Tracktist/0.1 ( contact@tracktist.app )"),
  LASTFM_API_KEY: z.string().optional(),

  // Web push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:no-reply@tracktist.app"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Surface a clear message but don't crash the build for missing optional keys.
  console.error("⚠️  Invalid environment configuration:", parsed.error.flatten().fieldErrors);
}

export const env = (parsed.success ? parsed.data : schema.parse({ DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://localhost:5432/tracktist" }));

/** Feature flags derived from which keys are present. */
export const features = {
  ticketmaster: Boolean(env.TICKETMASTER_API_KEY),
  bandsintown: Boolean(env.BANDSINTOWN_APP_ID),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  email: Boolean(env.EMAIL_SERVER && env.EMAIL_FROM),
  webPush: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  lastfm: Boolean(env.LASTFM_API_KEY),
  affiliate: Boolean(env.TICKETMASTER_AFFILIATE_PUBLISHER_ID),
} as const;
