/**
 * Type definitions for Supabase quota management and auth operations
 */

export interface UsageQuota {
  allowed: boolean;
  remaining: number;
}

export interface QuotaCheckResult {
  success: boolean;
  error?: string;
  quota?: UsageQuota;
}

export interface IncrementUsageResult {
  success: boolean;
  new_count?: number;
  error?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
}

export interface AuthError {
  code: string;
  message: string;
}

export class QuotaError extends Error {
  constructor(
    public code: "QUOTA_EXCEEDED" | "USER_NOT_FOUND" | "DB_ERROR" | "RPC_ERROR",
    message: string
  ) {
    super(message);
    this.name = "QuotaError";
  }
}
