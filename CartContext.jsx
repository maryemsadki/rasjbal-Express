import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const EMPTY = { merchant: null, items: [], promo: null };

const toItem = (p) => ({
  product_id: p.product_id,
  name: p.product_name,
  price: p.price,
  qty: 1,
});

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem("rje_cart")) || {}) };
    } catch {
      return EMPTY;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("rje_cart", JSON.stringify(cart));
    } catch {
      /* stockage indisponible */
    }
  }, [cart]);

  // Un seul commerce par panier
  const addItem = (merchant, product) => {
    const shop = { merchant_id: merchant.merchant_id, merchant_name: merchant.merchant_name };
    if (cart.items.length > 0 && cart.merchant?.merchant_id !== merchant.merchant_id) {
      const ok = window.confirm(
        "Votre panier contient des articles d'un autre commerce. Voulez-vous le vider et commencer ici ?"
      );
      if (!ok) return;
      setCart({ merchant: shop, items: [toItem(product)], promo: null });
      return;
    }
    setCart((c) => {
      const exists = c.items.find((i) => i.product_id === product.product_id);
      const items = exists
        ? c.items.map((i) => (i.product_id === product.product_id ? { ...i, qty: i.qty + 1 } : i))
        : [...c.items, toItem(product)];
      return { ...c, merchant: shop, items };
    });
  };

  const changeQty = (productId, delta) =>
    setCart((c) => {
      const items = c.items
        .map((i) => (i.product_id === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0);
      return { merchant: items.length ? c.merchant : null, items, promo: items.length ? c.promo : null };
    });

  const removeItem = (productId) =>
    setCart((c) => {
      const items = c.items.filter((i) => i.product_id !== productId);
      return { merchant: items.length ? c.merchant : null, items, promo: items.length ? c.promo : null };
    });

  const replaceCart = (merchant, items) => setCart({ merchant, items, promo: null });
  const setPromoCode = (code) => setCart((c) => ({ ...c, promo: code || null }));
  const clear = () => setCart(EMPTY);

  const count = cart.items.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        cart, addItem, changeQty, removeItem, replaceCart, clear, count, subtotal,
        promoCode: cart.promo, setPromoCode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);