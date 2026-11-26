import { useNavigate } from "react-router-dom";
import { useFavorites } from "../FavoritesContext";

export default function HeartButton({ merchantId }) {
  const { ids, toggle } = useFavorites();
  const navigate = useNavigate();
  const on = ids.has(merchantId);

  const click = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = await toggle(merchantId);
    if (r === "login") navigate("/login", { state: { from: "/merchants" } });
  };

  return (
    <button
      type="button"
      className={"heart" + (on ? " on" : "")}
      onClick={click}
      aria-pressed={on}
      aria-label={on ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      {on ? "♥" : "♡"}
    </button>
  );
}