# Troubleshooting - Supabase RLS

## Error: row-level security policy denied access

Cause: the request is unauthenticated or no policy allows the operation.

Check authentication first:

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  throw new Error('User is not authenticated');
}
```

Then verify the table has the expected policy:

```sql
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles';
```

## Error: RLS returns no rows after migration

Cause: RLS is enabled but no matching `SELECT` policy exists for the caller.

```sql
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'profiles';
```

Add an explicit policy instead of disabling RLS.

## Error: service role bypasses RLS

Cause: service-role clients bypass RLS and must be treated as privileged backend clients.

Fix:

- Keep `SUPABASE_SERVICE_ROLE_KEY` out of frontend code and client bundles.
- Route privileged actions through backend code with explicit authorization.
- Log actor, tenant, action, and reason for privileged operations.

## Error: policies are slow

Cause: policy predicates lack supporting indexes or call functions per row.

Check indexes:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'projects';
```

Prefer indexed predicates and `SELECT` wrapping:

```sql
USING ((SELECT auth.uid()) = user_id);
```

## Error: public or anonymous access is unclear

Cause: the policy omits explicit roles or grants broader access than intended.

Use explicit roles:

```sql
CREATE POLICY "posts_read_published"
  ON posts
  FOR SELECT
  TO anon, authenticated
  USING (published = true);
```

If anonymous access is not intended, use only `TO authenticated`.

## Error: tenant isolation fails negative tests

Cause: the policy checks user ownership but not tenant membership, or the application trusts a client-supplied `tenant_id`.

Fix:

- Add membership checks using server-side tenant membership tables.
- Validate `WITH CHECK` on inserts and updates.
- Test user A from tenant A against rows from tenant B.

## Diagnostic checklist

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;
```

```sql
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('public', 'storage')
ORDER BY 1, 2;
```

Use production diagnostics as read-only checks unless the user explicitly approves changes.
