import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db

load_dotenv()
SECRET = os.getenv("JWT_SECRET", "")
if len(SECRET) < 32:
    raise RuntimeError("JWT_SECRET manquant ou trop court (32 caractères minimum) dans .env")

ALGO = "HS256"
TOKEN_HOURS = 72
ITERATIONS = 600_000


# ---------- Mots de passe ----------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, expected = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(dk.hex(), expected)
    except Exception:
        return False


# ---------- Jetons ----------
def create_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)


bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    if creds is None:
        raise HTTPException(401, "Connexion requise.")
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGO])
        uid = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Session expirée. Veuillez vous reconnecter.")
    row = db.execute(
        text("SELECT UserID, FullName, Phone, UserRole, IsActive FROM dbo.Users WHERE UserID = :i"),
        {"i": uid},
    ).first()
    if not row or not row[4]:
        raise HTTPException(401, "Compte introuvable ou désactivé.")
    # Le rôle vient de la base, pas du jeton
    return {"id": row[0], "full_name": row[1], "phone": row[2], "role": row[3]}


def require(*roles):
    def dep(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Accès refusé.")
        return user
    return dep


def require_merchant(user=Depends(require("Merchant")), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT MerchantID FROM dbo.Merchants WHERE OwnerUserID = :u"),
        {"u": user["id"]},
    ).first()
    if not row:
        raise HTTPException(403, "Aucun commerce n'est associé à ce compte.")
    return {**user, "merchant_id": row[0]}


# ---------- Limite des tentatives de connexion ----------
_fails = {}


def check_rate(key: str):
    now = time.time()
    count, start = _fails.get(key, (0, now))
    if now - start > 900:
        _fails[key] = (0, now)
        return
    if count >= 5:
        raise HTTPException(429, "Trop de tentatives. Réessayez dans quelques minutes.")


def register_fail(key: str):
    now = time.time()
    count, start = _fails.get(key, (0, now))
    if now - start > 900:
        count, start = 0, now
    _fails[key] = (count + 1, start)


def clear_fails(key: str):
    _fails.pop(key, None)