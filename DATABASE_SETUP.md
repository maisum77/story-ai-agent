# Supabase Database Setup - Idempotent & Error-Free

## Overview

The Story AI Agent uses a robust, idempotent Supabase database setup that can be applied multiple times without errors.

## Database Architecture

### Table: `public.user_usage`

Tracks generation quota and usage for each user.

**Schema:**

```sql
CREATE TABLE public.user_usage (
  user_id UUID PRIMARY KEY,                           -- Links to auth.users
  usage_count INTEGER DEFAULT 0,                      -- Current usage
  quota_limit INTEGER DEFAULT 2,                      -- Max allowed
  created_at TIMESTAMP DEFAULT now(),                 -- Record creation
  updated_at TIMESTAMP DEFAULT now()                  -- Last update
);
```

**Constraints:**

- Primary Key: `user_id`
- Foreign Key: `auth.users(id)` with `ON DELETE CASCADE`
- Auto-populated timestamps

**Indexes:**

- `idx_user_usage_user_id` - For fast lookups by user
- `idx_user_usage_created_at` - For time-range queries
- `idx_user_usage_updated_at` - For tracking recent changes

---

## RLS Policies (Row-Level Security)

All policies use `(SELECT auth.uid())` for optimal performance.

### Policy 1: Users can SELECT their own row

```sql
USING (user_id = (SELECT auth.uid()))
```

- Users can only view their own quota record
- No cross-user visibility

### Policy 2: Users can UPDATE their own row

```sql
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()))
```

- Users can only update their own quota record
- Cannot modify other users' quotas

### Policy 3: Users can INSERT their own row

```sql
WITH CHECK (user_id = (SELECT auth.uid()))
```

- Users can only create their own quota record
- Cannot create records for other users

---

## RPC Functions (Stored Procedures)

### 1. `consume_user_generation(user_uuid UUID, max_uses INT = 2)`

Atomically checks if a user has remaining quota.

**Input:**

- `user_uuid`: User ID from auth.users
- `max_uses`: Maximum allowed generations (default: 2)

**Output:**

```typescript
{
  allowed: boolean,  // true if user can generate
  remaining: number  // stories left in quota
}
```

**Behavior:**

1. Auto-creates user_usage row if missing (lazy initialization)
2. Checks current usage count
3. Returns quota status without consuming it
4. Called before generation attempt

**Example:**

```sql
SELECT * FROM consume_user_generation(auth.uid(), 2);
-- Output: (allowed: true, remaining: 1)
```

### 2. `increment_user_usage(user_uuid UUID)`

Increments usage after successful generation.

**Input:**

- `user_uuid`: User ID from auth.users

**Output:**

```typescript
{
  success: boolean,  // Always true if no error
  new_count: number  // Updated usage count
}
```

**Behavior:**

1. Increments `usage_count` by 1
2. Updates `updated_at` timestamp
3. Returns new usage count

**Example:**

```sql
SELECT * FROM increment_user_usage(auth.uid());
-- Output: (success: true, new_count: 1)
```

### Function Security

- Both functions use `SECURITY DEFINER` (run as owner)
- Both functions use `SET search_path = public` (prevent SQL injection)
- Only `authenticated` users can execute (anon users revoked)
- Functions bypass RLS for internal consistency

---

## Permissions

### Table Permissions

- `authenticated` role: SELECT, INSERT, UPDATE
- `anon` role: No direct access (RLS blocks all)

### Function Permissions

- `authenticated` role: EXECUTE on both functions
- `anon` role: REVOKED (prevents abuse)

---

## Idempotency Guarantees

This setup is **fully idempotent**. You can run it multiple times without errors because:

1. ✅ **Tables**: Use `DROP TABLE IF EXISTS` then `CREATE TABLE`
2. ✅ **Functions**: Use `DROP FUNCTION IF EXISTS` then `CREATE FUNCTION`
3. ✅ **Policies**: Use `DROP POLICY IF EXISTS` then `CREATE POLICY`
4. ✅ **Indexes**: Use `CREATE INDEX IF NOT EXISTS`
5. ✅ **Permissions**: Use `REVOKE...FROM` then `GRANT...TO` (safe to repeat)

### Running the Setup

**Option 1: Using the SQL file**

```bash
# In Supabase Dashboard → SQL Editor, paste contents of database-setup.sql
```

**Option 2: Using the setup script**

```bash
# Execute via Supabase CLI
supabase db push
```

**Option 3: Direct SQL execution**

```sql
-- Copy all SQL from database-setup.sql into Supabase SQL Editor
-- Click "Run" - safe to run multiple times
```

---

## Error Prevention

### Issue: "Table already exists"

- **Fixed by**: `DROP TABLE IF EXISTS`
- **Safe**: Doesn't error if table doesn't exist

### Issue: "Function already exists"

- **Fixed by**: `DROP FUNCTION IF EXISTS`
- **Safe**: Doesn't error if function doesn't exist

### Issue: "Policy already exists"

- **Fixed by**: `DROP POLICY IF EXISTS`
- **Safe**: Doesn't error if policy doesn't exist

### Issue: "Foreign key constraint violation"

- **Fixed by**: Separate table creation and policy setup
- **Safe**: Auth users exist before policies are created

### Issue: "Permission denied"

- **Fixed by**: Explicit `REVOKE` then `GRANT` commands
- **Safe**: Idempotent permission assignment

---

## Testing the Setup

### 1. Verify Table Exists

```sql
SELECT * FROM information_schema.tables
WHERE table_name = 'user_usage';
-- Should return 1 row
```

### 2. Verify Functions Exist

```sql
SELECT * FROM information_schema.routines
WHERE routine_name IN ('consume_user_generation', 'increment_user_usage');
-- Should return 2 rows
```

### 3. Verify RLS Policies

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'user_usage';
-- Should return 3 policies
```

### 4. Test Quota Function

```sql
-- As authenticated user:
SELECT * FROM consume_user_generation(auth.uid(), 2);
-- Should return: (allowed: true, remaining: 1)
```

---

## Performance Characteristics

| Operation         | Complexity | Notes                              |
| ----------------- | ---------- | ---------------------------------- |
| Check quota       | O(1)       | Direct lookup by user_id (indexed) |
| Increment usage   | O(1)       | Direct update by user_id           |
| List user quotas  | O(n)       | Full table scan (not used in API)  |
| Insert user quota | O(1)       | Direct insert with primary key     |

**Indexes:**

- `idx_user_usage_user_id`: Optimizes quota checks
- `idx_user_usage_created_at`: Optimizes time-based queries
- `idx_user_usage_updated_at`: Optimizes recent updates tracking

---

## Troubleshooting

### "RLS violation" when updating quota

- ✅ Check: User is authenticated (has JWT token)
- ✅ Check: `user_id` in JWT matches record being updated
- ✅ Check: Policy allows UPDATE (all three policies should exist)

### Function returns NULL

- ✅ Check: User exists in `auth.users`
- ✅ Check: `user_usage` record exists for user
- ✅ Check: Permissions: `GRANT EXECUTE` on function

### Performance degradation

- ✅ Check: Indexes exist and are used
- ✅ Check: RLS policies use `(SELECT auth.uid())`
- ✅ Check: No N+1 queries in application code

---

## Re-running the Setup

To completely reset the database:

```bash
# 1. Run the setup script (safe - fully idempotent)
# In Supabase Dashboard → SQL Editor:
-- Copy database-setup.sql contents and run

# 2. Verify (should see 0 rows - clean state)
SELECT COUNT(*) FROM public.user_usage;

# 3. Clear application cache (if needed)
# Kill dev server and restart
```

---

## File Locations

- **Setup Script**: [database-setup.sql](database-setup.sql)
- **Schema Docs**: [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)
- **Application**: Uses these functions in [lib/supabase.ts](lib/supabase.ts)
