from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables from .env file FIRST
# Specify absolute path to .env in project root
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import time
import logging

from backend.routers import conversations, insights, mobile_gateway

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Armour.AI Backend API", version="1.0.0")

# CORS setup for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(
        f"Method: {request.method} Path: {request.url.path} "
        f"Status: {response.status_code} "
        f"Duration: {process_time:.4f}s"
    )
    return response

# Startup event to pre-load models
@app.on_event("startup")
async def startup_event():
    """Pre-load ASREngine and NLP components at startup for fast first request."""
    import shutil
    
    # Check ffmpeg availability
    if shutil.which("ffmpeg"):
        logger.info("[Startup] ffmpeg found.")
    else:
        logger.warning("[Startup] WARNING: ffmpeg not found.")
    
    # Pre-load ASREngine
    logger.info("[Startup] Pre-loading ASREngine...")
    try:
        from backend.model_registry import get_asr_engine
        get_asr_engine()
        logger.info("[Startup] ✓ ASREngine ready.")
    except Exception as e:
        logger.error(f"[Startup] Failed to pre-load ASREngine: {e}")
    
    # Pre-load NLP pipeline components
    logger.info("[Startup] Pre-loading NLP pipeline...")
    try:
        from nlp.pipeline import get_classifier, get_ner, get_sentiment
        get_classifier()
        logger.info("[Startup] ✓ Classifier ready.")
        get_ner()
        logger.info("[Startup] ✓ NER ready.")
        get_sentiment()
        logger.info("[Startup] ✓ Sentiment detector ready.")
        logger.info("[Startup] ✓ NLP pipeline ready.")
    except Exception as e:
        logger.error(f"[Startup] Failed to pre-load NLP pipeline: {e}")

# Include routers
app.include_router(conversations.router)
app.include_router(insights.router)
app.include_router(mobile_gateway.router)

# Health endpoint
@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": app.version
    }
