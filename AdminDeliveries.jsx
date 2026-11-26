import { useState } from "react";
import { api } from "../api";
import { useFetch, usePolling } from "../hooks";
import { DELIVERY_LABELS, fmt, fmtDate } from "../utils";
import { Loading, ErrorBox, Empty } from "./StateViews";

const STATUSES = ["Pending", "Assigned", "PickedUp", "Delivered", "Cancelled"];
const FILTERS = [
  ["active", "En cours"],
  ["Pending", "En attente"],
  ["Delivered", "Livrées"],
  ["Cancelled", "Annulées"],
  ["all", "Toutes"],
];
const TYPE = { MerchantOrder: "🛍️ Commande commerce", OnDemand: "📦 À la demande" };

export default function AdminDeliveries() {
  const { data, error, loading, reload, refresh } = usePolling(api.aDeliveries, 8000);
  const users = useFetch(api.aUsers);
  const [filter, setFilter] = useState("active");
  const drivers = (users.data || []).filter((u) => u.role === "Driver" && u.is_active);

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      alert(e.message);
    }
    refresh();
  };
  const assign = (id, value) => value && run(() => api.aDeliveryAssign(id, Number(value)));
  const setStatus = (id, status) => {
    if (status === "Cancelled" && !window.confirm("Annuler cette livraison ?")) return;
    run(() => api.aDeliveryStatus(id, status));
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const list = (data || []).filter((d) =>
    filter === "all"
      ? true
      : filter === "active"
      ? ["Pending", "Assigned", "PickedUp"].includes(d.status)
      : d.status === filter
  );

  return (
    <>
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={"chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {drivers.length === 0 && (
        <div className="alert">Aucun livreur actif. Créez un compte livreur dans l'onglet Équipe.</div>
      )}
      {list.length === 0 && <Empty icon="🛵" title="Aucune livraison" />}

      <div className="stack">
        {list.map((d) => {
          const closed = d.status === "Delivered" || d.status === "Cancelled";
          return (
            <div key={d.delivery_id} className="card order">
              <div className="row-between">
                <strong>n°{d.delivery_id} · {TYPE[d.delivery_type]}</strong>
                <span className={"pill s-" + d.status}>{DELIVERY_LABELS[d.status]}</span>
              </div>
              {d.merchant_name && <p className="small">🏪 {d.merchant_name} · commande n°{d.order_id}</p>}
              <p className="small">👤 {d.customer_name} · 📞 {d.customer_phone}</p>
              {d.recipient_name && <p className="small">🎁 Pour : {d.recipient_name} · {d.recipient_phone}</p>}
              <p className="small">📍 {d.pickup_address}</p>
              <p className="small">🏁 {d.destination_address}</p>
              {d.package_description && <p className="muted small">📦 {d.package_description}</p>}
              <p className="muted small">
                Demandée {fmtDate(d.requested_at)}
                {d.assigned_at && ` · assignée ${fmtDate(d.assigned_at)}`}
                {d.picked_up_at && ` · partie ${fmtDate(d.picked_up_at)}`}
                {d.delivered_at && ` · livrée ${fmtDate(d.delivered_at)}`}
              </p>
              {d.driver_name && (
                <p className="small">
                  🛵 <b>{d.driver_name}</b> ·{" "}
                  <a className="link" href={`tel:+216${d.driver_phone}`}>📞 {d.driver_phone}</a>
                </p>
              )}
              <div className="row-between small">
                <span className="muted">Frais de livraison</span>
                <strong>{fmt(d.fee)}</strong>
              </div>

              <select className="select" disabled={closed} value={d.driver_id || ""}
                onChange={(e) => assign(d.delivery_id, e.target.value)}>
                <option value="">— Assigner un livreur —</option>
                {drivers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <select className="select" value={d.status}
                onChange={(e) => setStatus(d.delivery_id, e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{DELIVERY_LABELS[s]}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </>
  );
}