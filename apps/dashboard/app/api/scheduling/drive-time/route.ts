// @ts-nocheck
/**
 * TitanCrew · Google Maps Drive Time API Route
 *
 * POST /api/scheduling/drive-time
 *
 * Calculates drive time and distance between two locations using the
 * Google Maps Distance Matrix API. Used by the Scheduling Agent to:
 *  - Optimize tech routing (shortest drive between consecutive jobs)
 *  - Add realistic travel buffers to the schedule
 *  - Flag jobs that are too far apart (>2hr drive)
 *
 * Body: {
 *   origins: string[];      // ["123 Main St, Dallas TX"]
 *   destinations: string[]; // ["456 Oak Ave, Fort Worth TX"]
 *   departureTime?: string; // ISO datetime (defaults to now)
 * }
 *
 * Returns: {
 *   rows: [{
 *     elements: [{
 *       distance: { text: "32.1 mi", value: 51667 },
 *       duration: { text: "38 mins", value: 2280 },
 *       durationInTraffic?: { text: "45 mins", value: 2700 },
 *       status: "OK"
 *     }]
 *   }]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const AGENT_SECRET = process.env.AGENT_API_SECRET ?? "";

export async function POST(req: NextRequest) {
  // ── Auth: agent secret or user session ──────────────────────
  const secret = req.headers.get("x-titancrew-secret");
  if (secret !== AGENT_SECRET) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!GOOGLE_MAPS_KEY) {
    return NextResponse.json(
      { error: "Google Maps API key not configured" },
      { status: 500 }
    );
  }

  const { origins, destinations, departureTime } = await req.json();

  if (!origins?.length || !destinations?.length) {
    return NextResponse.json(
      { error: "origins and destinations arrays required" },
      { status: 400 }
    );
  }

  // Max 25 origins x 25 destinations per request (Google limit)
  if (origins.length > 25 || destinations.length > 25) {
    return NextResponse.json(
      { error: "Maximum 25 origins and 25 destinations per request" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({
      origins: origins.join("|"),
      destinations: destinations.join("|"),
      key: GOOGLE_MAPS_KEY,
      units: "imperial",
      mode: "driving",
    });

    // Add real-time traffic if departure time provided
    if (departureTime) {
      const depUnix = Math.floor(new Date(departureTime).getTime() / 1000);
      params.set("departure_time", String(depUnix));
      params.set("traffic_model", "best_guess");
    } else {
      // Default to "now" for real-time traffic
      params.set("departure_time", "now");
    }

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Google Maps API error" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== "OK") {
      return NextResponse.json(
        { error: `Google Maps API: ${data.status}`, detail: data.error_message },
        { status: 502 }
      );
    }

    // ── Enrich with TitanCrew-specific fields ───────────────────
    const enrichedRows = data.rows.map((row: any, rowIdx: number) => ({
      origin: data.origin_addresses[rowIdx],
      elements: row.elements.map((el: any, elIdx: number) => ({
        destination: data.destination_addresses[elIdx],
        distance: el.distance,
        duration: el.duration,
        durationInTraffic: el.duration_in_traffic ?? null,
        status: el.status,
        // TitanCrew scheduling helpers
        driveMins: el.duration
          ? Math.ceil(el.duration.value / 60)
          : null,
        driveWithTrafficMins: el.duration_in_traffic
          ? Math.ceil(el.duration_in_traffic.value / 60)
          : null,
        // Add 15% buffer for parking/loading at commercial sites
        bufferedMins: el.duration_in_traffic
          ? Math.ceil((el.duration_in_traffic.value / 60) * 1.15)
          : el.duration
            ? Math.ceil((el.duration.value / 60) * 1.15)
            : null,
        isTooFar: el.duration
          ? el.duration.value > 7200 // >2 hours
          : false,
      })),
    }));

    return NextResponse.json({
      success: true,
      rows: enrichedRows,
      originAddresses: data.origin_addresses,
      destinationAddresses: data.destination_addresses,
    });
  } catch (err) {
    console.error("[Drive Time API]", err);
    return NextResponse.json(
      { error: "Failed to calculate drive times" },
      { status: 500 }
    );
  }
}
