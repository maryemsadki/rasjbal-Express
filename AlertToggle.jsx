import { useState } from "react";
import { alertsEnabled, disableAlerts, enableAlerts } from "../useAlert";

export default function AlertToggle() {
  const [on, setOn] = useState(alertsEnabled());
  const [busy, setBusy] = useState(false);

  const denied =
    typeof Notification !== "undefined" && Notification.permission === "denied";

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        disableAlerts();
        setOn(false);
      } else {
        await enableAlerts();
        setOn(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn ${on ? "btn-outline" : "btn-primary"} btn-block`}
      disabled={busy}
      onClick={toggle}
      style={{ marginTop: 10, marginBottom: 12 }}
    >
      {busy
        ? "Activation…"
        : on
          ? denied
            ? "🔔 Alertes sonores actives · Notifications bloquées"
            : "🔔 Alertes activées · Désactiver"
          : "🔔 Activer les alertes sonores"}
    </button>
  );
}