import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.auth import create_access_token, get_password_hash, verify_password
from app.core.logger import get_logger
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger("router.auth")


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    existing_user = result.scalars().first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(form_data.password)
    user_id = uuid.uuid4().hex
    
    new_user = User(
        user_id=user_id,
        username=form_data.username,
        hashed_password=hashed_password
    )
    db.add(new_user)
    await db.commit()
    
    logger.info("user_registered", username=form_data.username)
    return {"message": "User registered successfully"}


@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.user_id})
    return {"access_token": access_token, "token_type": "bearer"}
