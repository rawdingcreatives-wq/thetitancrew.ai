/**
 * POST /api/account/complete-onboarding
 * Marks the current user's account as onboarding-complete.
 * Sets crew_deployed_at and onboard_step=9 so the main dashboard renders.
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface UpdateError {
  message: string;
}

export async function POST() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = await createServiceClient();
  const update_data = {
    crew_deployed_at: new Date().toISOString(),
    onboard_step: 9,
  };
  const { error } = await (serviceClient as any)
    .from("accounts")
    .update(update_data)
    .eq("owner_user_id", user.id) as { error?: UpdateError };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
