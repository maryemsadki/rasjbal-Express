import { NavLink } from "react-router-dom";
import { useCart } from "../CartContext";
import { useAuth } from "../AuthContext";

const CUSTOMER_TABS = [
  { to: "/", icon: "🏠", label: "Accueil", end: true },
  { to: "/merchants", icon: "🏪", label: "Commerces" },
  { to: "/cart", icon: "🛍️", label: "Panier", cart: true },
  { to: "/orders", icon: "📦", label: "Commandes" },
  { to: "/account", icon: "👤", label: "Profil" },
];

const STAFF_TABS = {
  Admin: [{ to: "/admin", icon: "📊", label: "Gestion" }],
  Merchant: [{ to: "/merchant-space", icon: "🏪", label: "Mon commerce" }],
  Driver: [{ to: "/driver", icon: "🛵", label: "Livraisons" }],
};

export default function BottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const tabs =
    user && STAFF_TABS[user.role]
      ? [...STAFF_TABS[user.role], { to: "/account", icon: "👤", label: "Profil" }]
      : CUSTOMER_TABS;

  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => "tab" + (isActive ? " active" : "")}>
          <span className="tab-icon">
            {t.icon}
            {t.cart && count > 0 && <b className="dot">{count}</b>}
          </span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}