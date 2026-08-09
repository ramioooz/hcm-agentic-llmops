DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "security_events"
    WHERE "event_type"::text = 'PII_REDACTION_APPLIED'
  ) THEN
    RAISE EXCEPTION
      'Cannot remove SecurityEventType.PII_REDACTION_APPLIED while historical rows still use it';
  END IF;
END $$;

ALTER TYPE "SecurityEventType" RENAME TO "SecurityEventType_old";
CREATE TYPE "SecurityEventType" AS ENUM ('AUTHORIZATION_DENIED', 'UNSAFE_REQUEST_REJECTED');

ALTER TABLE "security_events"
  ALTER COLUMN "event_type" TYPE "SecurityEventType"
  USING ("event_type"::text::"SecurityEventType");

DROP TYPE "SecurityEventType_old";
