"""
Main FastAPI application with mobile gateway integration.

Mounts the mobile-optimized API gateway router at /mobile/v1
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path, override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from mobile_gateway import router as mobile_router
try:
    from demo import router as demo_router
except ImportError:
    demo_router = None

# Initialize FastAPI app
app = FastAPI(
    title="ArmourAI Mobile Gateway",
    description="Mobile-optimized API gateway for ArmourAI",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

# Add GZIP compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Mount mobile gateway router
app.include_router(mobile_router)

# Mount demo data router (if DEMO_MODE enabled)
if demo_router is not None:
    app.include_router(demo_router)


@app.get("/")
async def root():
    """Root endpoint with API documentation."""
    return {
        "service": "ArmourAI Mobile Gateway",
        "version": "1.0.0",
        "endpoints": {
            "mobile_api": "/mobile/v1",
            "demo_api": "/demo/v1",
            "docs": "/docs",
            "health": "/mobile/v1/health"
        },
        "description": "Mobile-optimized API gateway with compression, pagination, caching, and demo data"
    }


@app.get("/health")
async def app_health():
    """Application health check."""
    return {"status": "healthy", "service": "mobile-gateway"}


if __name__ == "__main__":
    import uvicorn
    
    # Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8001
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
