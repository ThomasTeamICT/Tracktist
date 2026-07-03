-- External notification channels are opt-in: align the column defaults with
-- the query layer and the settings UI (in-app stays on by default).
ALTER TABLE "NotificationPreference" ALTER COLUMN "webPush" SET DEFAULT false;
ALTER TABLE "NotificationPreference" ALTER COLUMN "email" SET DEFAULT false;
