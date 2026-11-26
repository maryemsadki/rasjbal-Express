import { useState } from "react";
import { api } from "../api";
import { useFetch, usePolling } from "../hooks";
import { useNewItemsAlert } from "../useAlert";
import { fmt, fmtDate, ORDER_LABELS } from "../utils";
import DashHeader from "../components/DashHeader";
import Tabs from "../components/Tabs";
import MenuManager from "../components/MenuManager";
import AlertToggle from "../components/AlertToggle";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

const ACTIONS = {
  Pending: [
    { to: "Confirmed", label: "Accepter", primary: true },
    { to: "Cancelled", label: "Refuser", danger: true },
  ],
  Confirmed: [
    { to: "Preparing", label: "Lancer la préparation", primary: true },
    { to: "Cancelled", label: "Annuler", danger: true },
  ],
  Preparing: [{ to: "Ready", label: "Commande prête", primary: true }],
};

function OrdersTab({ orders }) {
  const change = async (id, to) => {
    if (to === "Cancelled" && !window.confirm("Annuler cette commande ?")) return;
    try {
      await api.mOrderStatus(id, to);
    } catch (e) {
      alert(e.message);
    }
    orders.refresh();
  };

  if (orders.loading) return <Loading />;
  if (orders.error) return <ErrorBox message={orders.error} onRetry={orders.reload} />;
  if (!orders.data?.length)
    return <Empty icon="🧾" title="Aucune commande" text="Les nouvelles commandes apparaîtront ici automatiquement." />;

  return (
    <div className="stack">
      {orders.data.map((o) => (
        <div key={o.order_id} className={"card order" + (o.status === "Pending" ? " highlight" : "")}>
          <div className="row-between">
            <h3>Commande n°{o.order_id}</h3>
            <span className={"pill s-" + o.status}>{ORDER_LABELS[o.status]}</span>
          </div>
          <p className="muted small">{o.customer_name} · {fmtDate(o.order_date)}</p>
          <ul className="items">
            {o.items.map((it, k) => (
              <li key={k}><span>{it.quantity} × {it.name}</span><span>{fmt(it.unit_price * it.quantity)}</span></li>
            ))}
            <li><strong>Sous-total</strong><strong>{fmt(o.subtotal)}</strong></li>
          </ul>
          {o.allergies && (
            <div className="note allergy-note">⚠️ <strong>Allergies :</strong> {o.allergies}</div>
          )}
          {o.notes && <div className="note">💬 {o.notes}</div>}
          {ACTIONS[o.status] && (
            <div className="btn-row">
              {ACTIONS[o.status].map((a) => (
                <button
                  key={a.to}
                  className={"btn btn-small " + (a.danger ? "btn-danger" : "btn-primary")}
                  onClick={() => change(o.order_id, a.to)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {o.status === "Ready" && <p className="muted small">⏳ En attente d'un livreur.</p>}
          {o.status === "Delivering" && <p className="muted small">🛵 Le livreur est en route.</p>}
        </div>
      ))}
    </div>
  );
}

export default function MerchantDashboard() {
  const [tab, setTab] = useState("orders");
  const shop = useFetch(api.shopGet);
  const orders = usePolling(api.mOrders, 5000);
  const pendingIds = orders.data ? orders.data.filter((o) => o.status === "Pending").map((o) => o.order_id) : null;
  const pending = pendingIds ? pendingIds.length : 0;
  const { fresh, clear } = useNewItemsAlert(pendingIds, (n) =>
    n > 1 ? `${n} nouvelles commandes` : "Nouvelle commande"
  );

  const toggle = async () => {
    try {
      await api.shopUpdate({ is_open: !shop.data.is_open });
      shop.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="page">
      <DashHeader title={shop.data?.merchant_name || "Mon commerce"} subtitle="Espace commerçant" />

      {fresh > 0 && (
        <button className="alert-banner" onClick={() => { setTab("orders"); clear(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          🔔 {fresh > 1 ? `${fresh} nouvelles commandes` : "Nouvelle commande"} : touchez pour voir
        </button>
      )}
      <AlertToggle />

      {shop.data && (
        <div className="card row-between" style={{ marginTop: 12 }}>
          <div>
            <span className={"badge " + (shop.data.is_open ? "open" : "closed")}>
              {shop.data.is_open ? "Ouvert" : "Fermé"}
            </span>
            <p className="muted small">
              {shop.data.is_open ? "Vous recevez des commandes." : "Les clients ne peuvent pas commander."}
            </p>
          </div>
          <button className={"btn btn-small " + (shop.data.is_open ? "btn-outline" : "btn-primary")} onClick={toggle}>
            {shop.data.is_open ? "Fermer" : "Ouvrir"}
          </button>
        </div>
      )}
      {shop.error && <ErrorBox message={shop.error} onRetry={shop.reload} />}

      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); if (t === "orders") clear(); }}
        tabs={[{ key: "orders", label: "Commandes", badge: pending }, { key: "menu", label: "Menu" }]}
      />
      {tab === "orders" ? <OrdersTab orders={orders} /> : <MenuManager />}
    </div>
  );
}