import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { usePolling } from "../hooks";
import { alertsEnabled, beep } from "../useAlert";

const MESSAGES = {
  Confirmed: "le restaurant a accepté votre commande ✅",
  Preparing: "votre commande est en préparation 👨‍🍳",
  Ready: "votre commande est prête 🟢",
  Delivering: "votre commande est en route 🛵",
  Delivered: "votre commande a été livrée. Bon appétit ! 🎉",
  Cancelled: "votre commande a été annulée ❌",
};

async function systemNotify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, { body, tag: "rje-order", renotify: true, vibrate: [300, 120, 300] });
    else new Notification(title, { body, tag: "rje-order" });
  } catch {
    /* notification indisponible */
  }
}

// Prévient le client à chaque changement d'état de ses commandes, sur n'importe quelle page
export default function CustomerNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const customer = user?.role === "Customer";
  const orders = usePolling(() => (customer ? api.myOrders() : Promise.resolve(null)), 10000, [user?.id]);
  const seen = useRef(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    seen.current = null;
    setToast(null);
  }, [user?.id]);

  useEffect(() => {
    if (!orders.data) return;
    const now = new Map(orders.data.map((o) => [o.order_id, { status: o.status, ds: o.delivery_status }]));
    if (seen.current === null) {
      seen.current = now; // première lecture : aucune alerte
      return;
    }
    const lines = [];
    for (const o of orders.data) {
      const before = seen.current.get(o.order_id);
      if (!before) continue;
      if (before.status !== o.status && MESSAGES[o.status]) {
        lines.push(`Commande n°${o.order_id} : ${MESSAGES[o.status]}`);
      } else if (before.ds !== o.delivery_status && o.delivery_status === "Assigned" && o.driver_name) {
        lines.push(`${o.driver_name} a accepté votre livraison (commande n°${o.order_id}) 🛵`);
      }
    }
    seen.current = now;
    if (lines.length === 0) return;
    const text = lines.join("\n");
    setToast({ text, id: Date.now() });
    if (alertsEnabled()) {
      beep();
      navigator.vibrate?.([300, 120, 300]);
      systemNotify("RasJbal Express", text);
    }
  }, [orders.data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <button
      className="toast"
      onClick={() => {
        setToast(null);
        navigate("/orders");
      }}
    >
      <span>🔔</span>
      <span style={{ whiteSpace: "pre-line" }}>{toast.text}</span>
    </button>
  );
}