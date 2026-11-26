import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [37.2167, 10.1167]; // Ras Jebel : à adapter à votre zone
const NOM = "https://nominatim.openstreetmap.org";
const LABELS = ["Maison", "Travail", "Autre"];
const round = (n) => Math.round(n * 1e6) / 1e6;

async function reverse(lat, lng) {
  const r = await fetch(`${NOM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr`);
  if (!r.ok) throw new Error("reverse");
  const d = await r.json();
  const a = d.address || {};
  const area = a.suburb || a.neighbourhood || a.city_district || a.town || a.city || a.village;
  return [a.road, area].filter(Boolean).join(", ") || d.display_name || "";
}

async function searchPlaces(q) {
  const r = await fetch(`${NOM}/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=tn&limit=5&accept-language=fr`);
  if (!r.ok) throw new Error("search");
  return (await r.json()).map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
}

export default function AddressPicker({
  initial = null, simple = false, title = "Adresse de livraison",
  autoLocate = false, onSave, onClose,
}) {
  const mapEl = useRef(null);
  const map = useRef(null);
  const [point, setPoint] = useState(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [line, setLine] = useState(initial?.line || "");
  const [details, setDetails] = useState(initial?.details || "");
  const [label, setLabel] = useState(initial?.label || (simple ? "Collecte" : "Maison"));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [geoError, setGeoError] = useState("");
  const [error, setError] = useState("");

  const locate = () => {
    setGeoError("");
    if (!navigator.geolocation) return setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition(
      (p) => map.current?.setView([p.coords.latitude, p.coords.longitude], 17),
      () => setGeoError("Position introuvable. Autorisez la localisation ou déplacez la carte."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Création de la carte
  useEffect(() => {
    const start = initial ? [initial.lat, initial.lng] : DEFAULT_CENTER;
    const m = L.map(mapEl.current, { zoomControl: false }).setView(start, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(m);
    m.on("moveend", () => {
      const c = m.getCenter();
      setPoint({ lat: c.lat, lng: c.lng });
    });
    map.current = m;
    setPoint({ lat: start[0], lng: start[1] });
    if (autoLocate) locate();
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adresse écrite automatiquement quand la carte bouge
  useEffect(() => {
    if (!point) return;
    if (initial && point.lat === initial.lat && point.lng === initial.lng) return;
    let cancelled = false;
    const t = setTimeout(() => {
      reverse(point.lat, point.lng)
        .then((l) => !cancelled && l && setLine(l.slice(0, 200)))
        .catch(() => {});
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  // Recherche d'un lieu
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchPlaces(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const pickResult = (r) => {
    map.current?.setView([r.lat, r.lng], 17);
    setResults([]);
    setQuery("");
  };

  const save = () => {
    if (!point) return;
    if (line.trim().length < 3) return setError("Indiquez l'adresse ou déplacez la carte.");
    onSave({
      id: initial?.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label,
      line: line.trim().slice(0, 200),
      details: details.trim().slice(0, 90),
      lat: round(point.lat),
      lng: round(point.lng),
    });
  };

  return (
    <div className="picker">
      <div className="picker-top">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <input className="input" placeholder="🔍 Rechercher une rue, un lieu…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {results.length > 0 && (
          <ul className="results">
            {results.map((r, i) => (
              <li key={i}><button type="button" onClick={() => pickResult(r)}>{r.name}</button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="picker-map">
        <div ref={mapEl} className="picker-leaflet" />
        <div className="pin-fixed">📍</div>
        <button type="button" className="locate-btn" onClick={locate}>➤ Ma position</button>
      </div>

      <div className="picker-bottom">
        {geoError && <div className="alert">{geoError}</div>}
        <label className="field">Adresse
          <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={200} placeholder="Rue, quartier…" />
        </label>
        <label className="field">Précisions (étage, repère…)
          <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={90} placeholder="Ex : 2e étage, porte bleue" />
        </label>
        {!simple && (
          <div className="chips">
            {LABELS.map((l) => (
              <button type="button" key={l} className={"chip" + (label === l ? " active" : "")} onClick={() => setLabel(l)}>{l}</button>
            ))}
          </div>
        )}
        {error && <div className="alert">{error}</div>}
        <button type="button" className="btn btn-primary btn-block" onClick={save}>Confirmer cette adresse</button>
      </div>
    </div>
  );
}