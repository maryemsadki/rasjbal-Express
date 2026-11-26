import math
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

# Tarifs de démonstration : à définir selon vos coûts réels et vos livreurs
BASE_FEE = Decimal("1.50")     # prix de départ
INCLUDED_KM = Decimal("1.5")   # distance comprise dans le prix de départ
PER_KM = Decimal("0.80")       # prix par km supplémentaire
MAX_KM = Decimal("12")         # distance maximale de livraison
ROAD_FACTOR = 1.3              # la route est plus longue que la ligne droite


def check_point(lat: float, lng: float):
    if not (30.0 <= lat <= 37.6 and 7.4 <= lng <= 11.7):
        raise HTTPException(422, "Cette position est en dehors de la Tunisie.")


def km_between(lat1, lng1, lat2, lng2) -> Decimal:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    straight = 2 * r * math.asin(math.sqrt(a))
    return Decimal(str(straight * ROAD_FACTOR)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def fee_for(km: Decimal) -> Decimal:
    extra = max(Decimal("0"), km - INCLUDED_KM)
    raw = BASE_FEE + extra * PER_KM
    tenth = (raw * 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 10
    return tenth.quantize(Decimal("0.01"))


def quote(origin: tuple, dest: tuple):
    check_point(*origin)
    check_point(*dest)
    km = km_between(*origin, *dest)
    if km > MAX_KM:
        raise HTTPException(422, f"Adresse trop éloignée (maximum {MAX_KM} km).")
    return km, fee_for(km)