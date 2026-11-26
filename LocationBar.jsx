import { useAddress } from "../AddressContext";

export default function LocationBar() {
  const { current, openSheet } = useAddress();
  return (
    <button className="loc-chip" onClick={openSheet}>
      <span>📍</span>
      <b>{current ? `${current.label} · ${current.line}` : "Choisir une adresse de livraison"}</b>
      <span>▾</span>
    </button>
  );
}