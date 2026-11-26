import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useFavorites } from "../FavoritesContext";
import { useFetch } from "../hooks";
import { categoryIcon, fmt } from "../utils";
import PageHeader from "../components/PageHeader";
import LocationBar from "../components/LocationBar";
import MerchantCard from "../components/MerchantCard";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

const fold = (s = "") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const PRICES = ["", "5", "10", "15", "20", "30"];

export default function Merchants() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ids } = useFavorites();
  const [sort, setSort] = useState("top");
  const { data, error, loading, reload } = useFetch(() => api.merchants(sort), [sort]);

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("Tous");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [found, setFound] = useState(null);

  const searching = search.trim().length >= 2;

  // Recherche de produits (avec délai pour ne pas surcharger le serveur)
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setFound(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api.search(q, { maxPrice, openOnly: onlyOpen })
        .then((r) => !cancelled && setFound(r))
        .catch(() => !cancelled && setFound(null));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, maxPrice, onlyOpen]);

  const categories = useMemo(
    () => ["Tous", ...new Set((data || []).map((m) => m.category))],
    [data]
  );

  const needle = fold(search.trim());
  const filtered = (data || []).filter(
    (m) =>
      (cat === "Tous" || m.category === cat) &&
      (!needle || fold(m.merchant_name).includes(needle) || fold(m.category).includes(needle)) &&
      (!onlyOpen || m.is_open) &&
      (!onlyPromo || m.promo_percent > 0) &&
      (!onlyFav || ids.has(m.merchant_id))
  );
  const open = filtered.filter((m) => m.is_open);
  const closed = filtered.filter((m) => !m.is_open);

  const toggleFav = () => {
    if (user?.role !== "Customer") return navigate("/login", { state: { from: "/merchants" } });
    setOnlyFav(!onlyFav);
  };

  return (
    <div className="page">
      <PageHeader title="Commerces" subtitle="Choisissez où commander" />
      <LocationBar />

      <input
        className="search"
        placeholder="🔍 Commerce, catégorie ou produit (ex : pizza, croissant)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="chips">
        <button className={"chip" + (onlyOpen ? " active" : "")} onClick={() => setOnlyOpen(!onlyOpen)}>🟢 Ouverts</button>
        <button className={"chip" + (onlyPromo ? " active" : "")} onClick={() => setOnlyPromo(!onlyPromo)}>🏷️ Promos</button>
        <button className={"chip" + (onlyFav ? " active" : "")} onClick={toggleFav}>♥ Favoris</button>
      </div>

      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={"chip" + (cat === c ? " active" : "")} onClick={() => setCat(c)}>
            {c !== "Tous" && `${categoryIcon(c)} `}{c}
          </button>
        ))}
      </div>

      <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier">
        <option value="top">⭐ Les mieux notés</option>
        <option value="fast">⚡ Les plus rapides</option>
        <option value="name">🔤 Ordre alphabétique</option>
      </select>

      {searching && (
        <>
          <div className="row-between section-title">
            <h2>Produits trouvés</h2>
            <select className="select" style={{ width: "auto" }} value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)} aria-label="Prix maximum">
              {PRICES.map((p) => (
                <option key={p} value={p}>{p ? `Jusqu'à ${p} DT` : "Tous les prix"}</option>
              ))}
            </select>
          </div>
          {found && found.products.length === 0 && (
            <p className="muted small">Aucun produit ne correspond à cette recherche.</p>
          )}
          <div className="stack">
            {found?.products.map((p) => (
              <Link
                key={p.product_id}
                to={`/merchants/${p.merchant_id}`}
                className={"card hit" + (p.is_open ? "" : " is-closed")}
              >
                <div>
                  <strong>{p.product_name}</strong>
                  <p className="muted small">{p.merchant_name}{p.is_open ? "" : " · Fermé"}</p>
                </div>
                <strong className="price">{fmt(p.price)}</strong>
              </Link>
            ))}
          </div>
        </>
      )}

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && filtered.length === 0 && !found?.products?.length && (
        <Empty
          icon={onlyFav ? "♡" : "🔎"}
          title={onlyFav ? "Aucun favori" : "Aucun résultat"}
          text={onlyFav ? "Touchez le ♡ d'un commerce pour le retrouver ici." : "Essayez une autre recherche ou d'autres filtres."}
        />
      )}

      {open.length > 0 && (
        <>
          <h2 className="section-title">Ouverts maintenant ({open.length})</h2>
          <div className="stack">{open.map((m) => <MerchantCard key={m.merchant_id} m={m} />)}</div>
        </>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="section-title">Actuellement fermés ({closed.length})</h2>
          <div className="stack">{closed.map((m) => <MerchantCard key={m.merchant_id} m={m} />)}</div>
        </>
      )}
    </div>
  );
}