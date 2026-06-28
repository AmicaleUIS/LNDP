// ============================================================
// LE NID DES PRONOS — SUPABASE EDGE FUNCTION
// sync-football
// Provider: API-Football / API-Sports v3
// ============================================================
//
// Actions disponibles :
// - { "mode": "fixtures" } : importe / met à jour tous les matchs de la compétition
// - { "mode": "live" }     : met à jour les matchs en direct
// - { "mode": "all" }      : fixtures puis live
// - { "mode": "debug" }    : teste la connexion API et retourne les infos brutes utiles
//
// Sécurité :
// - appel depuis l'admin web : vérifie le JWT utilisateur + role admin dans profiles
// - appel cron : accepte le header x-sync-secret si égal au secret SYNC_SECRET
//
// Secrets requis dans Supabase Edge Functions :
// - API_FOOTBALL_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - SYNC_SECRET optionnel, mais conseillé pour Cron
//
// Déploiement conseillé :
// supabase functions deploy sync-football --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SyncMode = "fixtures" | "live" | "all" | "debug";

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long?: string; elapsed?: number | null };
    venue?: { name?: string | null; city?: string | null };
  };
  league?: { round?: string | null };
  teams: {
    home: { id: number; name: string; logo?: string | null; winner?: boolean | null };
    away: { id: number; name: string; logo?: string | null; winner?: boolean | null };
  };
  goals?: { home: number | null; away: number | null };
};

type ApiFootballResponse<T> = {
  get?: string;
  parameters?: Record<string, unknown>;
  errors?: unknown;
  results?: number;
  response: T[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_BASE_URL = "https://v3.football.api-sports.io";
const WORLD_CUP_LEAGUE_ID = Number(Deno.env.get("API_FOOTBALL_LEAGUE_ID") || "1");
const WORLD_CUP_SEASON = Number(Deno.env.get("API_FOOTBALL_SEASON") || "2026");
const COMPETITION_SLUG = Deno.env.get("COMPETITION_SLUG") || "world-cup-2026";
const FRANCE_TZ = Deno.env.get("APP_TIMEZONE") || "Europe/Paris";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const apiFootballKey = Deno.env.get("API_FOOTBALL_KEY")!;
const syncSecret = Deno.env.get("SYNC_SECRET") || "";

const adminDb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Méthode non autorisée. Utilise POST." }, 405);
  }

  try {
    if (!apiFootballKey) {
      return json({ ok: false, error: "Secret API_FOOTBALL_KEY manquant." }, 500);
    }

    const allowed = await isAllowed(req);
    if (!allowed.ok) {
      return json({ ok: false, error: allowed.error }, 401);
    }

    const body = await safeJson(req);
    const mode: SyncMode = ["fixtures", "live", "all", "debug"].includes(body.mode) ? body.mode : "fixtures";

    const result: Record<string, unknown> = {
      mode,
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      competitionSlug: COMPETITION_SLUG,
    };

    if (mode === "debug") {
      result.debug = await debugApiFootball();
      return json({ ok: true, ...result });
    }

    if (mode === "fixtures" || mode === "all") {
      result.fixtures = await syncFixtures();
    }

    if (mode === "live" || mode === "all") {
      result.live = await syncLiveFixtures();
    }

    return json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function safeJson(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function isAllowed(req: Request): Promise<{ ok: true } | { ok: false; error: string }> {
  const headerSecret = req.headers.get("x-sync-secret") || "";
  if (syncSecret && headerSecret && headerSecret === syncSecret) {
    return { ok: true };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, error: "Non autorisé : JWT ou x-sync-secret manquant." };
  }

  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, error: "Utilisateur non reconnu." };
  }

  const { data: profile, error: profileError } = await adminDb
    .from("profiles")
    .select("role,is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, error: "Profil introuvable." };
  }

  if (profile.role !== "admin" || profile.is_active !== true) {
    return { ok: false, error: "Action réservée à l’admin." };
  }

  return { ok: true };
}

async function apiFootball<T>(path: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": apiFootballKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Football HTTP ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as ApiFootballResponse<T>;
  const apiErrors = normalizeApiErrors(payload.errors);

  if (apiErrors) {
    throw new Error(`API-Football a répondu une erreur : ${apiErrors}`);
  }

  console.log("API-Football response", {
    path,
    params,
    results: payload.results,
    returned: payload.response?.length || 0,
  });

  return payload.response || [];
}

async function debugApiFootball() {
  const url = new URL(`${API_BASE_URL}/fixtures`);
  url.searchParams.set("league", String(WORLD_CUP_LEAGUE_ID));
  url.searchParams.set("season", String(WORLD_CUP_SEASON));

  const response = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": apiFootballKey,
    },
  });

  let payload: ApiFootballResponse<ApiFootballFixture> | Record<string, unknown>;
  try {
    payload = await response.json();
  } catch {
    payload = { rawText: await response.text() };
  }

  const p = payload as ApiFootballResponse<ApiFootballFixture>;
  const first = Array.isArray(p.response) && p.response.length ? p.response[0] : null;

  return {
    request: {
      endpoint: "/fixtures",
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      competitionSlug: COMPETITION_SLUG,
    },
    httpStatus: response.status,
    httpOk: response.ok,
    apiErrors: normalizeApiErrors(p.errors),
    apiResults: p.results ?? null,
    responseLength: Array.isArray(p.response) ? p.response.length : null,
    firstFixture: first
      ? {
          id: first.fixture?.id,
          date: first.fixture?.date,
          status: first.fixture?.status,
          round: first.league?.round,
          home: first.teams?.home?.name,
          away: first.teams?.away?.name,
        }
      : null,
  };
}

function normalizeApiErrors(errors: unknown): string {
  if (!errors) return "";
  if (Array.isArray(errors) && errors.length === 0) return "";
  if (typeof errors === "object" && Object.keys(errors as Record<string, unknown>).length === 0) return "";
  if (typeof errors === "string") return errors;
  try {
    return JSON.stringify(errors);
  } catch {
    return String(errors);
  }
}

async function syncFixtures() {
  const fixtures = await apiFootball<ApiFootballFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
  });

  return await upsertFixtures(fixtures, "fixtures");
}

async function syncLiveFixtures() {
  const fixtures = await apiFootball<ApiFootballFixture>("/fixtures", {
    league: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON,
    live: "all",
  });

  return await upsertFixtures(fixtures, "live");
}

async function upsertFixtures(fixtures: ApiFootballFixture[], source: "fixtures" | "live") {
  if (!fixtures.length) {
    return { fetched: 0, teamsUpserted: 0, matchesUpserted: 0 };
  }

  const competitionId = await getCompetitionId();
  const nowIso = new Date().toISOString();

  const teamPayloads = collectTeams(fixtures);
  const { error: teamUpsertError } = await adminDb
    .from("football_teams")
    .upsert(teamPayloads, { onConflict: "api_team_id" });

  if (teamUpsertError) throw teamUpsertError;

  const apiTeamIds = teamPayloads.map((team) => team.api_team_id);
  const { data: teams, error: teamsError } = await adminDb
    .from("football_teams")
    .select("id,api_team_id")
    .in("api_team_id", apiTeamIds);

  if (teamsError) throw teamsError;

  const teamIdByApiId = new Map<number, string>();
  for (const team of teams || []) {
    teamIdByApiId.set(Number(team.api_team_id), team.id);
  }

  const fixtureIds = fixtures.map((fixture) => fixture.fixture.id);
  const { data: existingMatches, error: existingError } = await adminDb
    .from("matches")
    .select("api_match_id,tv_channel,tv_channel_source")
    .in("api_match_id", fixtureIds);

  if (existingError) throw existingError;

  const existingByApiId = new Map<number, { tv_channel?: string | null; tv_channel_source?: string | null }>();
  for (const match of existingMatches || []) {
    existingByApiId.set(Number(match.api_match_id), match);
  }

  const matchPayloads = fixtures
    .map((fixture) => {
      const homeTeamId = teamIdByApiId.get(fixture.teams.home.id);
      const awayTeamId = teamIdByApiId.get(fixture.teams.away.id);
      if (!homeTeamId || !awayTeamId) return null;

      const existing = existingByApiId.get(fixture.fixture.id);
      const status = mapStatus(fixture.fixture.status.short);
      const homeScore = fixture.goals?.home ?? null;
      const awayScore = fixture.goals?.away ?? null;
      const winnerTeamId = getWinnerTeamId(fixture, homeTeamId, awayTeamId, status, homeScore, awayScore);
      const round = fixture.league?.round || "";

      return {
        competition_id: competitionId,
        api_match_id: fixture.fixture.id,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: fixture.fixture.date,
        match_day: localDateInTimezone(fixture.fixture.date, FRANCE_TZ),
        venue: fixture.fixture.venue?.name || null,
        city: fixture.fixture.venue?.city || null,
        stage: mapStage(round),
        group_name: extractGroupName(round),
        status,
        home_score: homeScore,
        away_score: awayScore,
        winner_team_id: winnerTeamId,
        tv_channel: existing?.tv_channel || "à confirmer",
        tv_channel_source: existing?.tv_channel_source || "unknown",
        last_api_sync_at: nowIso,
        raw_api_payload: fixture,
      };
    })
    .filter(Boolean);

  const { error: matchUpsertError } = await adminDb
    .from("matches")
    .upsert(matchPayloads, { onConflict: "api_match_id" });

  if (matchUpsertError) throw matchUpsertError;

  return {
    source,
    fetched: fixtures.length,
    teamsUpserted: teamPayloads.length,
    matchesUpserted: matchPayloads.length,
  };
}

async function getCompetitionId(): Promise<string> {
  const { data: existing, error: existingError } = await adminDb
    .from("competitions")
    .select("id")
    .eq("slug", COMPETITION_SLUG)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await adminDb
    .from("competitions")
    .insert({
      name: "Coupe du Monde 2026",
      slug: COMPETITION_SLUG,
      season: String(WORLD_CUP_SEASON),
      is_active: true,
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id;
}

function collectTeams(fixtures: ApiFootballFixture[]) {
  const byId = new Map<number, any>();

  for (const fixture of fixtures) {
    for (const side of [fixture.teams.home, fixture.teams.away]) {
      if (!side?.id) continue;
      byId.set(side.id, {
        api_team_id: side.id,
        name: side.name,
        short_name: shortName(side.name),
        country_code: null,
        flag_emoji: flagEmoji(side.name),
        flag_url: side.logo || null,
      });
    }
  }

  return Array.from(byId.values());
}

function mapStatus(short: string) {
  const value = String(short || "NS").toUpperCase();

  if (["NS", "TBD"].includes(value)) return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"].includes(value)) return "live";
  if (["FT", "AET", "PEN"].includes(value)) return "finished";
  if (["PST"].includes(value)) return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(value)) return "cancelled";

  return "scheduled";
}

function mapStage(round: string) {
  const value = round.toLowerCase();

  if (value.includes("final") && !value.includes("semi") && !value.includes("third")) return "final";
  if (value.includes("third")) return "third_place";
  if (value.includes("semi")) return "semi_final";
  if (value.includes("quarter")) return "quarter_final";
  if (value.includes("round of 16") || value.includes("1/8")) return "round_of_16";
  if (value.includes("round of 32") || value.includes("1/16")) return "round_of_32";

  return "group";
}

function extractGroupName(round: string) {
  const groupMatch = round.match(/group\s+([a-z0-9]+)/i);
  if (!groupMatch) return null;
  return groupMatch[1].toUpperCase();
}

function getWinnerTeamId(
  fixture: ApiFootballFixture,
  homeTeamId: string,
  awayTeamId: string,
  status: string,
  homeScore: number | null,
  awayScore: number | null,
) {
  if (fixture.teams.home.winner === true) return homeTeamId;
  if (fixture.teams.away.winner === true) return awayTeamId;

  if (status !== "finished") return null;
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return homeTeamId;
  if (awayScore > homeScore) return awayTeamId;

  return null;
}

function localDateInTimezone(isoDate: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date(isoDate));
}

function shortName(name: string) {
  const clean = String(name || "").replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase();
  return clean.slice(0, 3) || null;
}

function flagEmoji(teamName: string) {
  const flags: Record<string, string> = {
    France: "🇫🇷",
    Italy: "🇮🇹",
    Italie: "🇮🇹",
    Argentina: "🇦🇷",
    Argentine: "🇦🇷",
    Brazil: "🇧🇷",
    Brésil: "🇧🇷",
    Spain: "🇪🇸",
    Espagne: "🇪🇸",
    Germany: "🇩🇪",
    Allemagne: "🇩🇪",
    Morocco: "🇲🇦",
    Maroc: "🇲🇦",
    Japan: "🇯🇵",
    Japon: "🇯🇵",
    England: "🏴",
    Portugal: "🇵🇹",
    Netherlands: "🇳🇱",
    Belgium: "🇧🇪",
    Croatia: "🇭🇷",
    Uruguay: "🇺🇾",
    Mexico: "🇲🇽",
    Canada: "🇨🇦",
    "United States": "🇺🇸",
    USA: "🇺🇸",
    "Saudi Arabia": "🇸🇦",
    Australia: "🇦🇺",
    Switzerland: "🇨🇭",
    Denmark: "🇩🇰",
    Sweden: "🇸🇪",
    Poland: "🇵🇱",
    Senegal: "🇸🇳",
    "South Korea": "🇰🇷",
    Korea: "🇰🇷",
    Iran: "🇮🇷",
    Qatar: "🇶🇦",
    Tunisia: "🇹🇳",
    Serbia: "🇷🇸",
    Ghana: "🇬🇭",
    Cameroon: "🇨🇲",
    Nigeria: "🇳🇬",
    Egypt: "🇪🇬",
    Algeria: "🇩🇿",
    Norway: "🇳🇴",
    Turkey: "🇹🇷",
    Czechia: "🇨🇿",
    "Czech Republic": "🇨🇿",
    Austria: "🇦🇹",
    Scotland: "🏴",
    Wales: "🏴",
  };

  return flags[teamName] || null;
}
