import { useState } from "react";
import { api } from "../api";
import { usePolling } from "../hooks";
import { fmt, fmtDate } from "../utils";
import { ErrorBox, Loading } from "../components/StateViews";
import { Head, Kpi } from "./ui";

const num = (s) => {
  const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(v) ? null : v;
};

export default function AdminPromos() {
  const promos = usePolling(api.aPromos, 3600000);
  const [form, setForm] = useState({ code: "", type: "percent", value: "", min: "", max: "", expires: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    setError("");
    const value = num(form.value);
    const min = form.min.trim() ? num(form.min) : 0;
    const max = form.max.trim() ? parseInt(form.max, 10) : null;
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(form.code.trim())) return setError("Code : 3 à 30 lettres, chiffres, - ou _.");
    if (value == null || value <= 0) return setError("Valeur de la réduction invalide.");
    if (form.type === "percent" && value > 70) return setError("Maximum 70 %.");
    if (min == null || min < 0) return setError("Minimum d'achat invalide.");
    if (form.max.trim() && (!max || max < 1)) return setError("Nombre d'utilisations invalide.");
    setBusy(true);
    try {
      await api.aPromoAdd({
        code: form.code.trim(),
        discount_type: form.type,
        value,
        min_subtotal: min,
        max_uses: max,
        expires_at: form.expires || null,
      });
      setForm({ code: "", type: form.type, value: "", min: "", max: "", expires: "" });
      promos.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p) => {
    try {
      await api.aPromoUpdate(p.promo_id, { is_active: !p.is_active });
    } catch (e) {
      alert(e.message);
    }
    promos.refresh();
  };

  const list = promos.data || [];
  const given = list.reduce((s, p) => s + Number(p.given || 0), 0);

  return (
    <>
      <Head title="Codes promotionnels" subtitle="Créez des réductions pour vos clients" />

      <div className="kpis">
        <Kpi label="Codes" value={list.length} />
        <Kpi label="Actifs" value={list.filter((p) => p.is_active && !p.expired).length} tone="ok" />
        <Kpi label="Utilisations" value={list.reduce((s, p) => s + p.uses, 0)} />
        <Kpi label="Réductions accordées" value={fmt(given)} tone="warn" />
      </div>

      <form onSubmit={add} className="card stack" style={{ marginBottom: 16, maxWidth: 640 }}>
        <h3>Nouveau code</h3>
        <div className="two-cols">
          <input className="input" placeholder="Code (ex : BIENVENUE10)" value={form.code}
            onChange={set("code")} maxLength={30} autoCapitalize="characters" />
          <select className="select" value={form.type} onChange={set("type")}>
            <option value="percent">Pourcentage (%)</option>
            <option value="amount">Montant fixe (DT)</option>
          </select>
        </div>
        <div className="two-cols">
          <input className="input" placeholder={form.type === "percent" ? "Réduction en % (max 70)" : "Réduction en DT"}
            value={form.value} onChange={set("value")} inputMode="decimal" />
          <input className="input" placeholder="Minimum d'achat en DT (facultatif)" value={form.min}
            onChange={set("min")} inputMode="decimal" />
        </div>
        <div className="two-cols">
          <input className="input" placeholder="Utilisations maximum (facultatif)" value={form.max}
            onChange={set("max")} inputMode="numeric" />
          <label className="field">Valable jusqu'au (facultatif)
            <input className="input" type="date" value={form.expires} onChange={set("expires")} />
          </label>
        </div>
        <p className="muted small">
          La réduction s'applique au sous-total (après la remise du commerce), jamais aux frais de livraison.
          Chaque client ne peut utiliser un code qu'une fois. Décidez à l'avance qui finance la réduction :
          vous ou le commerçant.
        </p>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Création…" : "Créer le code"}</button>
      </form>

      {promos.loading && <Loading />}
      {promos.error && <ErrorBox message={promos.error} onRetry={promos.reload} />}

      {promos.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Réduction</th><th>Minimum</th><th>Utilisations</th><th>Accordé</th><th>Expire</th><th>Actif</th></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.promo_id} className={p.is_active && !p.expired ? "" : "off"}>
                  <td><strong>{p.code}</strong></td>
                  <td>{p.discount_type === "percent" ? `${Number(p.value)} %` : fmt(p.value)}</td>
                  <td>{Number(p.min_subtotal) > 0 ? fmt(p.min_subtotal) : "—"}</td>
                  <td>{p.uses}{p.max_uses ? ` / ${p.max_uses}` : ""}</td>
                  <td>{fmt(p.given)}</td>
                  <td>{p.expires_at ? fmtDate(p.expires_at) : "—"}{p.expired ? " (expiré)" : ""}</td>
                  <td>
                    <button className={"switch" + (p.is_active ? " on" : "")} onClick={() => toggle(p)}
                      aria-label={p.is_active ? "Désactiver" : "Activer"} />
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={7} className="muted center" style={{ padding: 24 }}>Aucun code promo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}