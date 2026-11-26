import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useFetch, usePolling } from "../hooks";
import { fmt } from "../utils";
import MenuImport from "./MenuImport";
import PhotoPicker from "./PhotoPicker";
import { ErrorBox, Loading } from "./StateViews";

export default function AdminMenus() {
  const merchants = useFetch(api.aMerchants);
  const [id, setId] = useState("");
  const [q, setQ] = useState("");
  const [noPhoto, setNoPhoto] = useState(false);
  const menu = usePolling(() => (id ? api.aMenu(id) : Promise.resolve([])), 3600000, [id]);

  const all = menu.data || [];
  const missing = all.filter((p) => !p.image_url).length;
  const list = all.filter(
    (p) => (!noPhoto || !p.image_url) && p.product_name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <>
      <div className="card stack">
        <h3>Menu d'un commerce</h3>
        <select className="select" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">— Choisir un commerce —</option>
          {(merchants.data || []).map((m) => (
            <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>
          ))}
        </select>
        {merchants.error && <ErrorBox message={merchants.error} onRetry={merchants.reload} />}
      </div>

      {id && (
        <>
          <div style={{ marginTop: 12 }}>
            <MenuImport onImport={(text) => api.aImport(id, { text })} onDone={menu.refresh} />
          </div>

          <div className="row-between section-title">
            <h2>Articles ({all.length})</h2>
            <Link to={`/merchants/${id}`} className="link">Voir côté client</Link>
          </div>
          <p className="muted small">📷 {missing} article(s) sans photo. Touchez la case photo d'un article pour l'ajouter.</p>

          <input className="input" placeholder="🔍 Chercher un article" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={noPhoto} onChange={(e) => setNoPhoto(e.target.checked)} />
            Afficher seulement les articles sans photo
          </label>

          {menu.loading && <Loading />}
          {menu.error && <ErrorBox message={menu.error} onRetry={menu.reload} />}
          <div className="stack">
            {list.map((p) => (
              <div key={p.product_id} className={"card menu-row" + (p.is_available ? "" : " off")}>
                <PhotoPicker
                  url={p.image_url}
                  onUpload={async (blob) => { await api.aPhoto(id, p.product_id, blob); menu.refresh(); }}
                  onRemove={async () => { await api.aPhotoRemove(id, p.product_id); menu.refresh(); }}
                />
                <div className="product-info">
                  <strong>{p.product_name}</strong>
                  <p className="muted small">{p.category || "Autres"}{p.is_available ? "" : " · masqué"}</p>
                </div>
                <div className="price-line">
                  <strong className="price">{fmt(p.price)}</strong>
                  {p.old_price && <s className="old-price">{fmt(p.old_price)}</s>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}