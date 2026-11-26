import { useMemo, useState } from "react";
import { api } from "../api";
import { useFetch, usePolling } from "../hooks";
import { ErrorBox, Loading } from "../components/StateViews";
import { Head } from "./ui";

function CatRow({ merchantId, cat, siblings, onSaved }) {
  const own = cat.category || "";
  const [name, setName] = useState(own);
  const [busy, setBusy] = useState(false);
  const target = name.trim();
  const changed = target !== own;

  const save = async () => {
    const merge = target && siblings.some((s) => s.toLowerCase() === target.toLowerCase() && s !== own);
    if (merge && !window.confirm(`« ${target} » existe déjà : les deux catégories seront fusionnées. Continuer ?`)) return;
    if (!target && !window.confirm(`Les ${cat.products} produit(s) passeront en « Sans catégorie ». Continuer ?`)) return;
    setBusy(true);
    try {
      await api.aCategoryRename(merchantId, { old: own, new: target });
      await onSaved();
    } catch (e) {
      alert(e.message);
      setName(own);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cat-row">
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && changed && save()}
        placeholder="Sans catégorie"
        maxLength={60}
        aria-label="Nom de la catégorie"
      />
      <span className="muted small">{cat.products} produit(s)</span>
      <button className="btn btn-primary btn-small" disabled={!changed || busy} onClick={save}>
        Renommer
      </button>
    </div>
  );
}

export default function AdminCategories() {
  const merchants = useFetch(api.aMerchants);
  const cats = usePolling(api.aCategories, 3600000);
  const [merchantId, setMerchantId] = useState("");

  const groups = useMemo(() => {
    const map = new Map();
    for (const c of cats.data || []) {
      if (merchantId && String(c.merchant_id) !== merchantId) continue;
      if (!map.has(c.merchant_id)) map.set(c.merchant_id, { name: c.merchant_name, items: [] });
      map.get(c.merchant_id).items.push(c);
    }
    return [...map.entries()];
  }, [cats.data, merchantId]);

  return (
    <>
      <Head title="Catégories" subtitle="Renommez ou fusionnez les catégories de chaque commerce" />

      <div className="toolbar">
        <select className="select" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
          <option value="">Tous les commerces</option>
          {(merchants.data || []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
        </select>
      </div>

      <p className="muted small" style={{ marginBottom: 12 }}>
        Donner à une catégorie le nom d'une autre les fusionne. Laisser le nom vide place les produits
        dans « Sans catégorie ».
      </p>

      {cats.loading && <Loading />}
      {cats.error && <ErrorBox message={cats.error} onRetry={cats.reload} />}

      <div className="cols">
        {groups.map(([mid, g]) => (
          <div key={mid} className="card stack">
            <h3>{g.name}</h3>
            {g.items.map((c) => (
              <CatRow
                key={mid + "-" + (c.category || "")}
                merchantId={mid}
                cat={c}
                siblings={g.items.map((x) => x.category || "")}
                onSaved={() => cats.refresh()}
              />
            ))}
          </div>
        ))}
        {cats.data && groups.length === 0 && <p className="muted">Aucune catégorie.</p>}
      </div>
    </>
  );
}