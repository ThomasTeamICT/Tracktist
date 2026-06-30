/**
 * @tracktist/core — UI-independent domain core (brief §9).
 *
 * Types, the swappable provider layer, artist resolution, deduplication,
 * geo-distance, confidence, relevance, affiliate wrapping, notification rules
 * and the sync pipeline. Reused by the web app, the worker and (later) native
 * apps. No UI, no framework, no database — pure, server-side, idempotent logic.
 */

export * from "./types/index.js";
export * from "./util/text.js";
export * from "./util/country.js";
export * from "./geo/index.js";
export * from "./providers/index.js";
export * from "./resolution/index.js";
export * from "./dedupe/index.js";
export * from "./confidence/confidence.js";
export * from "./relevance/index.js";
export * from "./affiliate/index.js";
export * from "./notifications/index.js";
export * from "./pipeline/index.js";
