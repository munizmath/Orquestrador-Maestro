# Rules - Supabase RLS

## RLS-001: Enable RLS on exposed tables

Every user-facing table in an exposed schema should have RLS enabled.

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

Validation:

```sql
SELECT n.nspname AS schema_name, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('public', 'storage')
  AND c.relrowsecurity = false
ORDER BY 1, 2;
```

## RLS-002: Keep service role server-side

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code, logs, source maps, or client bundles.

```typescript
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

Use service role only in trusted server contexts:

```typescript
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## RLS-003: Use explicit roles

Specify `TO authenticated`, `TO anon`, or both so policy intent is clear.

```sql
CREATE POLICY "profiles_read_own_row"
  ON profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
```

For public data, make anonymous access deliberate:

```sql
CREATE POLICY "posts_read_published"
  ON posts
  FOR SELECT
  TO anon, authenticated
  USING (published = true);
```

## RLS-004: Separate read and write checks

Use `USING` to control visible rows and `WITH CHECK` to validate rows being inserted or updated.

```sql
CREATE POLICY "profiles_update_own_row"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
```

## RLS-005: Enforce tenant membership

Tenant data needs a tenant predicate and a membership check.

```sql
CREATE POLICY "members_read_projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_members tm
      WHERE tm.tenant_id = projects.tenant_id
        AND tm.user_id = (SELECT auth.uid())
    )
  );
```

For writes, restrict by role:

```sql
CREATE POLICY "admins_update_projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tenant_members tm
      WHERE tm.tenant_id = projects.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tenant_members tm
      WHERE tm.tenant_id = projects.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role IN ('owner', 'admin')
    )
  );
```

## RLS-006: Add policy indexes

Index columns used in policies and common dashboard filters.

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_tenant ON tenant_members(user_id, tenant_id);
```

Wrapping `auth.uid()` in `SELECT` can improve policy performance in complex queries:

```sql
USING ((SELECT auth.uid()) = user_id);
```

## RLS-007: Validate with positive and negative tests

Before claiming RLS is complete, verify:

- Authorized user can access only the intended rows.
- Another user in the same project but different tenant is denied.
- Anonymous access is denied unless explicitly intended.
- Service-role usage exists only in trusted server code.

Example policy inventory:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;
```

## RLS-008: Review storage policies

Private buckets need object-level policies tied to owner or tenant metadata.

```sql
CREATE POLICY "members_read_tenant_files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tenant-files'
    AND EXISTS (
      SELECT 1
      FROM tenant_members tm
      WHERE tm.tenant_id::text = (storage.foldername(name))[1]
        AND tm.user_id = (SELECT auth.uid())
    )
  );
```
