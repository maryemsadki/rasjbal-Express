import getpass
import re

from sqlalchemy import text

from database import SessionLocal
from security import hash_password

name = input("Nom complet : ").strip()
phone = re.sub(r"\D", "", input("Téléphone (8 chiffres) : "))
password = getpass.getpass("Mot de passe (8 caractères minimum) : ")

if len(name) < 2 or not re.fullmatch(r"\d{8}", phone) or len(password) < 8:
    raise SystemExit("Informations invalides.")

db = SessionLocal()
if db.execute(text("SELECT 1 FROM dbo.Users WHERE Phone = :p"), {"p": phone}).first():
    raise SystemExit("Ce numéro existe déjà.")
db.execute(
    text("INSERT INTO dbo.Users (FullName, Phone, UserRole, PasswordHash) VALUES (:n, :p, 'Admin', :h)"),
    {"n": name, "p": phone, "h": hash_password(password)},
)
db.commit()
print("Administrateur créé.")