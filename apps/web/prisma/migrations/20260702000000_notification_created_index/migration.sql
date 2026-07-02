-- The notification centre lists by (userId, createdAt DESC); the existing
-- (userId, readAt) index doesn't serve that ordering.
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
