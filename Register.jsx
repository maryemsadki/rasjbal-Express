import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { isValidPhone, normalizePhone } from "../utils";

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [form, setForm] = useState({ name: "", phone: "", password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/account" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.name.trim().length < 2) return setError("Veuillez saisir votre nom.");
    if (!isValidPhone(form.phone)) return setError("Le numéro doit contenir 8 chiffres.");
    if (form.password.length < 8) return setError("Le mot de passe doit contenir au moins 8 caractères.");
    if (form.password !== form.confirm) return setError("Les mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      await register({ full_name: form.name.trim(), phone: normalizePhone(form.phone), password: form.password });
      navigate(from || "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <section className="hero auth-hero">
        <p className="hero-brand">🏔️ RasJbal Express</p>
        <h1>Créer un compte</h1>
        <p>Quelques secondes pour commencer à commander.</p>
      </section>

      <form onSubmit={submit} className="stack auth-form">
        <label className="field">Nom complet
          <input value={form.name} onChange={set("name")} autoComplete="name" />
        </label>
        <label className="field">Téléphone
          <input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="Ex : 20 123 456" autoComplete="tel" />
        </label>
        <label className="field">Mot de passe (8 caractères minimum)
          <div className="pw">
            <input type={show ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="new-password" />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>{show ? "Masquer" : "Voir"}</button>
          </div>
        </label>
        <label className="field">Confirmer le mot de passe
          <input type={show ? "text" : "password"} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Création…" : "Créer mon compte"}</button>
        <p className="center muted">
          Déjà inscrit ? <Link to="/login" state={{ from }} className="link">Se connecter</Link>
        </p>
      </form>
    </div>
  );
}