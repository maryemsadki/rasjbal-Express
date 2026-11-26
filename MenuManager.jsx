import { useMemo, useState } from "react";
import { api } from "../api";
import { usePolling } from "../hooks";
import { compressImage } from "../photo";
import { Kpi, Modal } from "../admin/ui";
import MenuImport from "./MenuImport";
import PhotoPicker from "./PhotoPicker";
import { Empty, ErrorBox, Loading } from "./StateViews";

const toNumber = (s) => {
  const v = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(v) ? null : Math.round(v * 100) / 100;
};

/* ---------- Une ligne du menu ---------- */
function Item({ p, onChanged, onEdit }) {
  const [price, setPrice] = useState(String(p.price));
  const [busy, setBusy] = useState(false);
  const num = toNumber(price);
  const dirty = num != null && num !== Number(p.price);

  const patch = async (body) => {
    setBusy(true);
    try {
      await api.mProductUpdate(p.product_id, body);
      await onChanged();
    } catch (e) {
      alert(e.message);
      setPrice(String(p.price));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer « ${p.product_name} » ?`)) return;
    setBusy(true);
    try {
      const r = await api.mProductDelete(p.product_id);
      if (r.hidden) {
        alert(
          "Cet article a déjà été commandé : il est masqué au lieu d'être supprimé, pour garder l'historique des commandes."
        );
      }
      await onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={"card mm-item" + (p.is_available ? "" : " is-off")}>
      <PhotoPicker
        size={64}
        url={p.image_url}
        onUpload={async (blob) => { await api.mPhoto(p.product_id, blob); await onChanged(); }}
        onRemove={async () => { await api.mPhotoRemove(p.product_id); await onChanged(); }}
      />

      <div className="mm-main">
        <strong>{p.product_name}</strong>
        <p className="muted small">
          {p.category || "Sans catégorie"}
          {p.stock_image ? " · photo d'illustration" : ""}
        </p>
        <div className="price-cell">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && patch({ price: num })}
            inputMode="decimal"
            aria-label="Prix"
          />
          <span>DT</span>
          {dirty && (
            <button className="btn btn-primary btn-small" disabled={busy || num == null || num < 0}
              onClick={() => patch({ price: num })}>
              ✓
            </button>
          )}
        </div>
        {p.old_price != null && <s className="muted small">ancien prix : {p.old_price}</s>}
      </div>

      <div className="mm-actions">
        <div className="mm-state">
          <button
            className={"switch" + (p.is_available ? " on" : "")}
            disabled={busy}
            onClick={() => patch({ is_available: !p.is_available })}
            aria-label={p.is_available ? "Rendre indisponible" : "Rendre disponible"}
          />
          <span className={p.is_available ? "ok-text" : "bad-text"}>
            {p.is_available ? "Disponible" : "Indisponible"}
          </span>
        </div>
        <div className="mm-btns">
          <button className="btn btn-outline btn-small" onClick={() => onEdit(p)}>Modifier</button>
          <button className="btn btn-danger btn-small" disabled={busy} onClick={remove}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Ajout et modification ---------- */
function ProductModal({ product, categories, onClose, onSaved, onPhotoChanged }) {
  const editing = Boolean(product);
  const [form, setForm] = useState({
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

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const price = toNumber(form.price);
    const old = form.old.trim() ? toNumber(form.old) : null;
    if (form.name.trim().length < 2) return setError("Nom de l'article requis.");
    if (price == null || price < 0) return setError("Prix invalide.");
    if (form.old.trim() && (old == null || old <= price))
      return setError("Le prix barré doit être supérieur au prix.");

    setBusy(true);
    try {
      const base = {
        product_name: form.name.trim(),
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        price,
        old_price: old,
      };
      if (editing) {
        await api.mProductUpdate(product.product_id, { ...base, is_available: form.available });
      } else {
        const res = await api.mProductAdd(base);
        if (!form.available) await api.mProductUpdate(res.product_id, { is_available: false });
        if (photo) {
          try {
            await api.mPhoto(res.product_id, await compressImage(photo));
          } catch (err) {
            alert("Article ajouté, mais la photo n'a pas pu être envoyée : " + err.message);
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
    <Modal title={editing ? "Modifier l'article" : "Ajouter un article"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">Nom de l'article
          <input className="input" value={form.name} onChange={set("name")} maxLength={150} />
        </label>

        <label className="field">Catégorie
          <input className="input" list="mm-cats" value={form.category} onChange={set("category")}
            placeholder="Choisissez ou tapez une nouvelle catégorie" maxLength={60} />
          <datalist id="mm-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <p className="muted small">Pour créer une nouvelle catégorie, tapez simplement son nom.</p>

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
        <p className="muted small">
          Indiquez un ancien prix seulement s'il a vraiment été pratiqué : il s'affichera barré dans « Promotions ».
        </p>

        {editing ? (
          <div className="field">
            Photo
            <PhotoPicker
              size={96}
              url={img}
              onUpload={async (blob) => {
                const r = await api.mPhoto(product.product_id, blob);
                setImg(r.image_url);
                await onPhotoChanged();
              }}
              onRemove={async () => {
                await api.mPhotoRemove(product.product_id);
                setImg(null);
                await onPhotoChanged();
              }}
            />
          </div>
        ) : (
          <label className="field">📷 Photo (facultatif)
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

/* ---------- Catégories : renommer ou fusionner ---------- */
function CategoryRow({ name, count, siblings, onSaved }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const target = value.trim();
  const changed = target !== name;

  const save = async () => {
    const merge = target && siblings.some((s) => s.toLowerCase() === target.toLowerCase() && s !== name);
    if (merge && !window.confirm(`« ${target} » existe déjà : les deux catégories seront fusionnées. Continuer ?`)) return;
    if (!target && !window.confirm(`Les ${count} article(s) passeront en « Sans catégorie ». Continuer ?`)) return;
    setBusy(true);
    try {
      await api.mCategoryRename({ old: name, new: target });
      await onSaved();
    } catch (e) {
      alert(e.message);
      setValue(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cat-row">
      <input className="input" value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && changed && save()}
        placeholder="Sans catégorie" maxLength={60} aria-label="Nom de la catégorie" />
      <span className="muted small">{count}</span>
      <button className="btn btn-primary btn-small" disabled={!changed || busy} onClick={save}>OK</button>
    </div>
  );
}

function CategoryManager({ items, onSaved }) {
  const counts = useMemo(() => {
    const map = new Map();
    for (const p of items) map.set(p.category || "", (map.get(p.category || "") || 0) + 1);
    return [...map.entries()];
  }, [items]);

  return (
    <div className="card stack">
      <h3>Mes catégories</h3>
      <p className="muted small">
        Renommez une catégorie, ou donnez-lui le nom d'une autre pour les fusionner. Un nom vide place les
        articles dans « Sans catégorie ».
      </p>
      {counts.map(([name, count]) => (
        <CategoryRow
          key={name + "-" + count}
          name={name}
          count={count}
          siblings={counts.map(([n]) => n)}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

/* ---------- Page principale du menu ---------- */
export default function MenuManager() {
  const menu = usePolling(api.mMenu, 600000);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [panel, setPanel] = useState(null); // "import" | "categories" | null

  const all = useMemo(() => menu.data || [], [menu.data]);
  const noRealPhoto = (p) => !p.image_url || p.stock_image;

  const stats = {
    total: all.length,
    on: all.filter((p) => p.is_available).length,
    off: all.filter((p) => !p.is_available).length,
    noPhoto: all.filter(noRealPhoto).length,
  };

  const categories = useMemo(() => [...new Set(all.map((p) => p.category).filter(Boolean))], [all]);
  const hasNone = all.some((p) => !p.category);

  const needle = q.trim().toLowerCase();
  const list = all.filter(
    (p) =>
      (!needle || p.product_name.toLowerCase().includes(needle)) &&
      (!category || (category === "__none" ? !p.category : p.category === category)) &&
      (filter === "all" ||
        (filter === "on" && p.is_available) ||
        (filter === "off" && !p.is_available) ||
        (filter === "nophoto" && noRealPhoto(p)))
  );

  const groups = useMemo(() => {
    const map = new Map();
    for (const p of list) {
      const key = p.category || "Sans catégorie";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()];
  }, [list]);

  const refresh = () => menu.refresh();
  const toggle = (name) => setPanel(panel === name ? null : name);

  return (
    <>
      <div className="mm-head">
        <h2 className="section-title" style={{ margin: 0 }}>Mon menu</h2>
        <button className="btn btn-primary btn-small" onClick={() => setModal({})}>+ Ajouter un article</button>
      </div>
      <p className="muted small" style={{ margin: "6px 0 12px" }}>
        Un article « Indisponible » disparaît tout de suite du menu des clients et ne peut plus être commandé.
        Réactivez-le dès qu'il est de nouveau en stock.
      </p>

      <div className="kpis">
        <Kpi label="Articles" value={stats.total} />
        <Kpi label="Disponibles" value={stats.on} tone="ok" />
        <Kpi label="Indisponibles" value={stats.off} tone={stats.off ? "warn" : undefined} />
        <Kpi label="Sans vraie photo" value={stats.noPhoto} tone="info" />
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn btn-outline btn-small" onClick={() => toggle("categories")}>
          📂 Catégories
        </button>
        <button className="btn btn-outline btn-small" onClick={() => toggle("import")}>
          📋 Importer un menu
        </button>
      </div>

      {panel === "categories" && (
        <div style={{ marginBottom: 12 }}>
          <CategoryManager items={all} onSaved={refresh} />
        </div>
      )}
      {panel === "import" && (
        <div style={{ marginBottom: 12 }}>
          <MenuImport onImport={(text) => api.mImport({ text })} onDone={refresh} />
        </div>
      )}

      <div className="toolbar">
        <input className="input" placeholder="🔍 Rechercher un article" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          {hasNone && <option value="__none">Sans catégorie</option>}
        </select>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tous les états</option>
          <option value="on">Disponibles</option>
          <option value="off">Indisponibles</option>
          <option value="nophoto">Sans vraie photo</option>
        </select>
      </div>

      {menu.loading && <Loading />}
      {menu.error && <ErrorBox message={menu.error} onRetry={menu.reload} />}
      {menu.data && all.length === 0 && (
        <Empty icon="🍽️" title="Menu vide" text="Ajoutez votre premier article ou importez votre menu." />
      )}
      {menu.data && all.length > 0 && list.length === 0 && (
        <Empty icon="🔎" title="Aucun article" text="Aucun article ne correspond à votre recherche." />
      )}

      {groups.map(([name, items]) => (
        <div key={name}>
          <h3 className="menu-group">{name} ({items.length})</h3>
          <div className="stack">
            {items.map((p) => (
              <Item
                key={p.product_id + "-" + p.price + "-" + p.is_available}
                p={p}
                onChanged={refresh}
                onEdit={(prod) => setModal({ product: prod })}
              />
            ))}
          </div>
        </div>
      ))}

      {modal && (
        <ProductModal
          product={modal.product}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={async () => { await refresh(); setModal(null); }}
          onPhotoChanged={refresh}
        />
      )}
    </>
  );
}