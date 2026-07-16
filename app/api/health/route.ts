import { NextResponse } from "next/server";

/**
 * Liveness probe for deploy smoke checks and uptime monitors.
 * Does not hit Supabase — safe when only checking the Node process.
 */
export async function GET() {
  const hasPublicSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

  return NextResponse.json(
    {
      ok: true,
      service: "apex",
      ts: new Date().toISOString(),
      supabasePublicEnv: hasPublicSupabase,
    },
    { status: 200 },
  );
}