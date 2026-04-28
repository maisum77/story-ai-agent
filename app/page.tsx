"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type ApiResponse = {
  text?: string;
  remaining?: number;
  error?: string;
};

const MAX_INPUT = 1200;

export default function HomePage() {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    console.log("client env:", {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓ set" : "✗ missing",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "✓ set" : "✗ missing",
    });
    console.log("supabase client (from createBrowserSupabaseClient):", supabase);
    if (!supabase) {
      setAuthStatus("Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const charsLeft = useMemo(() => MAX_INPUT - prompt.length, [prompt]);

  const canSubmit = prompt.trim().length >= 20 && !isLoading && !!session;

  async function onSendMagicLink() {
    if (!supabase) {
      setAuthStatus("Supabase is not configured in environment variables. Please check your .env.local file.");
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setAuthStatus("Enter your email to receive a magic login link.");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      setAuthStatus("Please enter a valid email address.");
      return;
    }

    setIsAuthLoading(true);
    setAuthStatus("Sending magic link...");

    try {
      // Get the current origin including port
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      
      // Check if we're running on a different port (like 3001)
      const redirectTo = `${currentOrigin}/auth/callback`;
      console.log("Magic link redirect URL:", redirectTo);
      
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true, // Allow new users to sign up
        },
      });

      if (error) {
        console.error("Magic link error:", error);
        
        // Provide more user-friendly error messages
        if (error.message.includes("Email rate limit exceeded") || error.code === "over_email_send_rate_limit") {
          setAuthStatus("Too many attempts. Please wait a few minutes before trying again.");
        } else if (error.message.includes("Email provider not configured")) {
          setAuthStatus("Email authentication is not configured. Please check Supabase project settings.");
        } else if (error.message.includes("redirect_to") || error.code === "redirect_to_not_allowed") {
          setAuthStatus("Redirect URL not configured. Please add this URL to Supabase authentication settings: " +
            (typeof window !== "undefined" ? window.location.origin : ""));
        } else if (error.message.includes("email address is invalid") || error.code === "email_address_invalid") {
          setAuthStatus("Please enter a valid email address. Test emails like 'test@example.com' are not allowed.");
        } else if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.name === "TypeError") {
          setAuthStatus("Network error. Please check your internet connection and try again. If using a local development server, make sure CORS is configured in Supabase.");
        } else {
          setAuthStatus(`Failed to send magic link: ${error.message}`);
        }
      } else {
        setAuthStatus("✅ Magic link sent! Check your email and click the link to sign in.");
        // Clear email field after successful send
        setEmail("");
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      if (err instanceof Error && err.message.includes("Failed to fetch")) {
        setAuthStatus("Network error: Cannot connect to Supabase. Please check your internet connection and Supabase project configuration.");
      } else {
        setAuthStatus("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function onSignInWithGoogle() {
    if (!supabase) {
      setAuthStatus("Supabase is not configured in environment variables. Please check your .env.local file.");
      return;
    }

    setIsAuthLoading(true);
    setAuthStatus("Redirecting to Google...");

    try {
      // Get the current origin including port
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      
      // Check if we're running on a different port (like 3001)
      const redirectTo = `${currentOrigin}/auth/callback`;
      console.log("Google OAuth redirect URL:", redirectTo);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo,
        },
      });

      if (error) {
        console.error("Google OAuth error:", error);
        
        // Provide more user-friendly error messages
        if (error.message.includes("OAuth provider not configured")) {
          setAuthStatus("Google OAuth is not configured. Please check Supabase project settings.");
        } else if (error.message.includes("redirect_to")) {
          setAuthStatus("Redirect URL not configured. Please add this URL to Supabase authentication settings: " +
            (typeof window !== "undefined" ? window.location.origin : ""));
        } else {
          setAuthStatus(`Failed to sign in with Google: ${error.message}`);
        }
      }
      // Note: If successful, the user will be redirected away from the page
    } catch (err) {
      console.error("Unexpected error:", err);
      setAuthStatus("An unexpected error occurred. Please try again.");
      setIsAuthLoading(false);
    }
  }

  async function onSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStatus("Signed out. Sign in again to generate scenes.");
    setRemaining(null);
  }

  async function onGenerate() {
    if (!canSubmit) {
      return;
    }

    setIsLoading(true);
    setStatus("Forging your scene...");
    setResult("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ prompt }),
      });

      const data = (await res.json()) as ApiResponse;

      if (!res.ok) {
        setStatus(data.error ?? "Unable to generate. Try again shortly.");
        if (typeof data.remaining === "number") {
          setRemaining(data.remaining);
        }
        return;
      }

      setResult(data.text ?? "");
      setRemaining(typeof data.remaining === "number" ? data.remaining : null);
      setStatus("Fresh output generated.");
    } catch {
      setStatus("Network error. Please retry in a moment.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="main-wrap">
      <section className="hero">
        <p className="eyebrow">Story AI Agent</p>
        <h1 className="title">Write Cinematic Novel Scenes in Seconds</h1>
        <p className="subtitle">
          Sign in with Supabase magic link, then generate cinematic scenes. Each authenticated user gets a strict free usage cap to prevent abuse.
        </p>
        <div className="badges">
          <span className="badge">2 free generations per account</span>
          <span className="badge">IP + session throttling</span>
          <span className="badge">Supabase auth + quota</span>
        </div>
      </section>

      <section className="panel auth-panel">
        <div className="auth-row">
          <label htmlFor="email" className="label auth-label">
            Login Email
          </label>
          {!session ? (
            <>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="text-input"
              />
              <button className="button" onClick={onSendMagicLink} disabled={isAuthLoading}>
                {isAuthLoading ? "Sending..." : "Send Magic Link"}
              </button>
              <button className="button secondary-button" onClick={onSignInWithGoogle} disabled={isAuthLoading}>
                Continue with Google
              </button>
            </>
          ) : (
            <>
              <div className="counter">Signed in as {session.user.email}</div>
              <button className="button" onClick={onSignOut}>
                Sign Out
              </button>
            </>
          )}
        </div>
        <div className="status">{authStatus}</div>
      </section>

      <section className="grid">
        <article className="panel compose">
          <label htmlFor="prompt" className="label">
            Prompt (20 to 1200 chars)
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_INPUT))}
            className="textarea"
            placeholder={session ? "Example: A memory thief in a rain-soaked market discovers a vial containing her own forgotten childhood memory..." : "Please sign in first to write your novel prompt"}
            disabled={!session}
          />

          <div className="controls">
            <span className="counter">{charsLeft} characters left</span>
            <button className="button" onClick={onGenerate} disabled={!canSubmit || !supabase}>
              {isLoading ? "Generating..." : session ? "Generate Scene" : "Sign In to Generate"}
            </button>
          </div>

          <div className="status">{status}</div>
          {remaining !== null && <div className="counter">Remaining free uses: {remaining}</div>}
        </article>

        <article className="panel output">
          <h3>Generated Output</h3>
          <pre>{result || "Your generated scene will appear here."}</pre>
        </article>
      </section>
    </main>
  );
}
