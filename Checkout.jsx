import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../hooks";
import { useCart } from "../CartContext";
import { useAuth } from "../AuthContext";
import { useAddress } from "../AddressContext";
import { useQuote } from "../useQuote";
import { usePromo } from "../usePromo";
import { fmt, isValidPhone, normalizePhone } from "../utils";
import PageHeader from "../components/PageHeader";
import MapPreview from "../components/MapPreview";
import RecipientForm from "../components/RecipientForm";
import AllergyForm from "../components/AllergyForm";
import { Loading } from "../components/StateViews";

export default function Checkout() {
  const { cart, subtotal, clear, setPromoCode } = useCart();
  const { user, ready } = useAuth();
  const { current, openSheet } = useAddress();
  const navigate = useNavigate();
  const merchantId = cart.merchant?.merchant_id;
  const shop = useFetch(() => (merchantId ? api.merchant(merchantId) : Promise.resolve(null)), [merchantId]);
  const quote = useQuote(merchantId, current);
  const promo = usePromo(merchantId, subtotal);

  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState({ on: false, name: "", phone: "" });
  const [allergy, setAllergy] = useState({ list: [], note: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  if (!ready) return <div className="page"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: "/checkout" }} />;
  if (user.role !== "Customer")
    return (
      <div className="page">
        <PageHeader title="Finaliser" />
        <div className="alert">Seuls les comptes clients peuvent passer commande.</div>
      </div>
    );
  if (cart.items.length === 0) return <Navigate to="/cart" replace />;

  const merchantPromo = shop.data?.promo_percent || 0;
  const discount = Math.round(subtotal * merchantPromo) / 100;
  const fee = quote.data?.fee;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!current) return setError("Choisissez une adresse de livraison.");
    if (!quote.data) return setError(quote.error || "Les frais de livraison ne sont pas encore calculés.");
    if (promo.error) return setError("Retirez le code promo non valide pour continuer.");
    if (recipient.on) {
      if (recipient.name.trim().length < 2) return setError("Indiquez le nom du destinataire.");
      if (!isValidPhone(recipient.phone)) return setError("Le téléphone du destinataire doit contenir 8 chiffres.");
    }
    setSending(true);
    try {
      const res = await api.createOrder({
        merchant_id: merchantId,
        address: current.line,
        details: current.details || null,
        latitude: current.lat,
        longitude: current.lng,
        recipient_name: recipient.on ? recipient.name.trim() : null,
        recipient_phone: recipient.on ? normalizePhone(recipient.phone) : null,
        allergies: shop.data?.is_food ? allergy.list : [],
        allergy_note: shop.data?.is_food ? allergy.note.trim() || null : null,
        notes: notes.trim() || null,
        promo_code: promo.code || null,
        items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.qty })),
      });
      clear();
      navigate("/orders", { state: { justOrdered: res.order_id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Finaliser" subtitle={cart.merchant?.merchant_name} />
      <form onSubmit={submit} className="stack">
        <h2 className="section-title" style={{ margin: "4px 0" }}>Adresse de livraison</h2>
        <div className="card stack-sm">
          {current && <MapPreview lat={current.lat} lng={current.lng} onClick={openSheet} />}
          <button type="button" className="row-btn" onClick={openSheet}>
            <span>
              📍 <b>{current ? current.label : "Choisir une adresse"}</b><br />
              <small className="muted">{current ? `${current.line}${current.details ? " — " + current.details : ""}` : "Nécessaire pour calculer la livraison"}</small>
            </span>
            <span>›</span>
          </button>
        </div>

        <RecipientForm value={recipient} onChange={setRecipient} />

        <div className="card">
          <p className="muted small">Commande au nom de</p>
          <strong>{user.full_name}</strong>
          <p className="muted small">📞 {user.phone}</p>
        </div>

        <div className="card">
          <strong>Votre commande</strong>
          <p className="muted small">{cart.items.reduce((s, i) => s + i.qty, 0)} produit(s) chez {cart.merchant?.merchant_name}</p>
        </div>

        {shop.data?.is_food && <AllergyForm value={allergy} onChange={setAllergy} />}

        <label className="field">Instruction de livraison (facultatif)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : sonnez deux fois" maxLength={300} />
        </label>

        {promo.code && (
          <div className="card promo-box">
            <div className="row-between">
              <span>🏷️ Code <b>{promo.code}</b>{promo.loading ? " …" : promo.error ? "" : ` : -${fmt(promo.discount)}`}</span>
              <button type="button" className="link danger" onClick={() => setPromoCode(null)}>Retirer</button>
            </div>
            {promo.error && <div className="alert">{promo.error}</div>}
          </div>
        )}

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
            <span>Total à payer</span>
            <span>{fee != null ? fmt(subtotal - discount - promo.discount + fee) : "—"}</span>
          </div>
          <p className="muted small">Paiement en espèces. Le montant final est confirmé par le serveur.</p>
        </div>

        {quote.error && <div className="alert">{quote.error}</div>}
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={sending || !quote.data || Boolean(promo.error)}>
          {sending ? "Envoi en cours…" : "Confirmer la commande"}
        </button>
      </form>
    </div>
  );
}