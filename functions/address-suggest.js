// Address autocomplete — Google Places when configured, otherwise empty list.
// GET ?q=<partial address> -> { suggestions: string[], source: "places"|"none" }
// Env: GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY)

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function placesSuggestions(query, key) {
  const url =
    "https://maps.googleapis.com/maps/api/place/autocomplete/json?" +
    new URLSearchParams({
      input: query,
      types: "address",
      components: "country:us",
      key,
    });
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return (data.predictions || [])
    .map((p) => String(p.description || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "GET") return json({ ok: false, error: "GET only" }, 405);

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  if (!q || q.length < 3) return json({ suggestions: [], source: "none" });

  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!key) return json({ suggestions: [], source: "none", needsKey: true });

  try {
    const suggestions = await placesSuggestions(q, key);
    return json({ suggestions, source: "places" });
  } catch {
    return json({ suggestions: [], source: "none" });
  }
};