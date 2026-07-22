import { env } from "../config/env.js";

const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Simple in-memory cache so we don't hit Google (and burn quota/money) on
// every single page load. Good enough for a single Render instance; if the
// backend ever scales to multiple instances, move this to Redis/DB instead.
let cache = { data: null, fetchedAt: 0 };

function cacheIsFresh() {
  const ttlMs = env.GOOGLE_REVIEWS_CACHE_MINUTES * 60 * 1000;
  return cache.data && Date.now() - cache.fetchedAt < ttlMs;
}

/**
 * Fetches the business's live Google reviews via the Places API (Place
 * Details, "reviews" field) and shapes them to match our own Review type
 * (see frontend `src/lib/api.ts`). Returns an empty, "not configured"
 * result if the API key or Place ID isn't set yet — callers should treat
 * that as "just show site reviews", not an error.
 *
 * Note: Google's Places API only ever returns up to 5 reviews per place
 * (its own limitation, not ours) — usually its 5 "most relevant" ones.
 * There's no key/plan upgrade that lifts this; it's a hard API limit.
 */
export async function fetchGoogleReviews() {
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) {
    return { configured: false, reviews: [], rating: null, totalReviews: null };
  }

  if (cacheIsFresh()) return cache.data;

  const url = new URL(PLACE_DETAILS_URL);
  url.searchParams.set("place_id", env.GOOGLE_PLACE_ID);
  url.searchParams.set("fields", "reviews,rating,user_ratings_total");
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", env.GOOGLE_PLACES_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Google Places request failed (${res.status})`);
  }

  const body = await res.json();
  if (body.status !== "OK") {
    // ZERO_RESULTS / NOT_FOUND / INVALID_REQUEST / REQUEST_DENIED / etc.
    throw new Error(`Google Places API error: ${body.status}${body.error_message ? ` — ${body.error_message}` : ""}`);
  }

  const reviews = (body.result?.reviews || []).map((r) => ({
    id: `google-${r.time}-${r.author_name}`,
    author: r.author_name,
    avatar: r.profile_photo_url || null,
    rating: r.rating,
    date: new Date(r.time * 1000).toISOString().slice(0, 10),
    text: r.text || "",
    source: "google",
  }));

  const data = {
    configured: true,
    reviews,
    rating: body.result?.rating ?? null,
    totalReviews: body.result?.user_ratings_total ?? null,
  };

  cache = { data, fetchedAt: Date.now() };
  return data;
}
