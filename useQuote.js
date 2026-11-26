import { api } from "./api";
import { useFetch } from "./hooks";

export function useQuote(merchantId, address) {
  return useFetch(
    () =>
      merchantId && address
        ? api.quote({ merchant_id: merchantId, lat: address.lat, lng: address.lng })
        : Promise.resolve(null),
    [merchantId, address?.lat, address?.lng]
  );
}