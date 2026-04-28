import { createServerSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // If there's an error, redirect to home with error message
  if (error) {
    console.error("Auth callback error:", error, errorDescription);
    return NextResponse.redirect(
      `${requestUrl.origin}/?auth_error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  // If there's no code, redirect to home
  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/`);
  }

  try {
    const supabase = createServerSupabaseClient();
    
    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) {
      console.error("Code exchange error:", exchangeError);
      return NextResponse.redirect(
        `${requestUrl.origin}/?auth_error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    // Success! Redirect to home page
    return NextResponse.redirect(`${requestUrl.origin}/?auth_success=true`);
  } catch (err) {
    console.error("Unexpected error in auth callback:", err);
    return NextResponse.redirect(
      `${requestUrl.origin}/?auth_error=${encodeURIComponent("Unexpected authentication error")}`
    );
  }
}