
import getpass
import os

from dotenv import load_dotenv
from sqlalchemy.orm import Session

load_dotenv()

import models
from database import SessionLocal
from main import hash_password


def main():
    name = input("Core user's name: ").strip()
    email = input("Core user's email: ").strip().lower()
    password = getpass.getpass("Password (12+ characters): ")

    if not name or not email:
        raise SystemExit("Name and email are required.")

    if len(password) < 12:
        raise SystemExit("Password must be at least 12 characters.")

    db: Session = SessionLocal()

    try:
        if db.query(models.User).filter(
            models.User.role == models.UserRole.CORE
        ).first():
            raise SystemExit(
                "A Core user already exists. "
                "Use the normal authenticated account-management flow."
            )

        if db.query(models.User).filter(
            models.User.email == email
        ).first():
            raise SystemExit("That email address is already registered.")

        user = models.User(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            role=models.UserRole.CORE,
        )

        db.add(user)
        db.commit()

        print(f"Created initial Core account for {email}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
