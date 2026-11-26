import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { useCart } from "../CartContext";
import { useAddress } from "../AddressContext";
import { useQuote } from "../useQuote";
import { usePromo } from "../usePromo";
import { fmt } from "../utils";
import PageHeader from "../components/PageHeader";
import LocationBar from "../components/LocationBar";
import PromoBox from "../components/PromoBox";
import { Empty } from "../components/StateViews";

export default function Cart() {
  const { cart, changeQty, removeItem, clear, subtotal, setPromoCode } = useCart();
  const { current } = useAddress();
  const navigate = useNavigate();
  const merchantId = cart.merchant?.merchant_id;
  const shop = useFetch(() => (merchantId ? api.merchant(merchantId) : Promise.resolve(null)), [merchantId]);
  const quote = useQuote(merchantId, current);
  const promo = usePromo(merchantId, subtotal);
  const [applyError, setApplyError] = useState("");

  const merchantPromo = shop.data?.promo_percent || 0;
  const discount = Math.round(subtotal * merchantPromo) / 100;
  const fee = quote.data?.fee;
  const total = subtotal - discount - promo.discount + (fee ?? 0);

  const applyPromo = async (code) => {
    setApplyError("");
    try {
      await api.promoCheck({ code, merchant_id: merchantId, subtotal: subtotal.toFixed(2) });
      setPromoCode(code);
    } catch (e) {
      setApplyError(e.message);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Mon panier" />
        <Empty icon="🛍️" title="Votre panier est vide" text="Ajoutez des produits depuis un commerce.">
          <Link to="/merchants" className="btn btn-primary">Découvrir les commerces</Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Mon panier" subtitle={cart.merchant?.merchant_name} />
      <LocationBar />

      <div className="stack">
        {cart.items.map((i) => (
          <div key={i.product_id} className="card product">
            <div className="product-info">
              <h3>{i.name}</h3>
              <strong className="price">{fmt(i.price * i.qty)}</strong>
              <p className="muted small">{fmt(i.price)} l'unité</p>
            </div>
            <div className="col-end">
              <div className="qty">
                <button onClick={() => changeQty(i.product_id, -1)}>−</button>
                <span>{i.qty}</span>
                <button onClick={() => changeQty(i.product_id, 1)}>+</button>
              </div>
              <button className="link danger" onClick={() => removeItem(i.product_id)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <PromoBox
          promo={promo}
          applyError={applyError}
          onApply={applyPromo}
          onRemove={() => { setPromoCode(null); setApplyError(""); }}
        />
      </div>

      <div className="card summary">
        <div className="row-between"><span>Sous-total</span><span>{fmt(subtotal)}</span></div>
        {discount > 0 && (
          <div className="row-between promo-row"><span>Remise -{merchantPromo}%</span><span>-{fmt(discount)}</span></div>
        )}
        {promo.discount > 0 && (
          <div className="row-between promo-row"><span>Code {promo.code}</span><span>-{fmt(promo.discount)}</span></div>
        )}
        <div className="row-between">
          <span>Livraison{quote.data ? ` (${String(quote.data.distance_km).replace(".", ",")} km)` : ""}</span>
          <span>{fee != null ? fmt(fee) : "—"}</span>
        </div>
        <div className="row-between total">
          <span>Total</span>
          <span>{fee != null ? fmt(total) : "—"}</span>
        </div>
        <p className="muted small">Paiement en espèces à la livraison.</p>
      </div>

      {!current && <div className="alert" style={{ marginTop: 12 }}>Choisissez une adresse pour calculer les frais de livraison.</div>}
      {quote.error && <div className="alert" style={{ marginTop: 12 }}>{quote.error}</div>}

      <button
        className="btn btn-primary btn-block"
        disabled={!current || !quote.data || Boolean(promo.error)}
        onClick={() => navigate("/checkout")}
      >
        Passer la commande
      </button>
      {promo.error && <p className="muted small center">Retirez le code promo non valide pour continuer.</p>}
      <button className="btn btn-ghost btn-block" onClick={clear}>Vider le panier</button>
    </div>
  );
}