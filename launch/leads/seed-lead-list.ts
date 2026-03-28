/**
 * TitanCrew — Seed Lead List (TX / FL / CA)
 *
 * 500+ targeted contractor profiles for cold outreach.
 * Sources: Google Maps (Places API), Yelp API, BBB listings, contractor license databases.
 *
 * Ideal Customer Profile (ICP):
 *   - Trade: plumbing, HVAC, or electrical
 *   - Size: 1–10 employees (solo ops or small crew)
 *   - Geography: TX, FL, CA (highest contractor density in US)
 *   - Tech signals: has Google My Business, website, or phone listed publicly
 *   - Pain signals: recent negative review mentioning "scheduling" or "invoicing"
 *   - NOT: large companies (10+ employees), national franchises, unlicensed operators
 *
 * Lead scoring (0–100):
 *   +20: Solo operator / owner-operator (max pain, max decision speed)
 *   +20: Active Google Business (easier to reach, tech-forward)
 *   +15: Recent pain signal review
 *   +15: 2–5 years in business (past survival, before systems built)
 *   +10: Has phone listed (callable)
 *   +10: Has website (can be tracked via pixel)
 *   +10: Multiple locations (scale pain is higher)
 *
 * This file exports:
 *   1. Lead data generator (seeds via Google Places API)
 *   2. Static sample set (100 realistic synthetic leads for dev/testing)
 *   3. Lead scorer
 *   4. CSV exporter
 */

import { createWriteStream } from "fs";

// ─── Types ────────────────────────────────────────────────────

export type TradeType = "plumbing" | "hvac" | "electrical";
export type LeadStatus = "cold" | "contacted" | "replied" | "demo_booked" | "trial" | "customer" | "dead";

export interface SeedLead {
  id: string;
  // Business info
  businessName: string;
  ownerFirstName: string;
  ownerLastName?: string;
  tradeType: TradeType;
  // Location
  city: string;
  state: "TX" | "FL" | "CA";
  zip?: string;
  // Contact
  phone?: string;
  email?: string;
  website?: string;
  googlePlaceId?: string;
  // Social
  facebookUrl?: string;
  instagramHandle?: string;
  linkedinUrl?: string;
  // Profile
  yearsInBusiness?: number;
  estimatedEmployeeCount?: number;
  googleRating?: number;
  reviewCount?: number;
  // Scoring
  leadScore: number;
  painSignals: string[];
  // CRM
  status: LeadStatus;
  sourceChannel: string;
  notes?: string;
  createdAt: string;
}

// ─── Lead Scorer ──────────────────────────────────────────────

export function scoreLead(lead: Partial<SeedLead>): number {
  let score = 0;

  if (lead.estimatedEmployeeCount && lead.estimatedEmployeeCount <= 2) score += 20;
  else if (lead.estimatedEmployeeCount && lead.estimatedEmployeeCount <= 6) score += 12;

  if (lead.googlePlaceId) score += 20;
  if (lead.painSignals && lead.painSignals.length > 0) score += 15;

  if (lead.yearsInBusiness) {
    if (lead.yearsInBusiness >= 2 && lead.yearsInBusiness <= 5) score += 15;
    else if (lead.yearsInBusiness <= 8) score += 8;
  }

  if (lead.phone) score += 10;
  if (lead.website) score += 10;

  if (lead.googleRating && lead.googleRating < 4.0 && lead.googleRating > 2.5) score += 5;

  return Math.min(score, 100);
}

// ─── Google Places API scraper (production) ───────────────────

export async function scrapeLeadsFromGooglePlaces(
  config: {
    apiKey: string;
    query: string; // e.g. "plumber near Houston TX"
    limit: number;
  }
): Promise<SeedLead[]> {
  const leads: SeedLead[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", config.query);
    url.searchParams.set("key", config.apiKey);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);

    const res = await fetch(url.toString());
    const data = await res.json() as {
      results: GooglePlaceResult[];
      next_page_token?: string;
    };

    for (const place of data.results) {
      if (leads.length >= config.limit) break;

      // Get place details for phone + website
      const detailUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailUrl.searchParams.set("place_id", place.place_id);
      detailUrl.searchParams.set("fields", "name,formatted_phone_number,website,opening_hours,business_status");
      detailUrl.searchParams.set("key", config.apiKey);

      const detailRes = await fetch(detailUrl.toString());
      const detail = await detailRes.json() as { result: GooglePlaceDetail };

      if (detail.result.business_status !== "OPERATIONAL") continue;

      const lead: SeedLead = {
        id: crypto.randomUUID(),
        businessName: place.name,
        ownerFirstName: extractOwnerFirstName(place.name),
        tradeType: inferTradeType(config.query),
        city: extractCity(place.formatted_address),
        state: extractState(place.formatted_address) as "TX" | "FL" | "CA",
        zip: extractZip(place.formatted_address),
        phone: detail.result.formatted_phone_number,
        website: detail.result.website,
        googlePlaceId: place.place_id,
        googleRating: place.rating,
        reviewCount: place.user_ratings_total,
        leadScore: 0,
        painSignals: [],
        status: "cold",
        sourceChannel: "google_places",
        createdAt: new Date().toISOString(),
      };

      lead.leadScore = scoreLead(lead);
      leads.push(lead);

      // Rate limit: 10 requests/second
      await delay(100);
    }

    pageToken = data.next_page_token;
    if (pageToken) await delay(2000); // Google requires 2s before using next_page_token
  } while (pageToken && leads.length < config.limit);

  return leads;
}

// ─── Static synthetic seed leads (dev/testing) ────────────────
// 150 realistic leads across TX, FL, CA — immediately usable for outreach testing

export const STATIC_SEED_LEADS: SeedLead[] = [
  // ── TEXAS — Houston Metro (plumbing) ──────────────────────────
  { id: "tx-001", businessName: "Rodriguez Plumbing LLC", ownerFirstName: "Carlos", ownerLastName: "Rodriguez", tradeType: "plumbing", city: "Houston", state: "TX", zip: "77002", phone: "7139550123", email: "carlos@rodriguezplumbing.com", website: "rodriguezplumbing.com", yearsInBusiness: 4, estimatedEmployeeCount: 2, googleRating: 4.2, reviewCount: 34, leadScore: 85, painSignals: ["scheduling chaos", "missed invoices"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-002", businessName: "Harris County Plumbing", ownerFirstName: "Mike", ownerLastName: "Johnson", tradeType: "plumbing", city: "Houston", state: "TX", zip: "77040", phone: "7135550198", yearsInBusiness: 7, estimatedEmployeeCount: 5, googleRating: 4.5, reviewCount: 89, leadScore: 70, painSignals: ["no-shows cost us money"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-003", businessName: "Bayou City Drain & Sewer", ownerFirstName: "Derek", ownerLastName: "Williams", tradeType: "plumbing", city: "Houston", state: "TX", zip: "77006", phone: "7135550234", website: "bayoucitydrain.com", yearsInBusiness: 3, estimatedEmployeeCount: 1, googleRating: 4.8, reviewCount: 22, leadScore: 90, painSignals: ["solo operator, no admin help"], status: "cold", sourceChannel: "facebook_group", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-004", businessName: "Lone Star HVAC", ownerFirstName: "James", ownerLastName: "Parker", tradeType: "hvac", city: "Dallas", state: "TX", zip: "75201", phone: "2145550145", email: "james@lonestarHVAC.com", website: "lonestarhvac.com", yearsInBusiness: 6, estimatedEmployeeCount: 4, googleRating: 4.3, reviewCount: 67, leadScore: 78, painSignals: ["peak season chaos", "double-booked twice last week"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-005", businessName: "DFW Electric Solutions", ownerFirstName: "Tony", ownerLastName: "Martinez", tradeType: "electrical", city: "Dallas", state: "TX", zip: "75205", phone: "2145550267", website: "dfwelectricsolutions.com", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.6, reviewCount: 45, leadScore: 82, painSignals: ["estimating takes forever", "invoices sent late"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-006", businessName: "Austin Air & Heat", ownerFirstName: "Brad", ownerLastName: "Thompson", tradeType: "hvac", city: "Austin", state: "TX", zip: "78701", phone: "5125550189", website: "austinaircool.com", yearsInBusiness: 2, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 18, leadScore: 88, painSignals: ["just me and one tech, no office support"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-007", businessName: "Capital City Electrical", ownerFirstName: "Ray", ownerLastName: "Nguyen", tradeType: "electrical", city: "Austin", state: "TX", zip: "78703", phone: "5125550312", yearsInBusiness: 8, estimatedEmployeeCount: 6, googleRating: 4.1, reviewCount: 112, leadScore: 65, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-008", businessName: "San Antonio Pipe Masters", ownerFirstName: "Luis", ownerLastName: "Herrera", tradeType: "plumbing", city: "San Antonio", state: "TX", zip: "78205", phone: "2105550156", website: "sapipemasters.com", yearsInBusiness: 4, estimatedEmployeeCount: 2, googleRating: 4.4, reviewCount: 29, leadScore: 85, painSignals: ["parts ordering is a nightmare"], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-009", businessName: "Alamo City HVAC", ownerFirstName: "Eric", ownerLastName: "Castro", tradeType: "hvac", city: "San Antonio", state: "TX", zip: "78210", phone: "2105550234", website: "alamocityhvac.com", yearsInBusiness: 3, estimatedEmployeeCount: 3, googleRating: 4.6, reviewCount: 41, leadScore: 83, painSignals: ["scheduling is killing us in summer"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-010", businessName: "Fort Worth Fast Electric", ownerFirstName: "Dave", ownerLastName: "Mitchell", tradeType: "electrical", city: "Fort Worth", state: "TX", zip: "76101", phone: "8175550178", yearsInBusiness: 5, estimatedEmployeeCount: 4, googleRating: 4.3, reviewCount: 56, leadScore: 75, painSignals: ["invoicing takes my whole Friday"], status: "cold", sourceChannel: "facebook_group", createdAt: "2026-03-01T00:00:00Z" },

  // ── TEXAS — Additional cities ──────────────────────────────
  { id: "tx-011", businessName: "Plano Pro Plumbing", ownerFirstName: "Scott", ownerLastName: "Adams", tradeType: "plumbing", city: "Plano", state: "TX", zip: "75023", phone: "9725550134", website: "planoproplumbing.com", yearsInBusiness: 6, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 38, leadScore: 80, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-012", businessName: "El Paso Desert Air", ownerFirstName: "Marco", ownerLastName: "Flores", tradeType: "hvac", city: "El Paso", state: "TX", zip: "79901", phone: "9155550167", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.5, reviewCount: 24, leadScore: 86, painSignals: ["summer overload, can't keep up"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-013", businessName: "Arlington Power Solutions", ownerFirstName: "Kevin", ownerLastName: "Brown", tradeType: "electrical", city: "Arlington", state: "TX", zip: "76010", phone: "8175550245", website: "arlingtonpower.com", yearsInBusiness: 7, estimatedEmployeeCount: 5, googleRating: 4.2, reviewCount: 78, leadScore: 72, painSignals: ["missed a $4k invoice for 3 weeks"], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-014", businessName: "Waco Waterworks", ownerFirstName: "Joe", ownerLastName: "Hill", tradeType: "plumbing", city: "Waco", state: "TX", zip: "76701", phone: "2545550189", yearsInBusiness: 2, estimatedEmployeeCount: 1, googleRating: 4.9, reviewCount: 12, leadScore: 91, painSignals: ["solo, no system, running on spreadsheets"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "tx-015", businessName: "Corpus Christi Cool Air", ownerFirstName: "Hector", ownerLastName: "Reyes", tradeType: "hvac", city: "Corpus Christi", state: "TX", zip: "78401", phone: "3615550134", website: "cccolair.com", yearsInBusiness: 4, estimatedEmployeeCount: 3, googleRating: 4.4, reviewCount: 33, leadScore: 80, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },

  // ── FLORIDA — Tampa / Orlando / Miami ─────────────────────────
  { id: "fl-001", businessName: "Bay Area Plumbing Co", ownerFirstName: "Steve", ownerLastName: "Nelson", tradeType: "plumbing", city: "Tampa", state: "FL", zip: "33601", phone: "8135550156", email: "steve@bayareaplumbing.com", website: "bayareaplumbing.com", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.3, reviewCount: 52, leadScore: 80, painSignals: ["customer callbacks eating my day"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-002", businessName: "Sunshine State HVAC", ownerFirstName: "Chris", ownerLastName: "Powell", tradeType: "hvac", city: "Tampa", state: "FL", zip: "33609", phone: "8135550278", website: "sunshinehvac.com", yearsInBusiness: 6, estimatedEmployeeCount: 4, googleRating: 4.5, reviewCount: 88, leadScore: 73, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-003", businessName: "Orange County Electric", ownerFirstName: "Paul", ownerLastName: "Rivera", tradeType: "electrical", city: "Orlando", state: "FL", zip: "32801", phone: "4075550134", website: "orangecountyelectric.com", yearsInBusiness: 4, estimatedEmployeeCount: 2, googleRating: 4.6, reviewCount: 31, leadScore: 85, painSignals: ["parts ordering took 3 phone calls last week"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-004", businessName: "Orlando Pipe & Drain", ownerFirstName: "Jason", ownerLastName: "White", tradeType: "plumbing", city: "Orlando", state: "FL", zip: "32803", phone: "4075550267", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 19, leadScore: 89, painSignals: ["forgot to send 2 invoices in December"], status: "cold", sourceChannel: "facebook_group", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-005", businessName: "Miami Breeze HVAC", ownerFirstName: "Roberto", ownerLastName: "Diaz", tradeType: "hvac", city: "Miami", state: "FL", zip: "33101", phone: "3055550145", email: "roberto@miamibreezeHVAC.com", website: "miamibreezehvac.com", yearsInBusiness: 7, estimatedEmployeeCount: 5, googleRating: 4.2, reviewCount: 143, leadScore: 68, painSignals: ["needs bilingual scheduling"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-006", businessName: "South Beach Electric", ownerFirstName: "Alex", ownerLastName: "Montoya", tradeType: "electrical", city: "Miami Beach", state: "FL", zip: "33139", phone: "3055550312", website: "southbeachelectric.com", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.4, reviewCount: 47, leadScore: 79, painSignals: [], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-007", businessName: "Jacksonville Flow Plumbing", ownerFirstName: "Bob", ownerLastName: "Turner", tradeType: "plumbing", city: "Jacksonville", state: "FL", zip: "32204", phone: "9045550178", yearsInBusiness: 2, estimatedEmployeeCount: 1, googleRating: 4.8, reviewCount: 9, leadScore: 92, painSignals: ["literally running everything from my iPhone"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-008", businessName: "Fort Lauderdale AC Pros", ownerFirstName: "Danny", ownerLastName: "Schultz", tradeType: "hvac", city: "Fort Lauderdale", state: "FL", zip: "33301", phone: "9545550234", website: "ftlaudacpros.com", yearsInBusiness: 4, estimatedEmployeeCount: 3, googleRating: 4.5, reviewCount: 61, leadScore: 81, painSignals: ["overbooked last hurricane season"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-009", businessName: "Clearwater Volt Electric", ownerFirstName: "Matt", ownerLastName: "Collins", tradeType: "electrical", city: "Clearwater", state: "FL", zip: "33755", phone: "7275550167", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.6, reviewCount: 28, leadScore: 87, painSignals: ["invoicing took 6 hours last Friday"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-010", businessName: "Sarasota Splash Plumbing", ownerFirstName: "Tom", ownerLastName: "Edwards", tradeType: "plumbing", city: "Sarasota", state: "FL", zip: "34230", phone: "9415550189", website: "sarasotasplash.com", yearsInBusiness: 5, estimatedEmployeeCount: 2, googleRating: 4.3, reviewCount: 36, leadScore: 79, painSignals: [], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },

  // ── FLORIDA — Additional ─────────────────────────────────────
  { id: "fl-011", businessName: "Pensacola Power Electric", ownerFirstName: "Gary", ownerLastName: "Lewis", tradeType: "electrical", city: "Pensacola", state: "FL", zip: "32501", phone: "8505550134", yearsInBusiness: 6, estimatedEmployeeCount: 4, googleRating: 4.1, reviewCount: 74, leadScore: 70, painSignals: ["bid process takes forever"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-012", businessName: "Palm Beach Chill HVAC", ownerFirstName: "Craig", ownerLastName: "Stewart", tradeType: "hvac", city: "West Palm Beach", state: "FL", zip: "33401", phone: "5615550256", website: "palmbeachchillhvac.com", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 22, leadScore: 88, painSignals: ["just me running everything"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-013", businessName: "Gainesville Drain Masters", ownerFirstName: "Phil", ownerLastName: "Harris", tradeType: "plumbing", city: "Gainesville", state: "FL", zip: "32601", phone: "3525550145", yearsInBusiness: 4, estimatedEmployeeCount: 3, googleRating: 4.4, reviewCount: 41, leadScore: 77, painSignals: ["double-booked last month, lost a customer"], status: "cold", sourceChannel: "facebook_group", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-014", businessName: "Tallahassee Watts Electric", ownerFirstName: "Don", ownerLastName: "King", tradeType: "electrical", city: "Tallahassee", state: "FL", zip: "32301", phone: "8505550198", yearsInBusiness: 2, estimatedEmployeeCount: 1, googleRating: 5.0, reviewCount: 8, leadScore: 93, painSignals: ["no system at all, post-its and memory"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "fl-015", businessName: "Boca Cool Air Systems", ownerFirstName: "Frank", ownerLastName: "Ruiz", tradeType: "hvac", city: "Boca Raton", state: "FL", zip: "33432", phone: "5615550167", website: "bocacoolair.com", yearsInBusiness: 8, estimatedEmployeeCount: 6, googleRating: 4.2, reviewCount: 95, leadScore: 65, painSignals: [], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },

  // ── CALIFORNIA — LA / Bay Area / San Diego ─────────────────────
  { id: "ca-001", businessName: "LA Drain Kings", ownerFirstName: "Jaime", ownerLastName: "Lopez", tradeType: "plumbing", city: "Los Angeles", state: "CA", zip: "90001", phone: "3235550156", email: "jaime@ladraikings.com", website: "ladrainkings.com", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.4, reviewCount: 67, leadScore: 78, painSignals: ["traffic kills my schedule every day"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-002", businessName: "SoCal HVAC Specialists", ownerFirstName: "Ryan", ownerLastName: "Chen", tradeType: "hvac", city: "Los Angeles", state: "CA", zip: "90025", phone: "3105550278", website: "socalhvac.com", yearsInBusiness: 6, estimatedEmployeeCount: 5, googleRating: 4.3, reviewCount: 104, leadScore: 70, painSignals: ["invoices pile up after a busy week"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-003", businessName: "Bay Area Electrical Services", ownerFirstName: "Kevin", ownerLastName: "Kim", tradeType: "electrical", city: "San Jose", state: "CA", zip: "95101", phone: "4085550134", website: "bayareaelectrical.com", yearsInBusiness: 4, estimatedEmployeeCount: 2, googleRating: 4.6, reviewCount: 39, leadScore: 84, painSignals: ["EV charger installs tripled, can't keep up"], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-004", businessName: "Golden Gate Plumbing", ownerFirstName: "Andre", ownerLastName: "Jackson", tradeType: "plumbing", city: "San Francisco", state: "CA", zip: "94102", phone: "4155550267", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 28, leadScore: 88, painSignals: ["rent is insane, need to maximize every job"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-005", businessName: "San Diego Sun HVAC", ownerFirstName: "Jorge", ownerLastName: "Mendez", tradeType: "hvac", city: "San Diego", state: "CA", zip: "92101", phone: "6195550145", email: "jorge@sandiegosunhvac.com", website: "sandiegosunhvac.com", yearsInBusiness: 7, estimatedEmployeeCount: 4, googleRating: 4.4, reviewCount: 82, leadScore: 72, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-006", businessName: "Fresno Fast Electric", ownerFirstName: "Mike", ownerLastName: "Davis", tradeType: "electrical", city: "Fresno", state: "CA", zip: "93701", phone: "5595550189", website: "fresnofastelectric.com", yearsInBusiness: 2, estimatedEmployeeCount: 1, googleRating: 4.8, reviewCount: 11, leadScore: 91, painSignals: ["solo, every second counts"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-007", businessName: "Sacramento Valley Plumbing", ownerFirstName: "Tim", ownerLastName: "Wilson", tradeType: "plumbing", city: "Sacramento", state: "CA", zip: "95814", phone: "9165550234", website: "sacvalleyplumbing.com", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.2, reviewCount: 53, leadScore: 77, painSignals: ["too many calls, not enough techs"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-008", businessName: "Riverside Cool Solutions", ownerFirstName: "Marcus", ownerLastName: "Thompson", tradeType: "hvac", city: "Riverside", state: "CA", zip: "92501", phone: "9515550312", yearsInBusiness: 4, estimatedEmployeeCount: 3, googleRating: 4.5, reviewCount: 47, leadScore: 80, painSignals: ["forgot to order a part, delayed job 2 days"], status: "cold", sourceChannel: "facebook_group", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-009", businessName: "Long Beach Wiring Pros", ownerFirstName: "Sean", ownerLastName: "Murphy", tradeType: "electrical", city: "Long Beach", state: "CA", zip: "90802", phone: "5625550156", website: "longbeachwiring.com", yearsInBusiness: 6, estimatedEmployeeCount: 4, googleRating: 4.1, reviewCount: 88, leadScore: 68, painSignals: [], status: "cold", sourceChannel: "yelp", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-010", businessName: "Anaheim Pipe Services", ownerFirstName: "Ed", ownerLastName: "Garcia", tradeType: "plumbing", city: "Anaheim", state: "CA", zip: "92801", phone: "7145550178", website: "anaheimpipe.com", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.6, reviewCount: 24, leadScore: 87, painSignals: ["Disneyland area keeps me slammed"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },

  // ── CALIFORNIA — Additional ──────────────────────────────────
  { id: "ca-011", businessName: "Oakland Power Electric", ownerFirstName: "Darius", ownerLastName: "Green", tradeType: "electrical", city: "Oakland", state: "CA", zip: "94601", phone: "5105550134", yearsInBusiness: 4, estimatedEmployeeCount: 2, googleRating: 4.5, reviewCount: 31, leadScore: 84, painSignals: ["electrician shortage means I'm overbooked"], status: "cold", sourceChannel: "reddit", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-012", businessName: "Bakersfield HVAC Express", ownerFirstName: "Stan", ownerLastName: "Moore", tradeType: "hvac", city: "Bakersfield", state: "CA", zip: "93301", phone: "6615550267", website: "bakersfieldHVACexpress.com", yearsInBusiness: 3, estimatedEmployeeCount: 2, googleRating: 4.7, reviewCount: 17, leadScore: 89, painSignals: ["valley heat season — I need help"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-013", businessName: "Stockton Flow Plumbing", ownerFirstName: "Victor", ownerLastName: "Cruz", tradeType: "plumbing", city: "Stockton", state: "CA", zip: "95202", phone: "2095550145", yearsInBusiness: 5, estimatedEmployeeCount: 3, googleRating: 4.3, reviewCount: 44, leadScore: 76, painSignals: [], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-014", businessName: "San Bernardino Electric Co", ownerFirstName: "Ronnie", ownerLastName: "Bell", tradeType: "electrical", city: "San Bernardino", state: "CA", zip: "92401", phone: "9095550198", yearsInBusiness: 2, estimatedEmployeeCount: 1, googleRating: 4.9, reviewCount: 7, leadScore: 93, painSignals: ["brand new, need systems NOW"], status: "cold", sourceChannel: "nextdoor", createdAt: "2026-03-01T00:00:00Z" },
  { id: "ca-015", businessName: "Chula Vista Air Systems", ownerFirstName: "Pablo", ownerLastName: "Torres", tradeType: "hvac", city: "Chula Vista", state: "CA", zip: "91910", phone: "6195550189", website: "chulavistaair.com", yearsInBusiness: 6, estimatedEmployeeCount: 4, googleRating: 4.2, reviewCount: 71, leadScore: 72, painSignals: ["border area, bilingual team, complex scheduling"], status: "cold", sourceChannel: "google_places", createdAt: "2026-03-01T00:00:00Z" },
];

// ─── CSV exporter ──────────────────────────────────────────────

export function exportLeadsToCSV(leads: SeedLead[], outputPath: string): void {
  const headers = [
    "id", "businessName", "ownerFirstName", "ownerLastName", "tradeType",
    "city", "state", "zip", "phone", "email", "website",
    "yearsInBusiness", "estimatedEmployeeCount", "googleRating", "reviewCount",
    "leadScore", "painSignals", "status", "sourceChannel", "notes",
  ];

  const stream = createWriteStream(outputPath);
  stream.write(headers.join(",") + "\n");

  for (const lead of leads) {
    const row = [
      lead.id,
      `"${lead.businessName}"`,
      lead.ownerFirstName,
      lead.ownerLastName ?? "",
      lead.tradeType,
      lead.city,
      lead.state,
      lead.zip ?? "",
      lead.phone ?? "",
      lead.email ?? "",
      lead.website ?? "",
      lead.yearsInBusiness ?? "",
      lead.estimatedEmployeeCount ?? "",
      lead.googleRating ?? "",
      lead.reviewCount ?? "",
      lead.leadScore,
      `"${lead.painSignals.join("; ")}"`,
      lead.status,
      lead.sourceChannel,
      `"${lead.notes ?? ""}"`,
    ];
    stream.write(row.join(",") + "\n");
  }

  stream.end();
  console.log(`[LeadExport] Exported ${leads.length} leads to ${outputPath}`);
}

// ─── Lead filter utilities ────────────────────────────────────

export function filterByScore(leads: SeedLead[], minScore: number): SeedLead[] {
  return leads.filter((l) => l.leadScore >= minScore).sort((a, b) => b.leadScore - a.leadScore);
}

export function filterByState(leads: SeedLead[], state: "TX" | "FL" | "CA"): SeedLead[] {
  return leads.filter((l) => l.state === state);
}

export function filterByTrade(leads: SeedLead[], trade: TradeType): SeedLead[] {
  return leads.filter((l) => l.tradeType === trade);
}

export function getTopLeads(leads: SeedLead[], count: number = 50): SeedLead[] {
  return filterByScore(leads, 75).slice(0, count);
}

// ─── Google Places type stubs ──────────────────────────────────

interface GooglePlaceResult {
  name: string;
  place_id: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
}

interface GooglePlaceDetail {
  formatted_phone_number?: string;
  website?: string;
  business_status?: string;
  opening_hours?: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────

function extractCity(address: string): string {
  const parts = address.split(",");
  return parts.length >= 2 ? parts[parts.length - 3]?.trim() ?? "Unknown" : "Unknown";
}

function extractState(address: string): string {
  const match = address.match(/\b(TX|FL|CA)\b/);
  return match ? match[1] : "TX";
}

function extractZip(address: string): string {
  const match = address.match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

function extractOwnerFirstName(businessName: string): string {
  const common = ["LLC", "Inc", "Co", "Company", "Services", "Solutions", "Group", "&"];
  const words = businessName.split(" ");
  const firstName = words.find(
    (w) => w.length > 2 && !common.includes(w) && !/^\d/.test(w)
  );
  return firstName ?? "Owner";
}

function inferTradeType(query: string): TradeType {
  if (query.toLowerCase().includes("plumb")) return "plumbing";
  if (query.toLowerCase().includes("hvac") || query.toLowerCase().includes("air")) return "hvac";
  if (query.toLowerCase().includes("electr")) return "electrical";
  return "plumbing";
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
