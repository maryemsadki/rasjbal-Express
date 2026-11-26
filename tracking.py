from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from extras import DELIVERY_COLS, attach_items, rows
from security import require

router = APIRouter()

ORDER_STATUSES = ["Pending", "Confirmed", "Preparing", "Ready", "Delivering", "Delivered", "Cancelled"]
DELIVERY_STATUSES = ["Pending", "Assigned", "PickedUp", "Delivered", "Cancelled"]

# Prénom seulement : le client voit « Ahmed », pas le nom complet
FIRST_NAME = "LEFT(dr.FullName, CHARINDEX(' ', dr.FullName + ' ') - 1)"


# ---------- Client : suivi avec le livreur ----------
@router.get("/orders/mine")
def my_orders(user=Depends(require("Customer")), db: Session = Depends(get_db)):
    orders = rows(db.execute(text(f"""
        SELECT o.OrderID AS order_id, o.MerchantID AS merchant_id,
               m.MerchantName AS merchant_name, o.OrderStatus AS status,
               o.OrderDate AS order_date, o.Subtotal AS subtotal,
               o.DiscountAmount AS discount, o.DeliveryFee AS delivery_fee,
               o.TotalAmount AS total, o.DistanceKm AS distance_km,
               o.RecipientName AS recipient_name, o.Allergies AS allergies,
               (SELECT TOP 1 IsPositive FROM dbo.Reviews rv WHERE rv.OrderID = o.OrderID) AS review,
               d.DeliveryStatus AS delivery_status,
               {FIRST_NAME} AS driver_name
        FROM dbo.Orders o
        JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        LEFT JOIN dbo.Deliveries d ON d.OrderID = o.OrderID
        LEFT JOIN dbo.Users dr ON dr.UserID = d.DriverID
        WHERE o.CustomerID = :u
        ORDER BY o.OrderDate DESC
    """), {"u": user["id"]}))
    return attach_items(db, orders)


@router.get("/deliveries/mine")
def my_deliveries(user=Depends(require("Customer")), db: Session = Depends(get_db)):
    return rows(db.execute(text(f"""
        SELECT d.DeliveryID AS delivery_id, d.PickupAddress AS pickup_address,
               d.DestinationAddress AS destination_address,
               d.PackageDescription AS package_description,
               d.DeliveryStatus AS status, d.DeliveryFee AS fee, d.RequestedAt AS requested_at,
               {FIRST_NAME} AS driver_name
        FROM dbo.Deliveries d
        LEFT JOIN dbo.Users dr ON dr.UserID = d.DriverID
        WHERE d.CustomerID = :u AND d.DeliveryType = 'OnDemand'
        ORDER BY d.RequestedAt DESC
    """), {"u": user["id"]}))


# ---------- Livreur ----------
@router.get("/driver/deliveries/mine")
def driver_mine(user=Depends(require("Driver")), db: Session = Depends(get_db)):
    return rows(db.execute(text(f"""
        SELECT {DELIVERY_COLS},
               CASE WHEN m.OwnerUserID IS NULL THEN 0 ELSE 1 END AS merchant_managed,
               COALESCE(d.RecipientName, u.FullName) AS customer_name,
               COALESCE(d.RecipientPhone, u.Phone) AS customer_phone,
               CASE WHEN d.RecipientName IS NULL THEN 0 ELSE 1 END AS for_someone_else
        FROM dbo.Deliveries d
        JOIN dbo.Users u ON u.UserID = d.CustomerID
        LEFT JOIN dbo.Orders o ON o.OrderID = d.OrderID
        LEFT JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        WHERE d.DriverID = :d
          AND (d.DeliveryStatus IN ('Assigned', 'PickedUp')
               OR d.DeliveredAt >= DATEADD(day, -1, SYSDATETIME())
               OR (d.DeliveryStatus = 'Cancelled' AND d.AssignedAt >= DATEADD(hour, -2, SYSDATETIME())))
        ORDER BY d.RequestedAt DESC
    """), {"d": user["id"]}))


@router.post("/driver/deliveries/{delivery_id}/pickup")
def driver_pickup(delivery_id: int, user=Depends(require("Driver")), db: Session = Depends(get_db)):
    # Départ en livraison : la commande doit être « Prête », sauf si le commerce
    # n'a pas de compte (personne ne peut alors la marquer prête).
    res = db.execute(text("""
        UPDATE dbo.Deliveries SET DeliveryStatus = 'PickedUp', PickedUpAt = SYSDATETIME()
        WHERE DeliveryID = :i AND DriverID = :d AND DeliveryStatus = 'Assigned'
          AND (DeliveryType = 'OnDemand'
               OR OrderID IN (SELECT o.OrderID FROM dbo.Orders o
                              JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
                              WHERE o.OrderStatus = 'Ready' OR m.OwnerUserID IS NULL))
    """), {"i": delivery_id, "d": user["id"]})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(409, "La commande n'est pas encore prête chez le commerçant.")
    db.execute(text("""
        UPDATE dbo.Orders SET OrderStatus = 'Delivering'
        WHERE OrderID = (SELECT OrderID FROM dbo.Deliveries WHERE DeliveryID = :i)
          AND OrderStatus NOT IN ('Delivered', 'Cancelled')
    """), {"i": delivery_id})
    db.commit()
    return {"ok": True}


# ---------- Admin : commandes ----------
@router.get("/admin/orders")
def admin_orders(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    orders = rows(db.execute(text("""
        SELECT TOP 200 o.OrderID AS order_id, m.MerchantName AS merchant_name,
               u.FullName AS customer_name, u.Phone AS customer_phone,
               o.DeliveryAddress AS address,
               ISNULL(CAST(o.DistanceKm AS VARCHAR(10)) + ' km', '') AS zone,
               o.Allergies AS allergies, o.RecipientName AS recipient_name,
               o.RecipientPhone AS recipient_phone,
               o.OrderStatus AS status, o.OrderDate AS order_date, o.TotalAmount AS total,
               d.DeliveryStatus AS delivery_status,
               dr.FullName AS driver_name, dr.Phone AS driver_phone
        FROM dbo.Orders o
        JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        JOIN dbo.Users u ON u.UserID = o.CustomerID
        LEFT JOIN dbo.Deliveries d ON d.OrderID = o.OrderID
        LEFT JOIN dbo.Users dr ON dr.UserID = d.DriverID
        ORDER BY o.OrderDate DESC
    """)))
    return attach_items(db, orders)


class StatusIn(BaseModel):
    status: str


@router.patch("/admin/orders/{order_id}/status")
def admin_order_status(order_id: int, data: StatusIn,
                       user=Depends(require("Admin")), db: Session = Depends(get_db)):
    if data.status not in ORDER_STATUSES:
        raise HTTPException(422, "Statut invalide.")
    if not db.execute(text("SELECT 1 FROM dbo.Orders WHERE OrderID = :o"), {"o": order_id}).first():
        raise HTTPException(404, "Commande introuvable.")
    db.execute(text("UPDATE dbo.Orders SET OrderStatus = :s WHERE OrderID = :o"),
               {"s": data.status, "o": order_id})
    # La livraison suit la commande
    if data.status == "Cancelled":
        db.execute(text("""
            UPDATE dbo.Deliveries SET DeliveryStatus = 'Cancelled'
            WHERE OrderID = :o AND DeliveryStatus <> 'Delivered'
        """), {"o": order_id})
    elif data.status == "Delivered":
        db.execute(text("""
            UPDATE dbo.Deliveries
            SET DeliveryStatus = 'Delivered', DeliveredAt = ISNULL(DeliveredAt, SYSDATETIME())
            WHERE OrderID = :o AND DeliveryStatus <> 'Cancelled'
        """), {"o": order_id})
    elif data.status == "Delivering":
        db.execute(text("""
            UPDATE dbo.Deliveries
            SET DeliveryStatus = 'PickedUp', PickedUpAt = ISNULL(PickedUpAt, SYSDATETIME())
            WHERE OrderID = :o AND DeliveryStatus = 'Assigned'
        """), {"o": order_id})
    db.commit()
    return {"order_id": order_id, "status": data.status}


# ---------- Admin : livraisons (commerce et à la demande) ----------
@router.get("/admin/deliveries")
def admin_deliveries(user=Depends(require("Admin")), db: Session = Depends(get_db)):
    return rows(db.execute(text("""
        SELECT TOP 200 d.DeliveryID AS delivery_id, d.DeliveryType AS delivery_type,
               d.DeliveryStatus AS status, d.PickupAddress AS pickup_address,
               d.DestinationAddress AS destination_address,
               d.PackageDescription AS package_description, d.DeliveryFee AS fee,
               d.RequestedAt AS requested_at, d.AssignedAt AS assigned_at,
               d.PickedUpAt AS picked_up_at, d.DeliveredAt AS delivered_at,
               d.DriverID AS driver_id, dr.FullName AS driver_name, dr.Phone AS driver_phone,
               u.FullName AS customer_name, u.Phone AS customer_phone,
               d.RecipientName AS recipient_name, d.RecipientPhone AS recipient_phone,
               d.OrderID AS order_id, m.MerchantName AS merchant_name
        FROM dbo.Deliveries d
        JOIN dbo.Users u ON u.UserID = d.CustomerID
        LEFT JOIN dbo.Users dr ON dr.UserID = d.DriverID
        LEFT JOIN dbo.Orders o ON o.OrderID = d.OrderID
        LEFT JOIN dbo.Merchants m ON m.MerchantID = o.MerchantID
        ORDER BY d.RequestedAt DESC
    """)))


class AssignIn(BaseModel):
    driver_id: int


@router.post("/admin/deliveries/{delivery_id}/assign")
def admin_assign(delivery_id: int, data: AssignIn,
                 user=Depends(require("Admin")), db: Session = Depends(get_db)):
    driver = db.execute(text("""
        SELECT 1 FROM dbo.Users WHERE UserID = :d AND UserRole = 'Driver' AND IsActive = 1
    """), {"d": data.driver_id}).first()
    if not driver:
        raise HTTPException(404, "Livreur introuvable ou désactivé.")
    res = db.execute(text("""
        UPDATE dbo.Deliveries
        SET DriverID = :d, DeliveryStatus = 'Assigned', AssignedAt = SYSDATETIME()
        WHERE DeliveryID = :i AND DeliveryStatus IN ('Pending', 'Assigned')
    """), {"d": data.driver_id, "i": delivery_id})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(409, "Cette livraison ne peut plus être assignée.")
    db.commit()
    return {"ok": True}


@router.patch("/admin/deliveries/{delivery_id}/status")
def admin_delivery_status(delivery_id: int, data: StatusIn,
                          user=Depends(require("Admin")), db: Session = Depends(get_db)):
    if data.status not in DELIVERY_STATUSES:
        raise HTTPException(422, "Statut invalide.")
    row = db.execute(text("SELECT DriverID FROM dbo.Deliveries WHERE DeliveryID = :i"),
                     {"i": delivery_id}).first()
    if not row:
        raise HTTPException(404, "Livraison introuvable.")
    if data.status in ("Assigned", "PickedUp", "Delivered") and row[0] is None:
        raise HTTPException(409, "Assignez d'abord un livreur.")

    if data.status == "Pending":
        sql = """UPDATE dbo.Deliveries SET DeliveryStatus = 'Pending', DriverID = NULL,
                 AssignedAt = NULL, PickedUpAt = NULL, DeliveredAt = NULL WHERE DeliveryID = :i"""
    elif data.status == "Assigned":
        sql = """UPDATE dbo.Deliveries SET DeliveryStatus = 'Assigned',
                 AssignedAt = ISNULL(AssignedAt, SYSDATETIME()) WHERE DeliveryID = :i"""
    elif data.status == "PickedUp":
        sql = """UPDATE dbo.Deliveries SET DeliveryStatus = 'PickedUp',
                 PickedUpAt = ISNULL(PickedUpAt, SYSDATETIME()) WHERE DeliveryID = :i"""
    elif data.status == "Delivered":
        sql = """UPDATE dbo.Deliveries SET DeliveryStatus = 'Delivered',
                 DeliveredAt = ISNULL(DeliveredAt, SYSDATETIME()) WHERE DeliveryID = :i"""
    else:
        sql = "UPDATE dbo.Deliveries SET DeliveryStatus = 'Cancelled' WHERE DeliveryID = :i"
    db.execute(text(sql), {"i": delivery_id})

    # La commande liée suit la livraison
    order_sql = {
        "PickedUp": "UPDATE dbo.Orders SET OrderStatus = 'Delivering' "
                    "WHERE OrderID = (SELECT OrderID FROM dbo.Deliveries WHERE DeliveryID = :i) "
                    "AND OrderStatus NOT IN ('Delivered', 'Cancelled')",
        "Delivered": "UPDATE dbo.Orders SET OrderStatus = 'Delivered' "
                     "WHERE OrderID = (SELECT OrderID FROM dbo.Deliveries WHERE DeliveryID = :i) "
                     "AND OrderStatus <> 'Cancelled'",
        "Cancelled": "UPDATE dbo.Orders SET OrderStatus = 'Cancelled' "
                     "WHERE OrderID = (SELECT OrderID FROM dbo.Deliveries WHERE DeliveryID = :i) "
                     "AND OrderStatus <> 'Delivered'",
    }.get(data.status)
    if order_sql:
        db.execute(text(order_sql), {"i": delivery_id})
    db.commit()
    return {"ok": True}