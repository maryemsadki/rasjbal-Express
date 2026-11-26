import { useMemo, useState } from "react";
import { api } from "../api";
import { useFetch, usePolling } from "../hooks";
import { compressImage } from "../photo";
import { fmt } from "../utils";
import PhotoPicker from "../components/PhotoPicker";
import { ErrorBox, Loading } from "../components/StateViews";
import { Head, Kpi, Modal } from "./ui";

const toNumber = (s) => {
  const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(v) ? null : Math.round(v * 100) / 100;
};

// Prix modifiable directement dans le tableau
function PriceCell({ p, onChanged }) {
  const [v, setV] = useState(String(p.price));
  const [busy, setBusy] = useState(false);
  const num = toNumber(v);
  const dirty = num != null && num !== Number(p.price);

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      await api.aProductUpdate(p.merchant_id, p.product_id, { price: num });
      await onChanged();
    } catch (e) {
      alert(e.message);
      setV(String(p.price));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="price-cell">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          inputMode="decimal"
          aria-label="Prix"
        />
        <span>DT</span>
        {dirty && (
          <button className="btn btn-primary btn-small" disabled={busy} onClick={save}>✓</button>
        )}
      </div>
      {p.old_price != null && <s className="muted small">{fmt(p.old_price)}</s>}
    </div>
  );
}

function Row({ p, showMerchant, onChanged, onEdit }) {
  const toggle = async () => {
    try {
      await api.aProductUpdate(p.merchant_id, p.product_id, { is_available: !p.is_available });
      await onChanged();
    } catch (e) {
      alert(e.message);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer « ${p.product_name} » ?`)) return;
    try {
      const r = await api.aProductDelete(p.merchant_id, p.product_id);
      if (r.hidden) {
        alert("Cet article a déjà été commandé : il est masqué au lieu d'être supprimé, pour garder l'historique des commandes.");
      }
      await onChanged();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <tr className={p.is_available ? "" : "off"}>
      <td>
        <PhotoPicker
          size={52}
          url={p.image_url}
          onUpload={async (blob) => { await api.aPhoto(p.merchant_id, p.product_id, blob); await onChanged(); }}
          onRemove={async () => { await api.aPhotoRemove(p.merchant_id, p.product_id); await onChanged(); }}
        />
      </td>
      <td>
        <strong>{p.product_name}</strong>
        {showMerchant && <div className="muted small">{p.merchant_name}</div>}
        {p.stock_image && <div className="muted small">photo d'illustration</div>}
      </td>
      <td>{p.category || <span className="muted">—</span>}</td>
      <td><PriceCell key={p.product_id + "-" + p.price} p={p} onChanged={onChanged} /></td>
      <td>
        <button
          className={"switch" + (p.is_available ? " on" : "")}
          onClick={toggle}
          aria-label={p.is_available ? "Rendre indisponible" : "Rendre disponible"}
          title={p.is_available ? "Disponible" : "Indisponible"}
        />
      </td>
      <td>
        <div className="td-actions">
          <button className="btn btn-outline btn-small" onClick={() => onEdit(p)}>Modifier</button>
          <button className="btn btn-danger btn-small" onClick={remove}>Supprimer</button>
        </div>
      </td>
    </tr>
  );
}

// Formulaire d'ajout et de modification
function ProductModal({ merchants, product, products, defaultMerchant, onClose, onSaved, onPhotoChanged }) {
  const editing = Boolean(product);
  const [form, setForm] = useState({
    merchant_id: product?.merchant_id ?? defaultMerchant ?? "",
    name: product?.product_name ?? "",
    category: product?.category ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    old: product?.old_price != null ? String(product.old_price) : "",
    available: product ? Boolean(product.is_available) : true,
  });
  const [photo, setPhoto] = useState(null);
  const [img, setImg] = useState(product?.image_url ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const categories = useMemo(
    () => [
      ...new Set(
        products
          .filter((p) => String(p.merchant_id) === String(form.merchant_id))
          .map((p) => p.category)
          .filter(Boolean)
      ),
    ],
    [products, form.merchant_id]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const price = toNumber(form.price);
    const old = form.old.trim() ? toNumber(form.old) : null;
    if (!form.merchant_id) return setError("Choisissez le commerce.");
    if (form.name.trim().length < 2) return setError("Nom du produit requis.");
    if (price == null || price < 0) return setError("Prix invalide.");
    if (form.old.trim() && (old == null || old <= price))
      return setError("Le prix barré doit être supérieur au prix.");

    setBusy(true);
    try {
      const mid = Number(form.merchant_id);
      const base = {
        product_name: form.name.trim(),
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        price,
        old_price: old,
      };
      if (editing) {
        await api.aProductUpdate(mid, product.product_id, { ...base, is_available: form.available });
      } else {
        const res = await api.aProductAdd(mid, base);
        if (!form.available) await api.aProductUpdate(mid, res.product_id, { is_available: false });
        if (photo) {
          try {
            await api.aPhoto(mid, res.product_id, await compressImage(photo));
          } catch (err) {
            alert("Produit ajouté, mais la photo n'a pas pu être envoyée : " + err.message);
          }
        }
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? "Modifier le produit" : "Ajouter un produit"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">Commerce
          <select className="select" value={form.merchant_id} onChange={set("merchant_id")} disabled={editing}>
            <option value="">— Choisir —</option>
            {merchants.map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
          </select>
        </label>
        <label className="field">Nom du produit
          <input className="input" value={form.name} onChange={set("name")} maxLength={150} />
        </label>
        <label className="field">Catégorie
          <input className="input" list="adm-cats" value={form.category} onChange={set("category")}
            placeholder="Ex : Pizzas, Boissons" maxLength={60} />
          <datalist id="adm-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field">Description (facultatif)
          <input className="input" value={form.description} onChange={set("description")} maxLength={500} />
        </label>
        <div className="two-cols">
          <label className="field">Prix en DT
            <input className="input" value={form.price} onChange={set("price")} inputMode="decimal" placeholder="Ex : 10,500" />
          </label>
          <label className="field">Ancien prix (facultatif)
            <input className="input" value={form.old} onChange={set("old")} inputMode="decimal" />
          </label>
        </div>

        {editing ? (
          <div className="field">
            Photo
            <PhotoPicker
              size={96}
              url={img}
              onUpload={async (blob) => {
                const r = await api.aPhoto(product.merchant_id, product.product_id, blob);
                setImg(r.image_url);
                await onPhotoChanged();
              }}
              onRemove={async () => {
                await api.aPhotoRemove(product.merchant_id, product.product_id);
                setImg(null);
                await onPhotoChanged();
              }}
            />
          </div>
        ) : (
          <label className="field">Photo (facultatif)
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={form.available}
            onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Disponible à la vente
        </label>

        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </Modal>
  );
}

export default function AdminProducts() {
  const merchants = useFetch(api.aMerchants);
  const products = usePolling(api.aProducts, 3600000);
  const [q, setQ] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(60);
  const [modal, setModal] = useState(null);

  const all = useMemo(() => products.data || [], [products.data]);
  const scope = useMemo(
    () => all.filter((p) => !merchantId || String(p.merchant_id) === merchantId),
    [all, merchantId]
  );
  const noRealPhoto = (p) => !p.image_url || p.stock_image;

  const stats = {
    total: scope.length,
    on: scope.filter((p) => p.is_available).length,
    off: scope.filter((p) => !p.is_available).length,
    noPhoto: scope.filter(noRealPhoto).length,
  };

  const categories = useMemo(() => [...new Set(scope.map((p) => p.category).filter(Boolean))], [scope]);
  const hasNone = scope.some((p) => !p.category);

  const needle = q.trim().toLowerCase();
  const list = scope.filter(
    (p) =>
      (!needle || p.product_name.toLowerCase().includes(needle)) &&
      (!category || (category === "__none" ? !p.category : p.category === category)) &&
      (filter === "all" ||
        (filter === "on" && p.is_available) ||
        (filter === "off" && !p.is_available) ||
        (filter === "nophoto" && noRealPhoto(p)))
  );
  const shown = list.slice(0, limit);

  const upd = (setter) => (e) => {
    setter(e.target.value);
    setLimit(60);
  };
  const refresh = () => products.refresh();

  return (
    <>
      <Head title="Gestion des produits" subtitle="Tous les articles de tous les commerces">
        <button className="btn btn-primary" onClick={() => setModal({})}>+ Ajouter un produit</button>
      </Head>

      <div className="kpis">
        <Kpi label="Produits" value={stats.total} />
        <Kpi label="Disponibles" value={stats.on} tone="ok" />
        <Kpi label="Indisponibles" value={stats.off} tone="warn" />
        <Kpi label="Sans vraie photo" value={stats.noPhoto} tone="info" />
      </div>

      <div className="toolbar">
        <input className="input" placeholder="🔍 Rechercher un produit" value={q} onChange={upd(setQ)} />
        <select className="select" value={merchantId}
          onChange={(e) => { setMerchantId(e.target.value); setCategory(""); setLimit(60); }}>
          <option value="">Tous les commerces</option>
          {(merchants.data || []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
        </select>
        <select className="select" value={category} onChange={upd(setCategory)}>
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          {hasNone && <option value="__none">Sans catégorie</option>}
        </select>
        <select className="select" value={filter} onChange={upd(setFilter)}>
          <option value="all">Tous les états</option>
          <option value="on">Disponibles</option>
          <option value="off">Indisponibles</option>
          <option value="nophoto">Sans vraie photo</option>
        </select>
      </div>

      {products.loading && <Loading />}
      {products.error && <ErrorBox message={products.error} onRetry={products.reload} />}

      {products.data && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Photo</th><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Dispo.</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <Row key={p.product_id} p={p} showMerchant={!merchantId}
                    onChanged={refresh} onEdit={(prod) => setModal({ product: prod })} />
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="muted center" style={{ padding: 24 }}>Aucun produit ne correspond.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small center" style={{ marginTop: 10 }}>
            {shown.length} sur {list.length} produit(s)
          </p>
          {list.length > shown.length && (
            <button className="btn btn-outline btn-block" onClick={() => setLimit(limit + 60)}>
              Afficher 60 de plus
            </button>
          )}
        </>
      )}

      {modal && (
        <ProductModal
          merchants={merchants.data || []}
          product={modal.product}
          products={all}
          defaultMerchant={merchantId}
          onClose={() => setModal(null)}
          onSaved={async () => { await refresh(); setModal(null); }}
          onPhotoChanged={refresh}
        />
      )}
    </>
  );
}