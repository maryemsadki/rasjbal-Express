export default function RecipientForm({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="card stack-sm">
      <button type="button" className="row-btn" onClick={() => onChange({ ...value, on: !value.on })}>
        <span>
          🎁 <b>Livraison pour quelqu'un d'autre ?</b><br />
          <small className="muted">Ajoutez ses coordonnées pour aider le livreur</small>
        </span>
        <span>{value.on ? "▾" : "›"}</span>
      </button>
      {value.on && (
        <>
          <input className="input" placeholder="Nom du destinataire" value={value.name} onChange={set("name")} maxLength={150} />
          <input className="input" placeholder="Téléphone du destinataire (8 chiffres)" value={value.phone} onChange={set("phone")} inputMode="tel" />
        </>
      )}
    </div>
  );
}