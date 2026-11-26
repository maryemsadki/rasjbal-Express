import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { usePolling } from "../hooks";
import { useCart } from "../CartContext";
import { DELIVERY_LABELS, STATUS_STEPS, fmt, fmtDate, fmtKm } from "../utils";
import PageHeader from "../components/PageHeader";
import Tabs from "../components/Tabs";
import AlertToggle from "../components/AlertToggle";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

const DRIVER_NOTE = {
  Assigned: "a accepté votre livraison",
  PickedUp: "est en route vers vous",
  Delivered: "a livré votre commande",
};

const isFinished = (s) => s === "Delivered" || s === "Cancelled";
const thumb = (v) => (v ? "👍" : "👎");

function Tracker({ status }) {
  if (status === "Cancelled") return <div className="alert">❌ Commande annulée</div>;
  const idx = Math.max(0, STATUS_STEPS.findIndex((s) => s.key === status));
  return (
    <ol className="stepper">
      {STATUS_STEPS.map((s, i) => (
        <li key={s.key} className={i < idx ? "done" : i === idx ? "current" : ""}>
          <span className="step-dot">{i < idx ? "✓" : i + 1}</span>
          <span className="step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Thumbs({ label, value, onChange }) {
  return (
    <div className="rate-row">
      <span>{label}</span>
      <div className="btn-row">
        <button type="button" className={"btn btn-small " + (value === true ? "btn-primary" : "btn-outline")}
          onClick={() => onChange(true)}>👍 Très bien</button>
        <button type="button" className={"btn btn-small " + (value === false ? "btn-primary" : "btn-outline")}
          onClick={() => onChange(false)}>👎 Décevant</button>
      </div>
    </div>
  );
}

// Noter le restaurant et, s'il y en a un, le livreur
function RateBox({ order, onDone }) {
  const [shop, setShop] = useState(null);
  const [driver, setDriver] = useState(null);
  const [busy, setBusy] = useState(false);
  const hasDriver = Boolean(order.driver_name);

  const submit = async () => {
    setBusy(true);
    try {
      await api.reviewOrder(order.order_id, {
        positive: shop,
        driver_positive: hasDriver ? driver : null,
      });
      await onDone();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rate">
      <strong>Comment était votre commande ?</strong>
      <Thumbs label={`🏪 ${order.merchant_name}`} value={shop} onChange={setShop} />
      {hasDriver && <Thumbs label={`🛵 Livreur (${order.driver_name})`} value={driver} onChange={setDriver} />}
      <button className="btn btn-primary btn-small" disabled={shop === null || busy} onClick={submit}>
        {busy ? "Envoi…" : "Envoyer mon avis"}
      </button>
    </div>
  );
}

export default function MyOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, replaceCart } = useCart();
  const orders = usePolling(api.myOrders, 8000);
  const deliveries = usePolling(api.myDeliveries, 8000);
  const [tab, setTab] = useState("active");

  const allOrders = orders.data || [];
  const allDeliveries = deliveries.data || [];
  const inTab = (finished) => (tab === "history" ? finished : !finished);
  const shownOrders = allOrders.filter((o) => inTab(isFinished(o.status)));
  const shownDeliveries = allDeliveries.filter((d) => inTab(isFinished(d.status)));
  const activeCount =
    allOrders.filter((o) => !isFinished(o.status)).length +
    allDeliveries.filter((d) => !isFinished(d.status)).length;

  const cancel = async (id) => {
    if (!window.confirm("Annuler cette commande ?")) return;
    try {
      await api.cancelOrder(id);
    } catch (e) {
      alert(e.message);
    }
    orders.refresh();
  };

  const reorder = async (o) => {
    if (cart.items.length > 0 && !window.confirm("Remplacer votre panier actuel ?")) return;
    try {
      const products = await api.products(o.merchant_id);
      const byId = Object.fromEntries(products.map((p) => [p.product_id, p]));
      const items = o.items
        .filter((i) => byId[i.product_id])
        .map((i) => ({
          product_id: i.product_id,
          name: byId[i.product_id].product_name,
          price: byId[i.product_id].price,
          qty: i.quantity,
        }));
      if (items.length === 0) return alert("Ces produits ne sont plus disponibles.");
      if (items.length < o.items.length) alert("Certains produits ne sont plus disponibles et ont été retirés.");
      replaceCart({ merchant_id: o.merchant_id, merchant_name: o.merchant_name }, items);
      navigate("/cart");
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Mes commandes" subtitle="Suivi en direct (mise à jour toutes les 8 secondes)" />

      {location.state?.justOrdered && (
        <div className="success">✅ Commande n°{location.state.justOrdered} envoyée avec succès !</div>
      )}

      <AlertToggle />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ key: "active", label: "En cours", badge: activeCount }, { key: "history", label: "Historique" }]}
      />

      {orders.loading && <Loading />}
      {orders.error && <ErrorBox message={orders.error} onRetry={orders.reload} />}
      {orders.data && shownOrders.length === 0 && shownDeliveries.length === 0 && (
        <Empty
          icon="📦"
          title={tab === "active" ? "Aucune commande en cours" : "Aucune commande passée"}
          text={tab === "active" ? "Vos commandes en cours apparaîtront ici." : "Vos anciennes commandes apparaîtront ici."}
        />
      )}

      <div className="stack">
        {shownOrders.map((o) => (
          <div key={o.order_id} className="card order">
            <div className="row-between">
              <h3>{o.merchant_name}</h3>
              <strong>{fmt(o.total)}</strong>
            </div>
            <p className="muted small">Commande n°{o.order_id} · {fmtDate(o.order_date)}</p>
            {o.recipient_name && <p className="small">🎁 Pour : {o.recipient_name}</p>}
            {o.allergies && <p className="small">⚠️ Allergies signalées : {o.allergies}</p>}

            <Tracker status={o.status} />

            {o.driver_name && DRIVER_NOTE[o.delivery_status] && o.status !== "Cancelled" && (
              <p className="driver-line">🛵 <b>{o.driver_name}</b> {DRIVER_NOTE[o.delivery_status]}</p>
            )}

            <ul className="items">
              {o.items.map((it, k) => (
                <li key={k}><span>{it.quantity} × {it.name}</span><span>{fmt(it.unit_price * it.quantity)}</span></li>
              ))}
              {o.discount > 0 && (
                <li className="promo-row"><span>Remise</span><span>-{fmt(o.discount)}</span></li>
              )}
              {o.promo_discount > 0 && (
                <li className="promo-row"><span>Code {o.promo_code}</span><span>-{fmt(o.promo_discount)}</span></li>
              )}
              <li className="muted">
                <span>Livraison{o.distance_km != null ? ` (${fmtKm(o.distance_km)})` : ""}</span>
                <span>{fmt(o.delivery_fee)}</span>
              </li>
            </ul>

            {o.status === "Pending" && (
              <button className="btn btn-danger" onClick={() => cancel(o.order_id)}>Annuler la commande</button>
            )}

            {o.status === "Delivered" && o.review == null && <RateBox order={o} onDone={orders.refresh} />}
            {o.review != null && (
              <p className="muted small">
                Merci pour votre avis : restaurant {thumb(o.review)}
                {o.driver_review != null ? ` · livreur ${thumb(o.driver_review)}` : ""}
              </p>
            )}

            {isFinished(o.status) && (
              <button className="btn btn-outline" onClick={() => reorder(o)}>🔁 Commander à nouveau</button>
            )}
          </div>
        ))}
      </div>

      {shownDeliveries.length > 0 && (
        <>
          <h2 className="section-title">Mes livraisons à la demande</h2>
          <div className="stack">
            {shownDeliveries.map((d) => (
              <div key={d.delivery_id} className="card order">
                <div className="row-between">
                  <h3>Livraison n°{d.delivery_id}</h3>
                  <span className={"pill s-" + d.status}>{DELIVERY_LABELS[d.status]}</span>
                </div>
                {d.driver_name && d.status !== "Cancelled" && (
                  <p className="driver-line">🛵 <b>{d.driver_name}</b> {DRIVER_NOTE[d.status] || ""}</p>
                )}
                <p className="small">📍 De : {d.pickup_address}</p>
                <p className="small">🏁 Vers : {d.destination_address}</p>
                {d.package_description && <p className="muted small">📦 {d.package_description}</p>}
                <div className="row-between small">
                  <span className="muted">{fmtDate(d.requested_at)}</span>
                  <strong>{fmt(d.fee)}</strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}