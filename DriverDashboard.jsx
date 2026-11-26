import { useState } from "react";
import { api } from "../api";
import { usePolling } from "../hooks";
import { useNewItemsAlert } from "../useAlert";
import { DELIVERY_LABELS, fmt, fmtDate } from "../utils";
import DashHeader from "../components/DashHeader";
import Tabs from "../components/Tabs";
import AlertToggle from "../components/AlertToggle";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

const TYPE_LABEL = { MerchantOrder: "🛍️ Commande commerce", OnDemand: "📦 Livraison à la demande" };
const ORDER_HINT = {
  Pending: "⏳ En attente d'acceptation du commerce",
  Confirmed: "✅ Acceptée par le commerce",
  Preparing: "👨‍🍳 En préparation",
  Ready: "🟢 Prête à récupérer",
};
const route = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export default function DriverDashboard() {
  const [tab, setTab] = useState("available");
  const available = usePolling(api.dAvailable, 5000);
  const mine = usePolling(api.dMine, 5000);

  const ids = available.data ? available.data.map((d) => d.delivery_id) : null;
  const { fresh, clear } = useNewItemsAlert(ids, (n) =>
    n > 1 ? `${n} nouvelles livraisons disponibles` : "Nouvelle livraison disponible"
  );

  const run = async (fn, id, message) => {
    if (message && !window.confirm(message)) return;
    try {
      await fn(id);
    } catch (e) {
      alert(e.message);
    }
    available.refresh();
    mine.refresh();
  };

  const active = (mine.data || []).filter((d) => d.status === "Assigned" || d.status === "PickedUp");
  const done = (mine.data || []).filter((d) => d.status === "Delivered");
  const cancelled = (mine.data || []).filter((d) => d.status === "Cancelled");

  const changeTab = (t) => {
    setTab(t);
    if (t === "available") clear();
  };

  return (
    <div className="page">
      <DashHeader title="Espace livreur" />

      {fresh > 0 && (
        <button className="alert-banner" onClick={() => { changeTab("available"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          🔔 {fresh > 1 ? `${fresh} nouvelles livraisons` : "Nouvelle livraison"} : touchez pour voir
        </button>
      )}
      <AlertToggle />

      <Tabs
        value={tab}
        onChange={changeTab}
        tabs={[
          { key: "available", label: "Disponibles", badge: available.data?.length || 0 },
          { key: "mine", label: "Mes livraisons", badge: active.length },
        ]}
      />

      {tab === "available" && (
        <>
          {available.loading && <Loading />}
          {available.error && <ErrorBox message={available.error} onRetry={available.reload} />}
          {available.data?.length === 0 && (
            <Empty icon="🛵" title="Aucune livraison disponible" text="Cette liste se met à jour toutes les 5 secondes." />
          )}
          <div className="stack">
            {available.data?.map((d) => (
              <div key={d.delivery_id} className="card order">
                <div className="row-between">
                  <strong>{TYPE_LABEL[d.delivery_type]}</strong>
                  <strong className="price">{fmt(d.fee)}</strong>
                </div>
                {d.delivery_type === "MerchantOrder" && (
                  <p className="small">🏪 <b>{d.merchant_name}</b> · {ORDER_HINT[d.order_status]}</p>
                )}
                <p className="small">📍 Collecte : {d.pickup_address}</p>
                <p className="small">🏁 Livraison : {d.destination_address}</p>
                {d.package_description && <p className="muted small">📦 {d.package_description}</p>}
                <button className="btn btn-primary btn-block" onClick={() => run(api.dAccept, d.delivery_id)}>
                  Accepter cette livraison
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "mine" && (
        <>
          {mine.loading && <Loading />}
          {mine.error && <ErrorBox message={mine.error} onRetry={mine.reload} />}
          {mine.data && active.length === 0 && done.length === 0 && cancelled.length === 0 && (
            <Empty icon="📭" title="Aucune livraison" text="Acceptez une livraison depuis l'onglet « Disponibles »." />
          )}

          <div className="stack">
            {cancelled.map((d) => (
              <div key={d.delivery_id} className="card order">
                <div className="alert">❌ Livraison n°{d.delivery_id} annulée : ne vous déplacez pas.</div>
                {d.merchant_name && <p className="muted small">{d.merchant_name}</p>}
              </div>
            ))}

            {active.map((d) => {
              // Bloqué seulement si le commerce gère ses commandes et n'a pas fini
              const notReady =
                d.delivery_type === "MerchantOrder" && d.merchant_managed && d.order_status !== "Ready";
              return (
                <div key={d.delivery_id} className="card order highlight">
                  <div className="row-between">
                    <strong>{TYPE_LABEL[d.delivery_type]}</strong>
                    <span className={"pill s-" + d.status}>{DELIVERY_LABELS[d.status]}</span>
                  </div>
                  {d.delivery_type === "MerchantOrder" && (
                    <p className="small">🏪 <b>{d.merchant_name}</b> · {ORDER_HINT[d.order_status]}</p>
                  )}
                  <p className="small">📍 Collecte : {d.pickup_address}</p>
                  <p className="small">🏁 Livraison : {d.destination_address}</p>
                  {d.package_description && <p className="muted small">📦 {d.package_description}</p>}
                  <p className="small">
                    👤 {d.customer_name} ·{" "}
                    <a className="link" href={`tel:+216${d.customer_phone}`}>📞 {d.customer_phone}</a>
                  </p>
                  {d.for_someone_else ? (
                    <p className="muted small">🎁 Livraison pour un tiers : appelez ce numéro.</p>
                  ) : null}
                  <div className="btn-row">
                    {d.pickup_lat && (
                      <a className="btn btn-outline btn-small" target="_blank" rel="noreferrer" href={route(d.pickup_lat, d.pickup_lng)}>
                        🧭 Vers la collecte
                      </a>
                    )}
                    {d.dest_lat && (
                      <a className="btn btn-outline btn-small" target="_blank" rel="noreferrer" href={route(d.dest_lat, d.dest_lng)}>
                        🧭 Vers le client
                      </a>
                    )}
                  </div>
                  <div className="row-between">
                    <span className="muted small">À encaisser (frais)</span>
                    <strong>{fmt(d.fee)}</strong>
                  </div>

                  {d.status === "Assigned" ? (
                    <button className="btn btn-primary btn-block" disabled={notReady}
                      onClick={() => run(api.dPickup, d.delivery_id)}>
                      {notReady ? "⏳ En attente que la commande soit prête" : "🛵 Je pars livrer (en livraison)"}
                    </button>
                  ) : (
                    <button className="btn btn-success btn-block"
                      onClick={() => run(api.dDeliver, d.delivery_id, "Confirmer que la livraison est terminée ?")}>
                      ✅ Livrée
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {done.length > 0 && (
            <>
              <h2 className="section-title">Livrées (dernières 24 h)</h2>
              <div className="stack">
                {done.map((d) => (
                  <div key={d.delivery_id} className="card row-between">
                    <span className="small">n°{d.delivery_id} · {fmtDate(d.requested_at)}</span>
                    <strong>{fmt(d.fee)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}