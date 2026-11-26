import { useState } from "react";
import { useAddress } from "../AddressContext";
import AddressPicker from "./AddressPicker";

const icon = (l) => (l === "Maison" ? "🏠" : l === "Travail" ? "💼" : "📍");

export default function AddressSheet() {
  const { sheetOpen, closeSheet, addresses, current, select, save, remove } = useAddress();
  const [picker, setPicker] = useState(null);

  if (picker) {
    return (
      <AddressPicker
        initial={picker.initial}
        autoLocate={picker.locate}
        onClose={() => setPicker(null)}
        onSave={(a) => {
          save(a);
          setPicker(null);
          closeSheet();
        }}
      />
    );
  }
  if (!sheetOpen) return null;

  return (
    <div className="overlay" onClick={closeSheet}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Où devons-nous livrer ?</h2>
          <button className="icon-btn" onClick={closeSheet} aria-label="Fermer">✕</button>
        </div>

        <button className="share" onClick={() => setPicker({ initial: null, locate: true })}>
          <span>
            <small className="badge open">Recommandé</small><br />
            <strong>Partager ma position actuelle</strong><br />
            <small className="muted">Le moyen le plus rapide de trouver votre zone</small>
          </span>
          <span>➤</span>
        </button>

        {addresses.map((a) => (
          <div key={a.id} className={"addr" + (current?.id === a.id ? " sel" : "")}>
            <button className="addr-main" onClick={() => { select(a.id); closeSheet(); }}>
              <span>{icon(a.label)}</span>
              <span><strong>{a.label}</strong><small>{a.line}</small></span>
            </button>
            <button className="icon-btn plain" aria-label="Modifier" onClick={() => setPicker({ initial: a })}>✏️</button>
            <button className="icon-btn plain" aria-label="Supprimer"
              onClick={() => window.confirm("Supprimer cette adresse ?") && remove(a.id)}>🗑️</button>
          </div>
        ))}

        <button className="btn btn-soft btn-block" onClick={() => setPicker({ initial: null })}>
          Ajouter une nouvelle adresse
        </button>
      </div>
    </div>
  );
}