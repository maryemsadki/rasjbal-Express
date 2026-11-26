import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { useCart } from "../CartContext";
import { fmt, imgSrc, groupVariants } from "../utils";
import PageHeader from "../components/PageHeader";
import { Cover, Rating } from "../components/MerchantCard";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

// Photo de l'article ; à défaut, une case grise qui garde l'alignement
function Thumb({ p }) {
  const [failed, setFailed] = useState(false);
  const src = imgSrc(p.image_url);
  if (src && !failed) {
    return (
      <div className="md-thumb">
        <img
          src={src}
          alt={p.group_name || p.product_name || ""}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return <div className="md-thumb empty" aria-hidden="true" />;
}

function Price({ p }) {
  return (
    <div className="md-price">
      <strong className="price">{fmt(p.price)}</strong>
      {p.old_price && <s className="muted small">{fmt(p.old_price)}</s>}
    </div>
  );
}

// Bouton « Ajouter » ou boutons − / + selon le panier
function Control({ p, merchant }) {
  const { cart, addItem, changeQty } = useCart();
  const inCart = cart.items.find((i) => i.product_id === p.product_id);

  if (inCart) {
    return (
      <div className="qty">
        <button onClick={() => changeQty(p.product_id, -1)} aria-label="Diminuer la quantité">−</button>
        <span>{inCart.qty}</span>
        <button onClick={() => changeQty(p.product_id, 1)} aria-label="Augmenter la quantité">+</button>
      </div>
    );
  }
  return (
    <button
      className="btn btn-primary btn-small"
      disabled={!merchant.is_open}
      onClick={() => addItem(merchant, p)}
    >
      Ajouter
    </button>
  );
}

// Un plat ; s'il a des variantes (Moyenne / Maxi), on choisit la taille
function Dish({ p, merchant }) {
  const variants = p.variants && p.variants.length > 1 ? p.variants : null;
  const [sel, setSel] = useState(0);
  const cur = variants ? variants[Math.min(sel, variants.length - 1)] : p;
  const photo = variants ? variants.find((v) => v.image_url) || cur : cur;

  return (
    <div className="card md-dish">
      <Thumb p={photo} />
      <div className="md-body">
        <div className="row-between">
          <h3>{variants ? p.group_name : cur.product_name}</h3>
          <Price p={cur} />
        </div>
        {cur.description && <p className="muted small">{cur.description}</p>}
        {variants && (
          <div className="variants">
            {variants.map((v, i) => (
              <button
                key={v.product_id}
                type="button"
                className={"variant" + (i === sel ? " active" : "")}
                onClick={() => setSel(i)}
              >
                {v.variant_label} · {fmt(v.price)}
              </button>
            ))}
          </div>
        )}
        <div className="md-ctl">
          <Control p={cur} merchant={merchant} />
        </div>
      </div>
    </div>
  );
}

export default function MerchantDetails() {
  const { id } = useParams();

  const { data, error, loading, reload } = useFetch(
    () => Promise.all([api.merchant(id), api.products(id)]),
    [id]
  );

  const { count, subtotal } = useCart();

  const merchant = data?.[0];
  const products = data?.[1] || [];

  // Sections : Promotions, Les plus vendus, puis une section par catégorie
  const sections = useMemo(() => {
    const list = [];

    const promos = products.filter((p) => p.old_price);
    if (promos.length) list.push({ name: "Promotions", icon: "🏷️", items: promos });

    const best = products
      .filter((p) => Number(p.sold) > 0)
      .sort((a, b) => Number(b.sold) - Number(a.sold))
      .slice(0, 6);
    if (best.length) list.push({ name: "Les plus vendus", icon: "🔥", items: best });

    const map = new Map();
    for (const p of products) {
      const key = p.category || "Autres";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const [name, items] of map) {
      list.push({ name, items: groupVariants(items) });
    }
    return list;
  }, [products]);

  const goTo = (i) =>
    document.getElementById("cat-" + i)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="page has-cartbar">
      <PageHeader title={merchant?.merchant_name || "Commerce"} subtitle={merchant?.category} />

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {merchant && (
        <>
          <div className="card merchant-banner">
            <Cover m={merchant} big />

            <div className="stack-sm">
              <div className="meta">
                <span className={"badge " + (merchant.is_open ? "open" : "closed")}>
                  {merchant.is_open ? "Ouvert" : "Fermé"}
                </span>
                <Rating percent={merchant.rating_percent} count={merchant.rating_count} />
                <span>🕒 {merchant.prep_time}–{merchant.prep_time + 10} min</span>
              </div>

              {merchant.promo_percent > 0 && (
                <span className="badge promo">-{merchant.promo_percent}% sur tout le menu</span>
              )}

              <p className="muted small">📍 {merchant.address}</p>
            </div>
          </div>

          {!merchant.is_open && (
            <div className="alert" style={{ marginTop: 12 }}>
              Ce commerce est fermé pour le moment. Vous pouvez voir le menu, mais pas commander.
            </div>
          )}

          {products.length === 0 && (
            <Empty
              icon="🍽️"
              title="Aucun produit disponible"
              text="Ce commerce n'a pas encore de produits."
            />
          )}

          {sections.length > 1 && (
            <div className="md-cats">
              {sections.map((s, i) => (
                <button key={s.name} type="button" className="chip" onClick={() => goTo(i)}>
                  {s.icon ? s.icon + " " : ""}{s.name}
                </button>
              ))}
            </div>
          )}

          {sections.map((s, i) => (
            <section key={s.name} id={"cat-" + i} className="md-section">
              <h2 className="section-title">
                {s.icon ? s.icon + " " : ""}{s.name}
              </h2>
              <div className="stack">
                {s.items.map((p) => (
                  <Dish key={s.name + "-" + p.product_id} p={p} merchant={merchant} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {count > 0 && (
        <Link to="/cart" className="cartbar">
          <span>🛍️ {count} article{count > 1 ? "s" : ""}</span>
          <strong>Voir le panier · {fmt(subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}