import { useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useFetch, usePolling } from "../hooks";
import { DELIVERY_LABELS, fmt, fmtDate, ORDER_LABELS } from "../utils";
import AddressPicker from "../components/AddressPicker";
import AdminDeliveries from "../components/AdminDeliveries";
import AdminCategories from "../admin/AdminCategories";
import AdminImport from "../admin/AdminImport";
import AdminProducts from "../admin/AdminProducts";
import AdminPromos from "../admin/AdminPromos";
import { Head } from "../admin/ui";
import { Empty, ErrorBox, Loading } from "../components/StateViews";

const STATUSES = Object.keys(ORDER_LABELS);
const ROLE_LABEL = { Merchant: "Commerçant", Driver: "Livreur", Admin: "Admin" };

const NAV = [
  ["/admin", "📊", "Tableau de bord", true],
  ["/admin/merchants", "🏪", "Commerces"],
  ["/admin/products", "🍔", "Produits"],
  ["/admin/categories", "📂", "Catégories"],
  ["/admin/import", "📥", "Importation"],
  ["/admin/orders", "📦", "Commandes"],
  ["/admin/deliveries", "🛵", "Livraisons"],
  ["/admin/promos", "🏷️", "Promotions"],
  ["/admin/users", "👥", "Utilisateurs"],
];

/* ---------- Tableau de bord ---------- */
function Overview() {
  const { data, error, loading, reload } = usePolling(api.aStats, 15000);

  let body = null;

  if (loading) {
    body = <Loading />;
  } else if (error) {
    body = <ErrorBox message={error} onRetry={reload} />;
  } else {
    const s = data.orders_by_status;

    const cards = [
      ["🧾", "Commandes", data.orders_total],
      ["🆕", "À traiter", s.Pending],
      ["🔥", "En cours", s.Confirmed + s.Preparing + s.Ready + s.Delivering],
      ["✅", "Livrées", s.Delivered],
      ["💰", "Encaissé (livré)", fmt(data.revenue)],
      ["👥", "Clients", data.customers],
      ["🏪", "Commerces", data.merchants],
      ["🛵", "Livreurs actifs", data.drivers],
      ["📦", "Livraisons en attente", data.pending_deliveries],
    ];

    body = (
      <div className="stats-grid wide-stats">
        {cards.map(([icon, label, value]) => (
          <div key={label} className="card stat">
            <span className="stat-icon">{icon}</span>
            <strong>{value}</strong>
            <span className="muted small">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Head title="Tableau de bord" subtitle="Vue d'ensemble de RasJbal Express" />
      {body}
    </>
  );
}

/* ---------- Commandes ---------- */
function AdminOrders() {
  const { data, error, loading, reload, refresh } = usePolling(api.aOrders, 8000);
  const [filter, setFilter] = useState("Tous");

  const change = async (id, status) => {
    try {
      await api.aOrderStatus(id, status);
    } catch (e) {
      alert(e.message);
    }

    refresh();
  };

  const list = (data || []).filter(
    (o) => filter === "Tous" || o.status === filter
  );

  return (
    <>
      <Head
        title="Commandes"
        subtitle="Suivi en direct, mise à jour toutes les 8 secondes"
      />

      <div className="chips">
        {["Tous", ...STATUSES].map((s) => (
          <button
            key={s}
            className={"chip" + (filter === s ? " active" : "")}
            onClick={() => setFilter(s)}
          >
            {s === "Tous" ? "Tous" : ORDER_LABELS[s]}
          </button>
        ))}
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && list.length === 0 && (
        <Empty icon="🧾" title="Aucune commande" />
      )}

      <div className="stack cols">
        {list.map((o) => (
          <div key={o.order_id} className="card order">
            <div className="row-between">
              <h3>n°{o.order_id} · {o.merchant_name}</h3>
              <strong>{fmt(o.total)}</strong>
            </div>

            <p className="small">
              👤 {o.customer_name} · 📞 {o.customer_phone}
            </p>

            <p className="small">
              📍 {o.address}{o.zone ? ` (${o.zone})` : ""}
            </p>

            {o.allergies && (
              <p className="small">⚠️ Allergies : {o.allergies}</p>
            )}

            {o.recipient_name && (
              <p className="small">
                🎁 Pour : {o.recipient_name} · {o.recipient_phone}
              </p>
            )}

            {o.driver_name ? (
              <p className="driver-line">
                🛵 <b>{o.driver_name}</b> · 📞 {o.driver_phone} ·{" "}
                {DELIVERY_LABELS[o.delivery_status]}
              </p>
            ) : (
              <p className="muted small">🛵 Pas encore de livreur</p>
            )}

            <p className="muted small">
              {fmtDate(o.order_date)} ·{" "}
              {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
            </p>

            <select
              className="select"
              value={o.status}
              onChange={(e) => change(o.order_id, e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Commerces ---------- */
function AdminMerchants() {
  const { data, error, loading, reload } = useFetch(api.aMerchants);

  const [form, setForm] = useState({
    name: "",
    category: "",
    address: "",
    phone: "",
  });

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    setMsg("");
    setBusy(true);

    try {
      await api.aMerchantAdd({
        merchant_name: form.name,
        category: form.category,
        address: form.address,
        phone: form.phone,
      });

      setForm({
        name: "",
        category: "",
        address: "",
        phone: "",
      });

      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (m) => {
    try {
      await api.aMerchantUpdate(m.merchant_id, {
        is_open: !m.is_open,
      });

      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <Head
        title="Commerces"
        subtitle="Restaurants et magasins de la plateforme"
      />

      <form onSubmit={add} className="card stack">
        <h3>Nouveau commerce</h3>

        <input
          className="input"
          placeholder="Nom du commerce"
          value={form.name}
          onChange={set("name")}
        />

        <input
          className="input"
          placeholder="Catégorie (Restaurant, Pâtisserie, Épicerie…)"
          value={form.category}
          onChange={set("category")}
        />

        <input
          className="input"
          placeholder="Adresse"
          value={form.address}
          onChange={set("address")}
        />

        <input
          className="input"
          placeholder="Téléphone (8 chiffres)"
          value={form.phone}
          onChange={set("phone")}
          inputMode="tel"
        />

        {msg && <div className="alert">{msg}</div>}

        <button className="btn btn-primary" disabled={busy}>
          Créer le commerce
        </button>
      </form>

      <h2 className="section-title">Liste des commerces</h2>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      <div className="stack cols">
        {data?.map((m) => (
          <div key={m.merchant_id} className="card product">
            <div className="product-info">
              <h3>{m.merchant_name}</h3>

              <p className="muted small">
                {m.category} · {m.address}
              </p>

              <p className="small">
                {m.owner_name
                  ? `🔑 Compte : ${m.owner_name}`
                  : "⚠️ Aucun compte commerçant"}
              </p>

              <button
                type="button"
                className="link"
                style={{ textAlign: "left" }}
                onClick={() => setPick(m)}
              >
                {m.has_location
                  ? "📍 Modifier la position"
                  : "⚠️ Définir la position (obligatoire)"}
              </button>
            </div>

            <button
              className={
                "btn btn-small " +
                (m.is_open ? "btn-outline" : "btn-primary")
              }
              onClick={() => toggle(m)}
            >
              {m.is_open ? "Fermer" : "Ouvrir"}
            </button>
          </div>
        ))}
      </div>

      {pick && (
        <AddressPicker
          simple
          title={`Position de ${pick.merchant_name}`}
          onClose={() => setPick(null)}
          onSave={async (a) => {
            try {
              await api.aMerchantLocation(pick.merchant_id, {
                latitude: a.lat,
                longitude: a.lng,
                address: a.line,
              });

              setPick(null);
              reload();
            } catch (e) {
              alert(e.message);
            }
          }}
        />
      )}
    </>
  );
}

/* ---------- Utilisateurs : équipe et clients ---------- */
function AdminTeam() {
  const users = useFetch(api.aUsers);
  const merchants = useFetch(api.aMerchants);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    role: "Driver",
    merchant_id: "",
  });

  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.value });

  const free = (merchants.data || []).filter((m) => !m.owner_name);

  const add = async (e) => {
    e.preventDefault();
    setMsg("");
    setOk("");

    if (form.role === "Merchant" && !form.merchant_id) {
      return setMsg("Choisissez le commerce.");
    }

    setBusy(true);

    try {
      await api.aUserAdd({
        full_name: form.name,
        phone: form.phone,
        password: form.password,
        role: form.role,
        merchant_id:
          form.role === "Merchant" ? Number(form.merchant_id) : null,
      });

      setOk(
        `✅ Compte ${ROLE_LABEL[form.role].toLowerCase()} créé pour ${form.name}. ` +
          "Il se connecte avec son numéro de téléphone et le mot de passe que vous venez de choisir."
      );

      setForm({
        name: "",
        phone: "",
        password: "",
        role: form.role,
        merchant_id: "",
      });

      users.reload();
      merchants.reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (u) => {
    try {
      await api.aUserUpdate(u.id, {
        is_active: !u.is_active,
      });

      users.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <form onSubmit={add} className="card stack">
        <h3>Créer un compte professionnel</h3>

        <select
          className="select"
          value={form.role}
          onChange={set("role")}
        >
          <option value="Driver">Livreur</option>
          <option value="Merchant">Commerçant</option>
        </select>

        {form.role === "Merchant" && (
          <select
            className="select"
            value={form.merchant_id}
            onChange={set("merchant_id")}
          >
            <option value="">— Commerce sans compte —</option>

            {free.map((m) => (
              <option key={m.merchant_id} value={m.merchant_id}>
                {m.merchant_name}
              </option>
            ))}
          </select>
        )}

        <input
          className="input"
          placeholder="Nom complet"
          value={form.name}
          onChange={set("name")}
        />

        <input
          className="input"
          placeholder="Téléphone (8 chiffres)"
          value={form.phone}
          onChange={set("phone")}
          inputMode="tel"
        />

        <input
          className="input"
          type="password"
          placeholder="Mot de passe (8 caractères minimum)"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
        />

        {msg && <div className="alert">{msg}</div>}
        {ok && <div className="success">{ok}</div>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Création…" : "Créer le compte"}
        </button>
      </form>

      <h2 className="section-title">
        Équipe (livreurs et commerçants)
      </h2>

      {users.loading && <Loading />}
      {users.error && (
        <ErrorBox message={users.error} onRetry={users.reload} />
      )}

      <div className="stack cols">
        {users.data?.map((u) => (
          <div
            key={u.id}
            className={"card product" + (u.is_active ? "" : " off")}
          >
            <div className="product-info">
              <h3>{u.full_name}</h3>

              <p className="muted small">
                {ROLE_LABEL[u.role]} · 📞 {u.phone}
                {u.merchant_name ? ` · ${u.merchant_name}` : ""}
              </p>

              {/* Note et nombre d'avis du livreur */}
              {u.role === "Driver" && u.rating_percent != null && (
                <p className="small">
                  👍 {u.rating_percent}% ({u.rating_count} avis)
                </p>
              )}
            </div>

            <button
              className={
                "btn btn-small " +
                (u.is_active ? "btn-outline" : "btn-primary")
              }
              onClick={() => toggle(u)}
            >
              {u.is_active ? "Désactiver" : "Activer"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Clients ---------- */
function AdminCustomers() {
  const { data, error, loading, reload } = useFetch(api.aCustomers);

  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const list = (data || []).filter(
    (c) =>
      !needle ||
      c.full_name.toLowerCase().includes(needle) ||
      c.phone.includes(needle)
  );

  const toggle = async (c) => {
    try {
      await api.aUserUpdate(c.id, {
        is_active: !c.is_active,
      });

      reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <>
      <h2 className="section-title">
        Clients ({data?.length ?? 0})
      </h2>

      <div className="toolbar">
        <input
          className="input"
          placeholder="🔍 Nom ou téléphone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Commandes</th>
                <th>Inscrit le</th>
                <th>Compte</th>
              </tr>
            </thead>

            <tbody>
              {list.map((c) => (
                <tr
                  key={c.id}
                  className={c.is_active ? "" : "off"}
                >
                  <td><strong>{c.full_name}</strong></td>
                  <td>{c.phone}</td>
                  <td>{c.orders}</td>
                  <td>{fmtDate(c.created_at)}</td>
                  <td>
                    <button
                      className={
                        "btn btn-small " +
                        (c.is_active ? "btn-outline" : "btn-primary")
                      }
                      onClick={() => toggle(c)}
                    >
                      {c.is_active ? "Désactiver" : "Activer"}
                    </button>
                  </td>
                </tr>
              ))}

              {list.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="muted center"
                    style={{ padding: 24 }}
                  >
                    Aucun client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Utilisateurs ---------- */
function AdminUsers() {
  return (
    <>
      <Head
        title="Utilisateurs"
        subtitle="Livreurs, commerçants et clients"
      />
      <AdminTeam />
      <AdminCustomers />
    </>
  );
}

/* ---------- Mise en page : barre latérale + contenu ---------- */
export default function AdminDashboard() {
  const { logout } = useAuth();

  const stats = usePolling(api.aStats, 15000);
  const pending = stats.data?.orders_by_status?.Pending || 0;

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          🏔️ RasJbal Express
          <small>Administration</small>
        </div>

        {NAV.map(([to, icon, label, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              "adm-link" + (isActive ? " active" : "")
            }
          >
            <span>{icon}</span>
            <span>{label}</span>

            {to === "/admin/orders" && pending > 0 && (
              <b className="adm-count">{pending}</b>
            )}
          </NavLink>
        ))}

        <div className="adm-spacer" />

        <Link to="/" className="adm-link">
          <span>🌐</span>
          <span>Voir le site</span>
        </Link>

        <button className="adm-link" onClick={logout}>
          <span>🚪</span>
          <span>Déconnexion</span>
        </button>
      </aside>

      <main className="adm-main">
        <Routes>
          <Route index element={<Overview />} />

          <Route path="merchants" element={<AdminMerchants />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="import" element={<AdminImport />} />
          <Route path="orders" element={<AdminOrders />} />

          <Route
            path="deliveries"
            element={
              <>
                <Head
                  title="Livraisons"
                  subtitle="Commandes de commerces et livraisons à la demande"
                />
                <AdminDeliveries />
              </>
            }
          />

          {/* Nouvelle page Promotions */}
          <Route path="promos" element={<AdminPromos />} />

          <Route path="users" element={<AdminUsers />} />

          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
    </div>
  );
}