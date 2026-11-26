import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapPreview({ lat, lng, onClick }) {
  const el = useRef(null);
  useEffect(() => {
    const m = L.map(el.current, {
      zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false,
    }).setView([lat, lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(m);
    L.marker([lat, lng], {
      icon: L.divIcon({ className: "pin-icon", html: "📍", iconSize: [32, 32], iconAnchor: [16, 32] }),
    }).addTo(m);
    return () => m.remove();
  }, [lat, lng]);
  return <div className="map-preview" ref={el} onClick={onClick} />;
}