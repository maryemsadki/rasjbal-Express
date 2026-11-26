import { api } from "./api";
import { useCart } from "./CartContext";
import { useFetch } from "./hooks";

// Recalcule la réduction du code chaque fois que le panier change
export function usePromo(merchantId, subtotal) {
  const { promoCode } = useCart();
  const res = useFetch(
    () =>
      promoCode && merchantId && subtotal > 0
        ? api.promoCheck({ code: promoCode, merchant_id: merchantId, subtotal: subtotal.toFixed(2) })
        : Promise.resolve(null),
    [promoCode, merchantId, subtotal.toFixed(2)]
  );
  return {
    code: promoCode,
    discount: promoCode && !res.error ? Number(res.data?.discount || 0) : 0,
    error: promoCode ? res.error : null,
    loading: promoCode ? res.loading : false,
  };
}