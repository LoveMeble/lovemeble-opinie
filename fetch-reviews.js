/* ─────────────────────────────────────────────────────────────────────────
   LoveMeble — pobieranie opinii Google (1 zapytanie/dobę)
   Uruchamiane przez GitHub Actions. Zapisuje wynik do reviews.json,
   który strona pobiera przez CDN (bez kosztu per-klient).

   Klucz API bierze ze zmiennej środowiskowej GOOGLE_PLACES_KEY
   (ustawionej jako Secret w repo — NIGDY nie wpisuj klucza tutaj).
   ───────────────────────────────────────────────────────────────────────── */
const fs = require("fs");

const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) { console.error("Brak GOOGLE_PLACES_KEY (dodaj Secret w repo)"); process.exit(1); }

/* ── Konfiguracja wizytówki LoveMeble ── */
const PLACE_ID = "ChIJh0YKYZWhGkcRvkrd9fkIC3Y"; // dokładny place_id LoveMeble
// Fallback (gdyby PLACE_ID był pusty) — wyszukanie po nazwie + współrzędnych:
const QUERY = "LoveMeble";
const LAT = 51.3223065, LNG = 17.977895;

// Place Details — właściwy endpoint na pełne recenzje (max 5 z API).
async function getByDetails(placeId) {
  const res = await fetch(
    "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + "?languageCode=pl", {
    headers: {
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews"
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Place Details: " + JSON.stringify(data));
  return data;
}

// Fallback: searchText (gdy nie mamy place_id).
async function getBySearch() {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews"
    },
    body: JSON.stringify({
      textQuery: QUERY,
      locationBias: { circle: { center: { latitude: LAT, longitude: LNG }, radius: 300 } },
      languageCode: "pl",
      maxResultCount: 1
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error("searchText: " + JSON.stringify(data));
  if (!data.places || !data.places.length) throw new Error("Nie znaleziono wizytówki dla: " + QUERY);
  return data.places[0];
}

(async () => {
  const p = PLACE_ID ? await getByDetails(PLACE_ID) : await getBySearch();
  const name = (p.displayName && p.displayName.text) || "LoveMeble";

  const reviews = (p.reviews || []).map(r => ({
    author: (r.authorAttribution && r.authorAttribution.displayName) || "",
    photo:  (r.authorAttribution && r.authorAttribution.photoUri) || "",
    rating: r.rating || 0,
    text:   ((r.text && r.text.text) || (r.originalText && r.originalText.text) || "").trim(),
    when:   r.relativePublishTimeDescription || "",
    time:   r.publishTime || ""
  })).filter(r => r.text);

  const out = {
    updated: new Date().toISOString(),
    place_id: p.id || PLACE_ID,
    name: name,
    rating: p.rating || 0,
    total: p.userRatingCount || 0,
    mapsUri: p.googleMapsUri || "",
    reviews: reviews
  };

  fs.writeFileSync("reviews.json", JSON.stringify(out, null, 2));
  console.log("OK — place_id:", out.place_id);
  console.log("Zapisano " + reviews.length + " opinii z trescia; ocena " + out.rating + " (" + out.total + " ocen)");
})().catch(e => { console.error(e); process.exit(1); });
