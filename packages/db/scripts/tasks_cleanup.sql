-- Cleanup helper for tasks table.
-- Removes tasks rows where the linked child or org no longer exists.
-- Usage:
--   DATABASE_URL=postgres://... pnpm --filter @joslyn-ai/db exec prisma db execute --file packages/db/scripts/tasks_cleanup.sql --schema packages/db/prisma/schema.prisma --url "$DATABASE_URL"

DELETE FROM tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM children c WHERE c.id = t.child_id
);

-- Remove tasks whose org_id no longer maps to an org.
DELETE FROM tasks t
WHERE t.org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orgs o WHERE o.id = t.org_id
  );
