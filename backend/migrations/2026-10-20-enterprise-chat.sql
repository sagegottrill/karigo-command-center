-- Enterprise chat (2026-10-20): presence + typing on User, DM/group membership
-- on Conversation. Additive only — never drops or rewrites live data.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeen" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "typingIn" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "typingAt" TIMESTAMP(3);

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "memberIds" JSONB;
