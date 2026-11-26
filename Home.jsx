import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { useAddress } from "../AddressContext";
import LocationBar from "../components/LocationBar";
import MerchantCard from "../components/MerchantCard";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function Home() {
  const { data, error, loading, reload } = useFetch(api.merchants);
  const { current, openSheet } = useAddress();

  useEffect(() => {
    if (!current && !sessionStorage.getItem("rje_asked")) {
      sessionStorage.setItem("rje_asked", "1");
      openSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <LocationBar />

      <section className="hero">
        <p className="hero-brand">🏔️ RasJbal Express</p>
        <h1>{greeting()} !</h1>
        <p>Que souhaitez-vous faire ?</p>
      </section>

      <div className="actions">
        <Link to="/merchants" className="action-card primary">
          <span className="action-icon">🛍️</span>
          <strong>Commander auprès d'un commerce</strong>
          <small>Restaurants, pâtisseries, épiceries…</small>
        </Link>
        <Link to="/delivery?type=pharmacy" className="action-card">
          <span className="action-icon">💊</span>
          <strong>Pharmacie</strong>
          <small>Faites livrer vos médicaments</small>
        </Link>
        <Link to="/delivery" className="action-card">
          <span className="action-icon">🛵</span>
          <strong>Demander une livraison</strong>
          <small>Faites livrer un colis ou un achat</small>
        </Link>
      </div>

      <div className="row-between section-title">
        <h2>Commerces disponibles</h2>
        <Link to="/merchants" className="link">Tout voir</Link>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty icon="🏪" title="Aucun commerce" text="Revenez un peu plus tard." />
      )}
      <div className="stack">
        {data?.slice(0, 4).map((m) => <MerchantCard key={m.merchant_id} m={m} />)}
      </div>
    </div>
  );
}