# Supabase Configuration & Schema Documentation

## Overview

This document describes the Supabase database schema, authentication setup, and quota management system for the Story AI Agent application.

## Environment Variables Required

### Public Keys (can be exposed in frontend)

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase anon/publishable key (for browser-based auth)

### Secret Keys (server-side only, in `.env.local`)

- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for backend operations with elevated privileges

All three are already configured in your `.env.local` file.

---

## Database Schema

### Table: `public.user_usage`

Tracks user generation quota and usage statistics.

**Structure:**

```sql
CREATE TABLE public.user_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_count INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

**Columns:**

- `user_id` (UUID, PK): Unique identifier linked to Supabase auth user
- `usage_count` (INT): Current number of stories generated in this period
- `quota_limit` (INT): Maximum stories allowed (default: 2)
- `created_at` (TIMESTAMP): When the quota record was created
- `updated_at` (TIMESTAMP): When the quota was last updated

**Row-Level Security (RLS):** Enabled

- Users can only view/update their own row
- Service role can bypass RLS for internal operations

---

## Functions (RPCs)

### 1. `consume_user_generation(user_uuid UUID, max_uses INT = 2)`

Atomically checks if a user has remaining quota and returns usage status.

**Parameters:**

- `user_uuid`: User's UUID from auth.users
- `max_uses`: Maximum allowed generations (default: 2)

**Returns:**

- `allowed` (BOOLEAN): True if user has quota remaining
- `remaining` (INT): Number of generations still allowed

**Behavior:**

1. Creates user_usage row if it doesn't exist (lazy initialization)
2. Returns quota status without consuming it
3. Called from API route before story generation

**Security:**

- SECURITY DEFINER (runs as function owner)
- Executable only by authenticated users (not anon)
- Search path explicitly set to prevent SQL injection

**Example:**

```sql
SELECT * FROM consume_user_generation(auth.uid(), 2);
-- Returns: (allowed: true, remaining: 1)
```

### 2. `increment_user_usage(user_uuid UUID)`

Increments the usage counter after story generation succeeds.

**Parameters:**

- `user_uuid`: User's UUID from auth.users

**Returns:**

- `success` (BOOLEAN): Always true if no error
- `new_count` (INT): Updated usage count

**Security:**

- SECURITY DEFINER
- Executable only by authenticated users
- Called after successful story generation

---

## Authentication Flow

### 1. Browser Client (`createBrowserSupabaseClient`)

- Uses **anon/publishable key** (safe to expose)
- Persists session to localStorage
- Auto-refreshes tokens
- Handles: sign-up, sign-in, password reset, OAuth

### 2. API Route Server Client (`createServerSupabaseClient`)

- Uses **service role key** (never expose to client)
- No session persistence (stateless)
- Full database access, bypasses RLS
- Used for: quota checks, user data updates

### 3. Anon Server Client (`createAnonServerSupabaseClient`)

- Uses **anon/publishable key** for token validation
- Validates JWTs server-side
- Respects RLS policies
- Used for: extracting user ID from auth tokens

---

## Quota Management Flow

```
POST /api/generate
  ├─ [1] Validate token using anon server client
  │   └─ Extract user ID from JWT
  │
  ├─ [2] Check quota with service role client
  │   ├─ Call RPC: consume_user_generation()
  │   ├─ If RPC fails, fallback to direct queries
  │   └─ Retry logic: up to 3 attempts with exponential backoff
  │
  ├─ [3] If quota available, generate story with OpenAI
  │
  └─ [4] Return response with remaining quota
```

**Error Handling:**

- **Invalid token → 401 Unauthorized**: User must sign in
- **Quota exhausted → 403 Forbidden**: User reached limit (2 generations)
- **Database error → 500 Internal Server Error**: Infrastructure issue, with logging
- **Rate limit hit → 429 Too Many Requests**: IP-based rate limiting

---

## Security Policies

### RLS on `user_usage` Table

**Policy: Users can view their own usage**

```sql
CREATE POLICY "Users can view their own usage"
  ON public.user_usage FOR SELECT
  USING (auth.uid() = user_id);
```

**Policy: Users can update their own usage**

```sql
CREATE POLICY "Users can update their own usage"
  ON public.user_usage FOR UPDATE
  USING (auth.uid() = user_id);
```

**Policy: Users can insert their own usage**

```sql
CREATE POLICY "Users can insert their own usage"
  ON public.user_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Function Permissions

```sql
-- Only authenticated users can execute
GRANT EXECUTE ON FUNCTION public.consume_user_generation TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_usage TO authenticated;

-- Anon users cannot execute
REVOKE EXECUTE ON FUNCTION public.consume_user_generation FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_user_usage FROM anon;
```

---

## Debugging

### Health Check Endpoint

Test your setup at: `GET /api/health`

Returns:

```json
{
  "status": "healthy",
  "timestamp": "2026-04-28T...",
  "checks": {
    "supabase_client": "✓ initialized",
    "database": "✓ connected",
    "user_usage_table": {
      "status": "✓ accessible",
      "row_count": 1
    },
    "rpc_consume_user_generation": "✓ callable",
    "environment_variables": {
      "supabase_url": "✓ set",
      "supabase_anon_key": "✓ set",
      "service_role_key": "✓ set",
      "openai_api_key": "✓ set"
    }
  }
}
```

### Checking Logs

1. **Browser Console**: Look for `[SUPABASE]`, `[AUTH]`, `[QUOTA]`, `[OPENAI]` prefixed logs
2. **Supabase Dashboard**: Auth → Users to see active sessions
3. **Supabase Logs**: View API and Database logs for errors

### Common Issues

**Issue: "Missing Supabase env vars"**

- Solution: Restart dev server (`npm run dev`) after adding env vars
- Check: Browser console should show `✓ configured` for both URL and key

**Issue: "Invalid or expired session"**

- Solution: User token is invalid or expired
- Fix: Clear localStorage and sign in again
- Check: `GET /api/health` to verify token validation works

**Issue: "Could not verify usage quota"**

- Solution: RPC function failed and database fallback also failed
- Fix: Check Supabase dashboard for user_usage table issues
- Check: Run health endpoint and check database connectivity

**Issue: Free usage limit reached**

- Solution: User has exhausted quota (2 generations)
- Fix: This is intentional; users must wait for quota reset (currently per-session)

---

## Future Enhancements

1. **Quota Reset Schedule**: Add daily/monthly reset logic
2. **Tiered Plans**: Premium users get higher quotas
3. **Usage Analytics**: Dashboard showing usage patterns
4. **Webhook Notifications**: Alert users when quota is low
5. **API Key Management**: Allow users to generate API keys for higher quotas

---

## References

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Functions](https://www.postgresql.org/docs/current/sql-createfunction.html)
