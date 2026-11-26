import { useEffect, useRef, useState } from "react";

const KEY = "rje_alerts";
let ctx = null;

function audio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function beep() {
  const c = audio();
  if (!c) return;

  [0, 0.25, 0.5].forEach((t, i) => {
    const oscillator = c.createOscillator();
    const gain = c.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = i === 2 ? 1175 : 880;

    gain.gain.setValueAtTime(0.0001, c.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + 0.2);

    oscillator.connect(gain);
    gain.connect(c.destination);

    oscillator.start(c.currentTime + t);
    oscillator.stop(c.currentTime + t + 0.22);
  });
}

async function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const registration =
      "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : null;

    if (registration) {
      await registration.showNotification(title, {
        body,
        tag: "rje-new",
        renotify: true,
        vibrate: [300, 120, 300],
      });
    } else {
      new Notification(title, { body, tag: "rje-new" });
    }
  } catch {
    // Notification indisponible dans ce navigateur.
  }
}

export const alertsEnabled = () => localStorage.getItem(KEY) === "1";

export async function enableAlerts() {
  audio();
  beep();
  localStorage.setItem(KEY, "1");

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      // Le son fonctionne même sans service worker.
    }
  }

  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // Permission refusée ou indisponible.
    }
  }
}

export function disableAlerts() {
  localStorage.removeItem(KEY);
}

export function useNewItemsAlert(ids, makeText) {
  const seen = useRef(null);
  const [fresh, setFresh] = useState(0);
  const key = ids ? ids.join(",") : null;

  useEffect(() => {
    const resumeAudio = () => audio();
    window.addEventListener("pointerdown", resumeAudio, { once: true });

    const originalTitle = document.title;
    const onVisible = () => {
      if (!document.hidden) document.title = originalTitle;
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("pointerdown", resumeAudio);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = originalTitle;
    };
  }, []);

  useEffect(() => {
    if (!ids) return;

    // La première réponse sert de référence : pas d'alerte au chargement.
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }

    const added = ids.filter((id) => !seen.current.has(id));
    ids.forEach((id) => seen.current.add(id));

    if (added.length === 0) return;

    setFresh((count) => count + added.length);

    if (!alertsEnabled()) return;

    const message = makeText(added.length);
    beep();

    if ("vibrate" in navigator) {
      navigator.vibrate([300, 120, 300]);
    }

    notify("RasJbal Express", message);

    if (document.hidden) {
      document.title = "🔔 " + message;
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    fresh,
    clear: () => setFresh(0),
  };
}