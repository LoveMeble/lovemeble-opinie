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
const QUERY = "LoveMeble";
const LAT = 51.3223065, LNG = 17.977895; // z Twojego linku do Map
// Jeśli kiedyś wpiszesz tu dokładny place_id (ChIJ...), skrypt użyje go wprost:
const PLACE_ID = "";

async function fetchPlace() {
  // Jedno zapytanie: searchText od razu z polem reviews (max 5 opinii z API).
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews"
    },
    body: JSON.stringify({
      textQuery: PLACE_ID ? PLACE_ID : QUERY,
      locationBias: { circle: { center: { latitude: LAT, longitude: LNG }, radius: 300 } },
      languageCode: "pl",
      maxResultCount: 1
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Places API: " + JSON.stringify(data));
  if (!data.places || !data.places.length) throw new Error("Nie znaleziono wizytówki dla zapytania: " + QUERY);
  return data.places[0];
}

(async () => {
  const p = await fetchPlace();
  const name = (p.displayName && p.displayName.text) || "LoveMeble";
  if (!/lovemeble/i.test(name)) {
    console.warn("UWAGA: dopasowano '" + name + "' — sprawdź QUERY/współrzędne, jeśli to nie Twoja wizytówka.");
  }
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
    place_id: p.id || "",
    name: name,
    rating: p.rating || 0,
    total: p.userRatingCount || 0,
    mapsUri: p.googleMapsUri || "",
    reviews: reviews
  };

  fs.writeFileSync("reviews.json", JSON.stringify(out, null, 2));
  console.log("OK — place_id:", p.id);
  console.log("Zapisano " + reviews.length + " opinii; ocena " + out.rating + " (" + out.total + " ocen)");
})().catch(e => { console.error(e); process.exit(1); });
