import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";

const FavoritesContext = createContext({ ids: new Set(), toggle: async () => "ok" });

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const customer = user?.role === "Customer";
  const [ids, setIds] = useState(() => new Set());

  useEffect(() => {
    if (!customer) {
      setIds(new Set());
      return;
    }
    let cancelled = false;
    api.favorites().then((list) => !cancelled && setIds(new Set(list))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer, user?.id]);

  // Retourne "login" si la personne n'est pas connectée en client
  const toggle = useCallback(
    async (merchantId) => {
      if (!customer) return "login";
      const had = ids.has(merchantId);
      const apply = (add) =>
        setIds((s) => {
          const n = new Set(s);
          if (add) n.add(merchantId);
          else n.delete(merchantId);
          return n;
        });
      apply(!had); // réponse immédiate, annulée si le serveur refuse
      try {
        if (had) await api.favoriteRemove(merchantId);
        else await api.favoriteAdd(merchantId);
        return "ok";
      } catch {
        apply(had);
        return "error";
      }
    },
    [customer, ids]
  );

  return <FavoritesContext.Provider value={{ ids, toggle }}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = () => useContext(FavoritesContext);