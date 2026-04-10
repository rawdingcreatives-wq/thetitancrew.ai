/**
 * TitanCrew · Account Update API
 * PATCH /api/account/update
 * Allows authenticated users to update their own account profile fields.
 * Only whitelisted fields can be updated (business_name, owner_name, phone, trade_type).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("account-update");

/* ------------------------------------------------------------------ */
/*  Allowed fields & validation                                        */
/* ------------------------------------------------------------------ */

const ALLOWED_FIELDS = new Set([
  "business_name",
  "owner_name",
  "phone",
  "trade_type",
]);

const VALID_TRADE_TYPES = new Set([
  "plumbing",
  "electrical",
  "hvac",
  "snow_plow",
  "junk_removal",
  "general",
  "roofing",
  "other",
]);

const MAX_FIELD_LENGTH = 200;

function validate(
  field: string,
  value: unknown
): { ok: true; sanitized: string } | { ok: false; error: string } {
  if (!ALLOWED_FIELDS.has(field)) {
    return { ok: false, error: `Field "${field}" is not editable` };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "Value must be a string" };
  }

  const trimmed = value.trim();

  if (trimmed.length > MAX_FIELD_LENGTH) {
    return { ok: false, error: `Value too long (max ${MAX_FIELD_LENGTH} chars)` };
  }

  if (field === "trade_type" && !VALID_TRADE_TYPES.has(trimmed)) {
    return { ok: false, error: "Invalid trade type" };
  }

  if (field === "phone") {
    // Strip non-digits for validation, allow common formatting
    const digits = trimmed.replace(/\D/g, "");
    if (trimmed.length > 0 && (digits.length < 7 || digits.length > 15)) {
      return { ok: false, error: "Invalid phone number" };
    }
  }

  return { ok: true, sanitized: trimmed };
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { field, value } = body;

    if (!field) {
      return NextResponse.json({ error: "Missing field" }, { status: 400 });
    }

    const result = validate(field, value);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Update only the user's own account
    // When phone changes, also sync owner_phone for backward compat with agents
    const updatePayload: Record<string, string | null> = { [field]: result.sanitized || null };
    if (field === "phone") {
      updatePayload.owner_phone = result.sanitized || null;
    }

    const { error } = await (supabase as any)
      .from("accounts")
      .update(updatePayload)
      .eq("owner_user_id", user.id) as { error?: { message: string } };

    if (error) {
      log.error({ event: "supabase_error", err: String(error) }, "Supabase error");
      return NextResponse.json(
        { error: "Failed to update. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, field, value: result.sanitized });
  } catch (err) {
    log.error({ event: "unexpected_error", err: String(err) }, "Unexpected error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
