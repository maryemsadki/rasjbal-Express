
import re
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from extras import router as extras_router
from admin_tools import router as admin_tools_router
from merchant_tools import router as merchant_tools_router
from client_features import router as client_router

from security import (
    check_rate,
    clear_fails,
    create_token,
    hash_password,
    register_fail,
    require,
    require_merchant,
    verify_password,
)

from tracking import router as tracking_router


app = FastAPI(
    title="RasJbal Express API",
    description="API de la plateforme de livraison",
    version="3.1.0",
)


# ---------- Configuration CORS ----------
# Développement : localhost, 127.0.0.1 et réseau Wi-Fi local

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Routeurs ----------
# IMPORTANT : l'ordre compte.
# client_router remplace certaines routes de tracking et extras.
# tracking doit passer avant extras.

app.include_router(client_router)
app.include_router(tracking_router)
app.include_router(extras_router)
app.include_router(admin_tools_router)
app.include_router(merchant_tools_router)


# ---------- Fichiers uploadés ----------

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# ---------- Constantes ----------

ORDER_STATUSES = [
    "Pending",
    "Confirmed",
    "Preparing",
    "Ready",
    "Delivering",
    "Delivered",
    "Cancelled",
]

MERCHANT_FLOW = {
    "Pending": ["Confirmed", "Cancelled"],
    "Confirmed": ["Preparing", "Cancelled"],
    "Preparing": ["Ready"],
}


# ---------- Utilitaires ----------

def clean_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")

    if digits.startswith("216") and len(digits) == 11:
        digits = digits[3:]

    if not re.fullmatch(r"\d{8}", digits):
        raise HTTPException(
            422,
            "Numéro de téléphone invalide (8 chiffres)."
        )

    return digits


def rows(result):
    return [dict(r) for r in result.mappings().all()]


def set_order_status(db: Session, order_id: int, status: str):

    db.execute(
        text("""
            UPDATE dbo.Orders
            SET OrderStatus = :s
            WHERE OrderID = :o
        """),
        {"s": status, "o": order_id},
    )

    if status == "Cancelled":

        db.execute(
            text("""
                UPDATE dbo.Deliveries
                SET DeliveryStatus = 'Cancelled'
                WHERE OrderID = :o
                  AND DeliveryStatus <> 'Delivered'
            """),
            {"o": order_id},
        )

    elif status == "Delivered":

        db.execute(
            text("""
                UPDATE dbo.Deliveries
                SET DeliveryStatus = 'Delivered',
                    DeliveredAt = ISNULL(DeliveredAt, SYSDATETIME())
                WHERE OrderID = :o
                  AND DeliveryStatus <> 'Cancelled'
            """),
            {"o": order_id},
        )


# ---------- Modèles ----------

class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    phone: str
    password: str = Field(max_length=128)


class StatusIn(BaseModel):
    status: str


class ShopIn(BaseModel):
    is_open: bool


class MerchantIn(BaseModel):
    merchant_name: str = Field(min_length=2, max_length=150)
    category: str = Field(min_length=2, max_length=50)
    address: str = Field(min_length=3, max_length=300)
    phone: str


class UserIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str
    password: str = Field(min_length=8, max_length=128)
    role: Literal["Merchant", "Driver"]
    merchant_id: Optional[int] = None


class UserPatch(BaseModel):
    is_active: bool


# ---------- Base ----------

@app.get("/")
def home():
    return {
        "message": "Bienvenue sur RasJbal Express"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


@app.get("/test-db")
def test_db(
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):
    return {
        "connexion": "OK",
        "version": db.execute(
            text("SELECT @@VERSION")
        ).scalar(),
    }


# ---------- Authentification ----------

@app.post("/auth/register", status_code=201)
def register(
    data: RegisterIn,
    db: Session = Depends(get_db)
):

    phone = clean_phone(data.phone)

    if db.execute(
        text("SELECT 1 FROM dbo.Users WHERE Phone = :p"),
        {"p": phone},
    ).first():

        raise HTTPException(
            409,
            "Ce numéro est déjà utilisé."
        )

    try:

        uid = db.execute(
            text("""
                INSERT INTO dbo.Users
                    (FullName, Phone, UserRole, PasswordHash)
                OUTPUT INSERTED.UserID
                VALUES (:n, :p, 'Customer', :h)
            """),
            {
                "n": data.full_name.strip(),
                "p": phone,
                "h": hash_password(data.password),
            },
        ).scalar()

        db.commit()

    except Exception:

        db.rollback()

        raise HTTPException(
            409,
            "Impossible de créer ce compte."
        )

    user = {
        "id": uid,
        "full_name": data.full_name.strip(),
        "phone": phone,
        "role": "Customer",
    }

    return {
        "token": create_token(uid, "Customer"),
        "user": user,
    }


@app.post("/auth/login")
def login(
    data: LoginIn,
    db: Session = Depends(get_db)
):

    phone = clean_phone(data.phone)

    check_rate(phone)

    row = db.execute(
        text("""
            SELECT UserID, FullName, Phone, UserRole,
                   IsActive, PasswordHash
            FROM dbo.Users
            WHERE Phone = :p
        """),
        {"p": phone},
    ).first()

    if not row or not row[5] or not verify_password(data.password, row[5]):

        register_fail(phone)

        raise HTTPException(
            401,
            "Numéro ou mot de passe incorrect."
        )

    if not row[4]:

        raise HTTPException(
            403,
            "Ce compte est désactivé."
        )

    clear_fails(phone)

    user = {
        "id": row[0],
        "full_name": row[1],
        "phone": row[2],
        "role": row[3],
    }

    return {
        "token": create_token(row[0], row[3]),
        "user": user,
    }


@app.get("/auth/me")
def me(
    user=Depends(
        require("Customer", "Merchant", "Driver", "Admin")
    )
):
    return user


# ---------- Commerçant ----------

@app.get("/merchant/shop")
def shop_get(
    user=Depends(require_merchant),
    db: Session = Depends(get_db)
):

    return dict(
        db.execute(
            text("""
                SELECT MerchantName AS merchant_name,
                       Category AS category,
                       IsOpen AS is_open
                FROM dbo.Merchants
                WHERE MerchantID = :m
            """),
            {"m": user["merchant_id"]},
        ).mappings().first()
    )


@app.patch("/merchant/shop")
def shop_update(
    data: ShopIn,
    user=Depends(require_merchant),
    db: Session = Depends(get_db)
):

    db.execute(
        text("""
            UPDATE dbo.Merchants
            SET IsOpen = :o
            WHERE MerchantID = :m
        """),
        {
            "o": data.is_open,
            "m": user["merchant_id"],
        },
    )

    db.commit()

    return {
        "is_open": data.is_open
    }


@app.patch("/merchant/orders/{order_id}/status")
def merchant_order_status(
    order_id: int,
    data: StatusIn,
    user=Depends(require_merchant),
    db: Session = Depends(get_db)
):

    row = db.execute(
        text("""
            SELECT OrderStatus
            FROM dbo.Orders
            WHERE OrderID = :o
              AND MerchantID = :m
        """),
        {
            "o": order_id,
            "m": user["merchant_id"],
        },
    ).first()

    if not row:

        raise HTTPException(
            404,
            "Commande introuvable."
        )

    if data.status not in MERCHANT_FLOW.get(row[0], []):

        raise HTTPException(
            409,
            "Changement de statut impossible depuis l'état actuel."
        )

    set_order_status(db, order_id, data.status)

    db.commit()

    return {
        "order_id": order_id,
        "status": data.status,
    }


# ---------- Livreur ----------

@app.post("/driver/deliveries/{delivery_id}/deliver")
def driver_deliver(
    delivery_id: int,
    user=Depends(require("Driver")),
    db: Session = Depends(get_db)
):

    res = db.execute(
        text("""
            UPDATE dbo.Deliveries
            SET DeliveryStatus = 'Delivered',
                DeliveredAt = SYSDATETIME()
            WHERE DeliveryID = :i
              AND DriverID = :d
              AND DeliveryStatus = 'PickedUp'
        """),
        {
            "i": delivery_id,
            "d": user["id"],
        },
    )

    if res.rowcount == 0:

        db.rollback()

        raise HTTPException(
            409,
            "Action impossible."
        )

    db.execute(
        text("""
            UPDATE dbo.Orders
            SET OrderStatus = 'Delivered'
            WHERE OrderID = (
                SELECT OrderID
                FROM dbo.Deliveries
                WHERE DeliveryID = :i
            )
            AND OrderStatus <> 'Cancelled'
        """),
        {"i": delivery_id},
    )

    db.commit()

    return {
        "ok": True
    }


# ---------- Administrateur ----------

@app.get("/admin/stats")
def admin_stats(
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    by_status = {
        s: 0 for s in ORDER_STATUSES
    }

    for status, n in db.execute(
        text("""
            SELECT OrderStatus, COUNT(*)
            FROM dbo.Orders
            GROUP BY OrderStatus
        """)
    ):

        by_status[status] = n

    one = lambda sql: db.execute(
        text(sql)
    ).scalar() or 0

    return {

        "orders_by_status": by_status,

        "orders_total": sum(
            by_status.values()
        ),

        "revenue": one(
            "SELECT SUM(TotalAmount) FROM dbo.Orders WHERE OrderStatus = 'Delivered'"
        ),

        "customers": one(
            "SELECT COUNT(*) FROM dbo.Users WHERE UserRole = 'Customer'"
        ),

        "drivers": one(
            "SELECT COUNT(*) FROM dbo.Users WHERE UserRole = 'Driver' AND IsActive = 1"
        ),

        "merchants": one(
            "SELECT COUNT(*) FROM dbo.Merchants"
        ),

        "pending_deliveries": one(
            """
            SELECT COUNT(*)
            FROM dbo.Deliveries
            WHERE DeliveryStatus = 'Pending'
              AND DeliveryType = 'OnDemand'
            """
        ),
    }


@app.post("/admin/merchants", status_code=201)
def admin_merchant_add(
    data: MerchantIn,
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    mid = db.execute(
        text("""
            INSERT INTO dbo.Merchants
                (MerchantName, Category, Address, Phone)
            OUTPUT INSERTED.MerchantID
            VALUES (:n, :c, :a, :p)
        """),
        {
            "n": data.merchant_name.strip(),
            "c": data.category.strip(),
            "a": data.address.strip(),
            "p": clean_phone(data.phone),
        },
    ).scalar()

    db.commit()

    return {
        "merchant_id": mid
    }


@app.patch("/admin/merchants/{merchant_id}")
def admin_merchant_update(
    merchant_id: int,
    data: ShopIn,
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    res = db.execute(
        text("""
            UPDATE dbo.Merchants
            SET IsOpen = :o
            WHERE MerchantID = :m
        """),
        {
            "o": data.is_open,
            "m": merchant_id,
        },
    )

    if res.rowcount == 0:

        db.rollback()

        raise HTTPException(
            404,
            "Commerce introuvable."
        )

    db.commit()

    return {
        "ok": True
    }


@app.get("/admin/users")
def admin_users(
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    return rows(
        db.execute(
            text("""
                SELECT
                    u.UserID AS id,
                    u.FullName AS full_name,
                    u.Phone AS phone,
                    u.UserRole AS role,
                    u.IsActive AS is_active,
                    u.CreatedAt AS created_at,

                    (
                        SELECT TOP 1 MerchantName
                        FROM dbo.Merchants
                        WHERE OwnerUserID = u.UserID
                    ) AS merchant_name

                FROM dbo.Users u

                WHERE u.UserRole <> 'Customer'

                ORDER BY u.UserRole, u.FullName
            """)
        )
    )


@app.post("/admin/users", status_code=201)
def admin_user_add(
    data: UserIn,
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    phone = clean_phone(data.phone)

    if db.execute(
        text("SELECT 1 FROM dbo.Users WHERE Phone = :p"),
        {"p": phone},
    ).first():

        raise HTTPException(
            409,
            "Ce numéro est déjà utilisé."
        )

    if data.role == "Merchant":

        if not data.merchant_id:

            raise HTTPException(
                422,
                "Choisissez le commerce de ce compte."
            )

        m = db.execute(
            text("""
                SELECT OwnerUserID
                FROM dbo.Merchants
                WHERE MerchantID = :m
            """),
            {"m": data.merchant_id},
        ).first()

        if not m:

            raise HTTPException(
                404,
                "Commerce introuvable."
            )

        if m[0] is not None:

            raise HTTPException(
                409,
                "Ce commerce a déjà un compte."
            )

    try:

        uid = db.execute(
            text("""
                INSERT INTO dbo.Users
                    (FullName, Phone, UserRole, PasswordHash)
                OUTPUT INSERTED.UserID
                VALUES (:n, :p, :r, :h)
            """),
            {
                "n": data.full_name.strip(),
                "p": phone,
                "r": data.role,
                "h": hash_password(data.password),
            },
        ).scalar()

        if data.role == "Merchant":

            db.execute(
                text("""
                    UPDATE dbo.Merchants
                    SET OwnerUserID = :u
                    WHERE MerchantID = :m
                """),
                {
                    "u": uid,
                    "m": data.merchant_id,
                },
            )

        db.commit()

    except Exception:

        db.rollback()

        raise HTTPException(
            500,
            "Impossible de créer le compte."
        )

    return {
        "id": uid
    }


@app.patch("/admin/users/{user_id}")
def admin_user_update(
    user_id: int,
    data: UserPatch,
    user=Depends(require("Admin")),
    db: Session = Depends(get_db)
):

    if user_id == user["id"]:

        raise HTTPException(
            409,
            "Vous ne pouvez pas désactiver votre propre compte."
        )

    res = db.execute(
        text("""
            UPDATE dbo.Users
            SET IsActive = :a
            WHERE UserID = :i
        """),
        {
            "a": data.is_active,
            "i": user_id,
        },
    )

    if res.rowcount == 0:

        db.rollback()

        raise HTTPException(
            404,
            "Utilisateur introuvable."
        )

    db.commit()

    return {
        "ok": True
    }
