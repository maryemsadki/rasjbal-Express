from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from delivery import quote
from extras import OrderIn, allergy_text, attach_items, place_text, recipient, rows
from security import require

router = APIRouter()

AI = "COLLATE Latin1_General_CI_AI"  # insensible aux accents et à la casse
CENT = Decimal("0.01")
FIRST_NAME = "LEFT(dr.FullName, CHARINDEX(' ', dr.FullName + ' ') - 1)"


# ---------- Favoris ----------
@router.get("/favorites")
def list_favorites(user=Depends(require("Customer")), db: Session = Depends(get_db)):
    return [r[0] for r in db.execute(
        text("SELECT MerchantID FROM dbo.Favorites WHERE UserID = :u ORDER BY CreatedAt DESC"),
        {"u": user["id"]},
    )]


@router.post("/favorites/{merchant_id}", status_code=201)
def add_favorite(merchant_id: int, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    if not db.execute(text("SELECT 1 FROM dbo.Merchants WHERE MerchantID = :m"), {"m": merchant_id}).first():
        raise HTTPException(404, "Commerce introuvable.")
    try:
        db.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Favorites WHERE UserID = :u AND MerchantID = :m)
                INSERT INTO dbo.Favorites (UserID, MerchantID) VALUES (:u, :m)
        """), {"u": user["id"], "m": merchant_id})
        db.commit()
    except IntegrityError:
        db.rollback()  # déjà en favori
    return {"ok": True}


@router.delete("/favorites/{merchant_id}")
def remove_favorite(merchant_id: int, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM dbo.Favorites WHERE UserID = :u AND MerchantID = :m"),
               {"u": user["id"], "m": merchant_id})
    db.commit()
    return {"ok": True}


# ---------- Recherche intelligente ----------
def like_pattern(q: str) -> str:
    s = q.strip().replace("[", "[[]").replace("%", "[%]").replace("_", "[_]")
    return f"%{s}%"


@router.get("/search")
def search(
    q: str = Query(..., min_length=2, max_length=60),
    max_price: Optional[float] = Query(None, gt=0, le=100000),
    open_only: bool = False,
    db: Session = Depends(get_db),
):
    like = like_pattern(q)
    open_sql = "AND m.IsOpen = 1" if open_only else ""
    merchants = rows(db.execute(text(f"""
        SELECT TOP 10 m.MerchantID AS merchant_id, m.MerchantName AS merchant_name,
               m.Category AS category, m.IsOpen AS is_open
        FROM dbo.Merchants m
        WHERE (m.MerchantName {AI} LIKE :q OR m.Category {AI} LIKE :q) {open_sql}
        ORDER BY m.IsOpen DESC, m.MerchantName
    """), {"q": like}))

    params = {"q": like}
    price_sql = ""
    if max_price is not None:
        price_sql = "AND p.Price <= :mp"
        params["mp"] = max_price
    products = rows(db.execute(text(f"""
        SELECT TOP 30 p.ProductID AS product_id, p.ProductName AS product_name,
               p.Price AS price, p.Category AS category, m.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, m.IsOpen AS is_open
        FROM dbo.Products p
        JOIN dbo.Merchants m ON m.MerchantID = p.MerchantID
        WHERE p.IsAvailable = 1
          AND (p.ProductName {AI} LIKE :q OR p.Category {AI} LIKE :q)
          {price_sql} {open_sql}
        ORDER BY m.IsOpen DESC, p.Price
    """), params))
    return {"merchants": merchants, "products": products}


# ---------- Codes promo ----------
def promo_row(db: Session, code: str, lock: bool = False):
    hint = "WITH (UPDLOCK, HOLDLOCK)" if lock else ""
    return db.execute(text(f"""
        SELECT PromoID, Code, DiscountType, DiscountValue, MinSubtotal, MaxUses, IsActive,
               CASE WHEN ExpiresAt IS NULL OR ExpiresAt > SYSDATETIME() THEN 1 ELSE 0 END AS in_time
        FROM dbo.PromoCodes {hint} WHERE Code = :c
    """), {"c": code}).first()


def compute_promo(db: Session, user_id: int, raw: str, subtotal: Decimal,
                  merchant_discount: Decimal, lock: bool = False):
    """Vérifie le code et calcule la réduction. Retourne (code, réduction)."""
    code = (raw or "").strip().upper()
    row = promo_row(db, code, lock)
    if not row or not row.IsActive:
        raise HTTPException(404, "Code promo invalide.")
    if not row.in_time:
        raise HTTPException(409, "Ce code promo a expiré.")
    if subtotal < row.MinSubtotal:
        minimum = f"{row.MinSubtotal:.3f}".replace(".", ",")
        raise HTTPException(409, f"Ce code demande un minimum de {minimum} DT d'achats.")
    if row.MaxUses is not None:
        used = db.execute(text(
            "SELECT COUNT(*) FROM dbo.Orders WHERE PromoCode = :c AND OrderStatus <> 'Cancelled'"
        ), {"c": row.Code}).scalar()
        if used >= row.MaxUses:
            raise HTTPException(409, "Ce code promo n'est plus disponible.")
    mine = db.execute(text("""
        SELECT COUNT(*) FROM dbo.Orders
        WHERE PromoCode = :c AND CustomerID = :u AND OrderStatus <> 'Cancelled'
    """), {"c": row.Code, "u": user_id}).scalar()
    if mine:
        raise HTTPException(409, "Vous avez déjà utilisé ce code.")

    base = subtotal - merchant_discount
    if row.DiscountType == "percent":
        d = (base * row.DiscountValue / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    else:
        d = row.DiscountValue
    d = max(Decimal("0"), min(d, base))
    return row.Code, d


@router.get("/promo/check")
def promo_check(
    code: str = Query(..., min_length=1, max_length=30),
    merchant_id: int = Query(...),
    subtotal: Decimal = Query(..., gt=0, le=100000),
    user=Depends(require("Customer")),
    db: Session = Depends(get_db),
):
    m = db.execute(text("SELECT ISNULL(PromoPercent, 0) FROM dbo.Merchants WHERE MerchantID = :m"),
                   {"m": merchant_id}).first()
    if not m:
        raise HTTPException(404, "Commerce introuvable.")
    sub = subtotal.quantize(CENT, rounding=ROUND_HALF_UP)
    merchant_discount = (sub * Decimal(m[0]) / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    found, discount = compute_promo(db, user["id"], code, sub, merchant_discount)
    return {"code": found, "discount": discount}


# ---------- Création de commande (avec code promo) ----------
class OrderInPromo(OrderIn):
    promo_code: Optional[str] = Field(default=None, max_length=30)


@router.post("/orders", status_code=201)
def create_order(data: OrderInPromo, user=Depends(require("Customer")), db: Session = Depends(get_db)):
    merchant = db.execute(text("""
        SELECT IsOpen, Address, ISNULL(PromoPercent, 0), Latitude, Longitude
        FROM dbo.Merchants WHERE MerchantID = :m
    """), {"m": data.merchant_id}).first()
    if not merchant:
        raise HTTPException(404, "Commerce introuvable.")
    if not merchant[0]:
        raise HTTPException(409, "Ce commerce est actuellement fermé.")
    if merchant[3] is None:
        raise HTTPException(409, "Ce commerce n'est pas encore disponible à la livraison.")

    # La distance et les frais sont calculés ici, jamais par le navigateur
    km, fee = quote((float(merchant[3]), float(merchant[4])), (data.latitude, data.longitude))
    rname, rphone = recipient(data.recipient_name, data.recipient_phone)
    allergies = allergy_text(data.allergies, data.allergy_note)

    quantities = {}
    for it in data.items:
        quantities[it.product_id] = quantities.get(it.product_id, 0) + it.quantity

    q = text("""
        SELECT ProductID, Price FROM dbo.Products
        WHERE MerchantID = :m AND IsAvailable = 1 AND ProductID IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    prices = {r[0]: r[1] for r in db.execute(q, {"m": data.merchant_id, "ids": list(quantities)})}
    if len(prices) != len(quantities):
        raise HTTPException(409, "Un produit n'est plus disponible. Actualisez votre panier.")

    subtotal = sum(prices[pid] * qty for pid, qty in quantities.items())
    discount = (subtotal * Decimal(merchant[2]) / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    address = place_text(data.address, data.details)
    lat, lng = round(data.latitude, 6), round(data.longitude, 6)

    try:
        promo_code, promo_discount = None, Decimal("0.00")
        if data.promo_code and data.promo_code.strip():
            # Le verrou sur le code empêche deux commandes simultanées de dépasser le nombre d'utilisations
            promo_code, promo_discount = compute_promo(
                db, user["id"], data.promo_code, subtotal, discount, lock=True
            )
        total = subtotal - discount - promo_discount + fee

        order_id = db.execute(text("""
            INSERT INTO dbo.Orders
                (CustomerID, MerchantID, DeliveryAddress, DeliveryNotes, Subtotal, DiscountAmount,
                 PromoCode, PromoDiscount, DeliveryFee, TotalAmount, PaymentMethod,
                 DeliveryLatitude, DeliveryLongitude, DistanceKm, RecipientName, RecipientPhone, Allergies)
            OUTPUT INSERTED.OrderID
            VALUES (:c, :m, :a, :n, :s, :d, :pc, :pd, :f, :t, 'Cash', :lat, :lng, :km, :rn, :rp, :al)
        """), {
            "c": user["id"], "m": data.merchant_id, "a": address, "n": data.notes,
            "s": subtotal, "d": discount, "pc": promo_code, "pd": promo_discount,
            "f": fee, "t": total, "lat": lat, "lng": lng, "km": km,
            "rn": rname, "rp": rphone, "al": allergies,
        }).scalar()
        for pid, qty in quantities.items():
            db.execute(text("""
                INSERT INTO dbo.OrderItems (OrderID, ProductID, Quantity, UnitPrice)
                VALUES (:o, :p, :q, :u)
            """), {"o": order_id, "p": pid, "q": qty, "u": prices[pid]})
        db.execute(text("""
            INSERT INTO dbo.Deliveries
                (OrderID, CustomerID, DeliveryType, PickupAddress, DestinationAddress, DeliveryFee,
                 PickupLatitude, PickupLongitude, DestinationLatitude, DestinationLongitude,
                 RecipientName, RecipientPhone)
            VALUES (:o, :c, 'MerchantOrder', :p, :d, :f, :plat, :plng, :dlat, :dlng, :rn, :rp)
        """), {
            "o": order_id, "c": user["id"], "p": merchant[1], "d": address, "f": fee,
            "plat": merchant[3], "plng": merchant[4], "dlat": lat, "dlng": lng,
            "rn": rname, "rp": rphone,
        })
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Impossible d'enregistrer la commande.")
    return {"order_id": order_id, "subtotal": subtotal, "discount": discount,
            "promo_discount": promo_discount, "delivery_fee": fee,
            "distance_km": km, "total": total}


# ---------- Mes commandes (avec livreur, promo et avis) ----------
@router.get("/orders/mine")
def my_orders(user=Depends(require("Customer")), db: Session = Depends(get_db)):
    orders = rows(db.execute(text(f"""
        SELECT o.OrderID AS order_id, o.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, o.OrderStatus AS status,
               o.OrderDate AS order_date, o.Subtotal AS subtotal,
               o.DiscountAmount AS discount, o.PromoCode AS promo_code,
               o.PromoDiscount AS promo_discount, o.DeliveryFee AS delivery_fee,
               o.TotalAmount AS total, o.DistanceKm AS distance_km,
               o.RecipientName AS recipient_name, o.Allergies AS allergies,
               rv.IsPositive AS review, rv.DriverIsPositive AS driver_review,
               d.DeliveryStatus AS delivery_status, {FIRST_NAME} AS driver_name
        FROM dbo.Orders o
        JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        LEFT JOIN dbo.Deliveries d ON d.OrderID = o.OrderID
        LEFT JOIN dbo.Users dr ON dr.UserID = d.DriverID
        LEFT JOIN dbo.Reviews rv ON rv.OrderID = o.OrderID
        WHERE o.CustomerID = :u
        ORDER BY o.OrderDate DESC
    """), {"u": user["id"]}))
    return attach_items(db, orders)


# ---------- Évaluation : restaurant et livreur ----------
class ReviewBoth(BaseModel):
    positive: bool
    driver_positive: Optional[bool] = None


@router.post("/orders/{order_id}/review", status_code=201)
def review_order(order_id: int, data: ReviewBoth,
                 user=Depends(require("Customer")), db: Session = Depends(get_db)):
    order = db.execute(text("""
        SELECT MerchantID, OrderStatus FROM dbo.Orders
        WHERE OrderID = :o AND CustomerID = :u
    """), {"o": order_id, "u": user["id"]}).first()
    if not order:
        raise HTTPException(404, "Commande introuvable.")
    if order[1] != "Delivered":
        raise HTTPException(409, "Vous pourrez donner votre avis après la livraison.")
    driver_id = db.execute(text(
        "SELECT TOP 1 DriverID FROM dbo.Deliveries WHERE OrderID = :o AND DriverID IS NOT NULL"
    ), {"o": order_id}).scalar()
    if data.driver_positive is not None and driver_id is None:
        raise HTTPException(422, "Aucun livreur à noter pour cette commande.")
    try:
        db.execute(text("""
            INSERT INTO dbo.Reviews (OrderID, CustomerID, MerchantID, IsPositive, DriverID, DriverIsPositive)
            VALUES (:o, :u, :m, :p, :d, :dp)
        """), {"o": order_id, "u": user["id"], "m": order[0], "p": data.positive,
               "d": driver_id, "dp": data.driver_positive})
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Vous avez déjà donné votre avis sur cette commande.")
    return {"ok": True}


# ---------- Admin : équipe avec note des livreurs ----------
@router.get("/admin/users")
def admin_users(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT u.UserID AS id, u.FullName AS full_name, u.Phone AS phone,
               u.UserRole AS role, u.IsActive AS is_active, u.CreatedAt AS created_at,
               (SELECT TOP 1 MerchantName FROM dbo.Merchants WHERE OwnerUserID = u.UserID) AS merchant_name,
               r.total AS rating_count,
               CASE WHEN r.total > 0 THEN CAST(ROUND(100.0 * r.pos / r.total, 0) AS INT) END AS rating_percent
        FROM dbo.Users u
        OUTER APPLY (
            SELECT COUNT(DriverIsPositive) AS total,
                   SUM(CASE WHEN DriverIsPositive = 1 THEN 1 ELSE 0 END) AS pos
            FROM dbo.Reviews WHERE DriverID = u.UserID
        ) r
        WHERE u.UserRole <> 'Customer'
        ORDER BY u.UserRole, u.FullName
    """)))


# ---------- Admin : codes promo ----------
class PromoIn(BaseModel):
    code: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    discount_type: Literal["percent", "amount"]
    value: Decimal = Field(gt=0, le=100000, max_digits=10, decimal_places=2)
    min_subtotal: Decimal = Field(default=Decimal("0"), ge=0, le=100000, max_digits=10, decimal_places=2)
    max_uses: Optional[int] = Field(default=None, ge=1, le=1000000)
    expires_at: Optional[date] = None


class PromoPatch(BaseModel):
    is_active: bool


@router.get("/admin/promos")
def admin_promos(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT p.PromoID AS promo_id, p.Code AS code, p.DiscountType AS discount_type,
               p.DiscountValue AS value, p.MinSubtotal AS min_subtotal, p.MaxUses AS max_uses,
               p.ExpiresAt AS expires_at, p.IsActive AS is_active,
               CASE WHEN p.ExpiresAt IS NOT NULL AND p.ExpiresAt <= SYSDATETIME() THEN 1 ELSE 0 END AS expired,
               ISNULL(u.uses, 0) AS uses, ISNULL(u.given, 0) AS given
        FROM dbo.PromoCodes p
        OUTER APPLY (
            SELECT COUNT(*) AS uses, SUM(o.PromoDiscount) AS given
            FROM dbo.Orders o WHERE o.PromoCode = p.Code AND o.OrderStatus <> 'Cancelled'
        ) u
        ORDER BY p.PromoID DESC
    """)))


@router.post("/admin/promos", status_code=201)
def admin_promo_add(data: PromoIn, user=Depends(require("Admin")), db: Session = Depends(get_db)):
    if data.discount_type == "percent" and data.value > 70:
        raise HTTPException(422, "Une réduction en pourcentage ne peut pas dépasser 70 %.")
    expires = datetime.combine(data.expires_at, time(23, 59, 59)) if data.expires_at else None
    try:
        pid = db.execute(text("""
            INSERT INTO dbo.PromoCodes (Code, DiscountType, DiscountValue, MinSubtotal, MaxUses, ExpiresAt)
            OUTPUT INSERTED.PromoID VALUES (:c, :t, :v, :mn, :mx, :e)
        """), {"c": data.code.upper(), "t": data.discount_type, "v": data.value,
               "mn": data.min_subtotal, "mx": data.max_uses, "e": expires}).scalar()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ce code existe déjà.")
    return {"promo_id": pid}


@router.patch("/admin/promos/{promo_id}")
def admin_promo_update(promo_id: int, data: PromoPatch,
                       user=Depends(require("Admin")), db: Session = Depends(get_db)):
    res = db.execute(text("UPDATE dbo.PromoCodes SET IsActive = :a WHERE PromoID = :i"),
                     {"a": data.is_active, "i": promo_id})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(404, "Code introuvable.")
    db.commit()
    return {"ok": True}