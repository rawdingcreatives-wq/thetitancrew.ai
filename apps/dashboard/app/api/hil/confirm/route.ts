/**
 * TitanCrew · HIL Confirmation Route
 * Owner clicks approve/reject link from SMS → this updates the DB → agent unblocks.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface HILConfirmation {
  id: string;
  description: string;
  action_type: string;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const action = searchParams.get("action") as "approve" | "reject" | null;

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const { data, error } = await (supabase as any)
    .from("hil_confirmations")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      responded_at: new Date().toISOString(),
    })
    .eq("response_token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, description, action_type")
    .single() as { data: HILConfirmation | null; error?: { message: string } };

  if (error || !data) {
    return NextResponse.json(
      { error: "Confirmation not found, already responded, or expired." },
      { status: 404 }
    );
  }

  // Return a clean HTML response (owner sees this in their browser)
  const actionLabel = action === "approve" ? "approved" : "rejected";
  const emoji = action === "approve" ? "✅" : "❌";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TitanCrew — Action ${actionLabel}</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #F8FAFF; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 16px; padding: 32px 40px; text-align: center; box-shadow: 0 4px 24px rgba(26,39,68,0.10); max-width: 400px; width: 90%; }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #1A2744; font-size: 20px; margin: 0 0 8px; }
    p { color: #64748b; font-size: 14px; margin: 0 0 24px; }
    .brand { color: #FF6B00; font-weight: 700; }
    a { display: inline-block; background: #1A2744; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>Action ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}</h1>
    <p>You ${actionLabel}: <strong>${data.action_type.replace(/_/g, " ")}</strong>.<br>Your <span class="brand">TitanCrew</span> has been notified.</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.titancrew.ai"}">Back to Dashboard</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

// Also handle GET (owner might click link directly)
export const GET = POST;
