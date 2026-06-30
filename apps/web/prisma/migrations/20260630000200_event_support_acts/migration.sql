-- Add support-act names to events (brief §5.1).
ALTER TABLE "Event" ADD COLUMN "supportActs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
