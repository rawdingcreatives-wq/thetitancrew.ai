// @ts-nocheck
/**
 * TitanCrew · Complete Onboarding API
 * POST /api/account/complete-onboarding
 * Sets crew_deployed_at and marks onboard_step = 9.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase.from("accounts") as any)
    .update({
      crew_deployed_at: new Date().toISOString(),
      onboard_step:     9,
    })
    .eq("owner_user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
