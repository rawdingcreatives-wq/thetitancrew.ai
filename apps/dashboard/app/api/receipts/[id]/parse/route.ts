/**
 * POST /api/receipts/[id]/parse
 *
 * Triggers Claude vision to parse a receipt image.
 * Extracts: vendor, date, line items, totals, payment method.
 * Creates receipt_line_items rows from parsed data.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import Anthropic from "@anthropic-ai/sdk";

const log = createLogger("api/receipts/parse");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();

    // Verify account ownership
    const { data: account } = await service
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch receipt and verify it belongs to this account
    const { data: receipt, error: fetchErr } = await (service as any)
      .from("receipts")
      .select("id, account_id, storage_path, status")
      .eq("id", id)
      .eq("account_id", account.id)
      .single();

    if (fetchErr || !receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (receipt.status !== "uploaded" && receipt.status !== "error") {
      return NextResponse.json(
        { error: `Receipt already in status: ${receipt.status}. Only 'uploaded' or 'error' receipts can be parsed.` },
        { status: 400 }
      );
    }

    // Mark as parsing
    await (service as any)
      .from("receipts")
      .update({ status: "parsing" })
      .eq("id", id);

    // Download image from storage
    const { data: fileData, error: dlErr } = await service.storage
      .from("receipts")
      .download(receipt.storage_path);

    if (dlErr || !fileData) {
      log.error({ event: "download_failed" }, "Failed to download receipt image", dlErr);
      await (service as any)
        .from("receipts")
        .update({ status: "error", parse_error: "Failed to download image from storage" })
        .eq("id", id);
      return NextResponse.json({ error: "Failed to download receipt image" }, { status: 500 });
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = fileData.type || "image/jpeg";

    // Call Claude vision
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let parseResult: any;
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: `You are a receipt parsing expert for a trades/contractor business. Extract ALL information from this receipt image.

Return a JSON object with this EXACT structure (no markdown, no code fences, just raw JSON):
{
  "vendor_name": "Store or supplier name",
  "receipt_date": "YYYY-MM-DD",
  "receipt_number": "Transaction/receipt number if visible",
  "payment_method": "cash/credit/debit/account/check",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "confidence": 0.95,
  "line_items": [
    {
      "description": "Item name/description",
      "quantity": 1,
      "unit_price": 0.00,
      "line_total": 0.00,
      "sku": "SKU if visible or null",
      "upc": "UPC/barcode if visible or null"
    }
  ]
}

Rules:
- Extract EVERY line item, even if partially visible
- For trades receipts, include pipe fittings, wire, connectors, tools, etc.
- If quantity or price is unclear, make your best estimate and lower the confidence
- confidence should be 0.0-1.0 reflecting overall parsing accuracy
- Dates should be ISO format (YYYY-MM-DD)
- Amounts should be numbers, not strings
- Return ONLY the JSON object, nothing else`,
              },
            ],
          },
        ],
      });

      // Extract text content from response
      const textBlock = message.content.find((b: any) => b.type === "text");
      const rawText = textBlock ? (textBlock as any).text : "";

      // Parse JSON from response (handle potential markdown fences)
      const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parseResult = JSON.parse(jsonStr);
    } catch (parseErr: any) {
      log.error({ event: "vision_parse_failed" }, "Claude vision parse failed", parseErr);
      await (service as any)
        .from("receipts")
        .update({
          status: "error",
          parse_error: `Vision parse failed: ${parseErr.message}`,
        })
        .eq("id", id);
      return NextResponse.json({ error: "Receipt parsing failed" }, { status: 500 });
    }

    // Update receipt with parsed data
    const { error: updateErr } = await (service as any)
      .from("receipts")
      .update({
        status: "parsed",
        vendor_name: parseResult.vendor_name || null,
        receipt_date: parseResult.receipt_date || null,
        receipt_number: parseResult.receipt_number || null,
        payment_method: parseResult.payment_method || null,
        subtotal: parseResult.subtotal ?? null,
        tax_amount: parseResult.tax_amount ?? null,
        total_amount: parseResult.total_amount ?? null,
        parse_confidence: parseResult.confidence ?? null,
        raw_parse_json: parseResult,
        parsed_at: new Date().toISOString(),
        parse_error: null,
      })
      .eq("id", id);

    if (updateErr) {
      log.error({ event: "update_failed" }, "Failed to update receipt with parse results", updateErr);
    }

    // Create line items
    const lineItems = (parseResult.line_items || []).map((item: any) => ({
      receipt_id: id,
      account_id: account.id,
      description: item.description || "Unknown item",
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? null,
      line_total: item.line_total ?? null,
      sku: item.sku || null,
      upc: item.upc || null,
    }));

    if (lineItems.length > 0) {
      const { error: itemsErr } = await (service as any)
        .from("receipt_line_items")
        .insert(lineItems);

      if (itemsErr) {
        log.error({ event: "line_items_insert_failed" }, "Failed to insert line items", itemsErr);
      }
    }

    log.info({ event: "receipt_parsed" }, `Receipt ${id} parsed: ${lineItems.length} items, vendor=${parseResult.vendor_name}, total=$${parseResult.total_amount}`);

    return NextResponse.json({
      success: true,
      receipt: {
        id,
        status: "parsed",
        vendor_name: parseResult.vendor_name,
        total_amount: parseResult.total_amount,
        line_items_count: lineItems.length,
        confidence: parseResult.confidence,
      },
    });
  } catch (err) {
    log.error({ event: "parse_error" }, "POST /api/receipts/[id]/parse error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
