import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { fmt } from "../utils";
import { Head, Kpi } from "./ui";

const TEMPLATE = [
  "Catégorie;Produit;Prix;Prix barré;Description;Photo (lien https)",
  "Pizzas;Pizza Margherita;9,000;;Tomate, mozzarella;",
  "Pizzas;Pizza Thon;10,500;12,000;Thon, olives;",
  "Boissons;Soda 33 cl;1,800;;;",
].join("\r\n");

const STATUS = { new: "Nouveau", update: "Mise à jour", error: "Erreur" };

function downloadTemplate() {
  const blob = new Blob(["\ufeff" + TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele-menu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Excel enregistre parfois en Windows-1252 : on essaie UTF-8, puis on bascule
async function readFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\ufeff/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export default function AdminImport() {
  const merchants = useFetch(api.aMerchants);
  const [merchantId, setMerchantId] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const edit = (value) => {
    setText(value);
    setPreview(null);
    setDone(null);
    setError("");
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 500_000) return setError("Fichier trop volumineux (500 Ko maximum).");
    try {
      edit(await readFile(file));
    } catch {
      setError("Impossible de lire ce fichier.");
    }
  };

  const runPreview = async () => {
    setBusy(true);
    setError("");
    setDone(null);
    try {
      setPreview(await api.aImportPreview(merchantId, { text }));
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.aImport(merchantId, { text });
      if (r.errors?.length) {
        setError(r.errors.join(" · "));
        setPreview(null);
      } else {
        setDone(r);
        setText("");
        setPreview(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const s = preview?.summary;
  const merchantName = (merchants.data || []).find((m) => String(m.merchant_id) === merchantId)?.merchant_name;
  const canConfirm = preview && s.error === 0 && s.total > 0 && !busy;

  return (
    <>
      <Head title="Importation des menus" subtitle="Ajoutez ou mettez à jour plusieurs produits d'un coup" />

      <div className="source-tabs">
        <button className="chip active">📄 Excel / CSV</button>
        <button className="chip" disabled title="Bientôt">📑 PDF (bientôt)</button>
        <button className="chip" disabled title="Bientôt">📷 Photo (bientôt)</button>
      </div>

      <div className="card stack">
        <h3>1. Choisir le commerce</h3>
        <select className="select" value={merchantId}
          onChange={(e) => { setMerchantId(e.target.value); setPreview(null); setDone(null); }}>
          <option value="">— Choisir —</option>
          {(merchants.data || []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
        </select>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <div className="row-between">
          <h3>2. Coller ou charger le menu</h3>
          <button className="link" type="button" onClick={downloadTemplate}>⬇ Télécharger le modèle</button>
        </div>
        <p className="muted small">
          Une ligne par article : <b>Catégorie ; Produit ; Prix ; Prix barré ; Description ; Photo</b>.
          Seuls le produit et le prix sont obligatoires. Vous pouvez coller des cellules copiées depuis Excel.
          Évitez le point-virgule dans les descriptions.
        </p>
        <textarea className="input mono" rows={10} value={text} onChange={(e) => edit(e.target.value)}
          placeholder={"Pizzas ; Pizza Margherita ; 9,000 ; ; Tomate, mozzarella ;"} />
        <div className="btn-row">
          <label className="btn btn-outline btn-small file-btn">
            📂 Charger un fichier CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={pickFile} />
          </label>
          <button className="btn btn-primary btn-small" disabled={busy || !merchantId || text.trim().length < 3}
            onClick={runPreview}>
            {busy && !preview ? "Analyse…" : "3. Prévisualiser"}
          </button>
        </div>
        {!merchantId && text.trim().length >= 3 && <p className="muted small">Choisissez d'abord le commerce.</p>}
      </div>

      {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}
      {done && (
        <div className="success" style={{ marginTop: 12 }}>
          ✅ Importation terminée pour {merchantName} : {done.created} créé(s), {done.updated} mis à jour.{" "}
          <Link to="/admin/products" className="link">Voir les produits</Link>
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 16 }}>
          <div className="kpis">
            <Kpi label="Lignes" value={s.total} />
            <Kpi label="Nouveaux" value={s.new} tone="ok" />
            <Kpi label="Mises à jour" value={s.update} tone="info" />
            <Kpi label="Erreurs" value={s.error} tone={s.error ? "bad" : undefined} />
          </div>

          {s.total === 0 && <p className="muted">Aucune ligne à importer.</p>}
          {s.error > 0 && (
            <div className="alert" style={{ marginBottom: 12 }}>
              Corrigez les lignes en erreur dans le texte ci-dessus, puis relancez la prévisualisation.
            </div>
          )}

          {s.total > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Ligne</th><th>État</th><th>Catégorie</th><th>Produit</th><th>Prix</th><th>Barré</th><th>Détail</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td><span className={"tag " + r.status}>{STATUS[r.status]}</span></td>
                      <td>{r.category || <span className="muted">—</span>}</td>
                      <td><strong>{r.name || "—"}</strong></td>
                      <td>
                        {r.price != null ? fmt(r.price) : "—"}
                        {r.status === "update" && r.current_price !== r.price && (
                          <div className="muted small">avant : {fmt(r.current_price)}</div>
                        )}
                      </td>
                      <td>{r.old_price != null ? fmt(r.old_price) : "—"}</td>
                      <td className="small">
                        {r.message ||
                          (r.status === "update"
                            ? r.current_price === r.price ? "Déjà présent, prix identique" : "Le prix sera modifié"
                            : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn btn-primary btn-block" disabled={!canConfirm} onClick={confirm}>
            {busy ? "Importation…" : `4. Confirmer l'importation (${s.new + s.update} article(s))`}
          </button>
          <p className="muted small center" style={{ marginTop: 8 }}>
            Un produit déjà présent est mis à jour, jamais dupliqué.
          </p>
        </div>
      )}
    </>
  );
}