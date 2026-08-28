import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.auth import create_access_token, get_password_hash, verify_password
from app.core.logger import get_logger

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger("router.auth")

# In-memory user store for MVP — replace with DB query in production
_user_store: dict[str, dict] = {}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username in _user_store:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(form_data.password)
    user_id = uuid.uuid4().hex
    _user_store[form_data.username] = {
        "user_id": user_id,
        "username": form_data.username,
        "hashed_password": hashed_password
    }
    logger.info("user_registered", username=form_data.username)
    return {"message": "User registered successfully"}


@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = _user_store.get(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user["user_id"]})
    return {"access_token": access_token, "token_type": "bearer"}
