// @ts-nocheck
/**
 * TitanCrew — Case Study PATCH route
 * PATCH /api/growth/case-studies/:id
 * Update status (draft → published etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["draft", "published", "testimonial_requested"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "published") {
    update.published_at = new Date().toISOString();
  } else {
    update.published_at = null;
  }

  const { error } = await supabase
    .from("case_studies")
    .update(update)
    .eq("id", id)
    .eq("account_id", account.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
