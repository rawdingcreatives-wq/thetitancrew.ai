// @ts-nocheck
/**
 * TitanCrew · POST /api/inventory
 * Add a new inventory item.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    if (!body.accountId || !body.name?.trim()) return NextResponse.json({ error: "accountId and name required" }, { status: 400 });
    const service = createServiceClient();
    const { data: account } = await service.from("accounts").select("id").eq("id", body.accountId).eq("owner_user_id", user.id).single();
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const { data: item, error } = await service.from("inventory_items").insert({
      account_id: body.accountId,
      name: body.name.trim(),
      sku: body.sku || null,
      quantity_on_hand: body.quantity_on_hand ?? 0,
      reorder_point: body.reorder_point ?? 2,
      unit_cost: body.unit_cost ?? null,
      supplier: body.supplier || null,
    }).select("id, name").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, item });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
