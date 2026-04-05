"""
Mobile-optimized API Gateway Router

Thin adapter layer between Dev 3's core API and mobile clients.
Handles payload compression, pagination, and field trimming for lean responses.
"""

import json
import hashlib
import math
import os
import tempfile
import time
import logging
from typing import Optional, Any, Dict, List
from datetime import datetime
from pathlib import Path
from functools import lru_cache

from fastapi import APIRouter, Query, HTTPException, Request, File, Form, UploadFile
from fastapi.responses import JSONResponse
import httpx
import uuid as uuid_mod

from shared import config
from audio_processor import AudioProcessor, validate_audio
from backend.orchestrator import PipelineOrchestrator
from notifications import register_device, get_device_info, get_notification_stats

logger = logging.getLogger(__name__)

# Configuration
DEV3_BASE_URL = "http://localhost:8000"  # Dev 3 API base URL - configure as needed
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

router = APIRouter(prefix="/mobile/v1", tags=["mobile"])

# HTTP client for backend communication
client = httpx.AsyncClient(base_url=DEV3_BASE_URL, timeout=30.0)


def calculate_response_size_kb(data: Any) -> float:
    """Calculate size of data in kilobytes."""
    json_str = json.dumps(data)
    size_bytes = len(json_str.encode("utf-8"))
    return round(size_bytes / 1024, 2)


def generate_etag(data: Any) -> str:
    """Generate ETag hash for response data."""
    json_str = json.dumps(data, sort_keys=True)
    hash_obj = hashlib.md5(json_str.encode("utf-8"))
    return f'"{hash_obj.hexdigest()}"'


def compress_insight_card(card: Dict[str, Any], include_transcript: bool = False) -> Dict[str, Any]:
    """
    Compress InsightCard by removing raw_transcript unless explicitly requested.
    
    Args:
        card: The insight card object
        include_transcript: Whether to include raw_transcript field
        
    Returns:
        Compressed card with selective fields
    """
    compressed = {k: v for k, v in card.items() if k != "raw_transcript"}
    
    if include_transcript and "raw_transcript" in card:
        compressed["raw_transcript"] = card["raw_transcript"]
    
    return compressed


def compress_conversation(
    conversation: Dict[str, Any], 
    include_transcript: bool = False
) -> Dict[str, Any]:
    """
    Compress conversation object by processing insight cards.
    
    Args:
        conversation: The conversation object from Dev 3 API
        include_transcript: Whether to include raw transcripts
        
    Returns:
        Compressed conversation with lightweight payload
    """
    compressed = conversation.copy()
    
    # Compress insight cards if present
    if "insight_cards" in compressed and isinstance(compressed["insight_cards"], list):
        compressed["insight_cards"] = [
            compress_insight_card(card, include_transcript)
            for card in compressed["insight_cards"]
        ]
    
    # Remove any other verbose fields not needed for mobile
    remove_fields = ["metadata", "debug_info", "internal_notes"]
    for field in remove_fields:
        compressed.pop(field, None)
    
    return compressed


def paginate_items(
    items: List[Any], 
    page: int = 1, 
    limit: int = DEFAULT_PAGE_SIZE
) -> tuple[List[Any], int, int]:
    """
    Paginate items list.
    
    Args:
        items: List of items to paginate
        page: Page number (1-indexed)
        limit: Items per page
        
    Returns:
        Tuple of (paginated_items, current_page, total_pages)
    """
    total_items = len(items)
    total_pages = math.ceil(total_items / limit)
    
    # Validate page number
    if page < 1:
        page = 1
    if page > total_pages and total_pages > 0:
        page = total_pages
    
    # Calculate slice indices
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    paginated = items[start_idx:end_idx]
    return paginated, page, total_pages


def build_mobile_response(
    data: Any,
    page: int = 1,
    total_pages: int = 1,
    response_size_kb: Optional[float] = None
) -> Dict[str, Any]:
    """
    Build mobile-optimized response with metadata.
    
    Args:
        data: The response payload
        page: Current page number
        total_pages: Total number of pages
        response_size_kb: Size of response in KB
        
    Returns:
        Response dict with data and mobile_meta
    """
    if response_size_kb is None:
        response_size_kb = calculate_response_size_kb(data)
    
    return {
        "data": data,
        "mobile_meta": {
            "response_size_kb": response_size_kb,
            "page": page,
            "total_pages": total_pages,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    }


@router.get("/conversations")
async def get_conversations(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(
        DEFAULT_PAGE_SIZE, 
        ge=1, 
        le=MAX_PAGE_SIZE,
        description="Items per page (max 100)"
    ),
    include_transcript: bool = Query(
        False,
        description="Include raw_transcript in insight cards"
    ),
) -> JSONResponse:
    """
    Get conversations with pagination and compression.
    
    Query Parameters:
        - page: Page number (default: 1)
        - limit: Items per page (default: 20, max: 100)
        - include_transcript: Include raw transcripts (default: false)
    
    Returns:
        Mobile-optimized conversations with pagination and ETag
    """
    try:
        # Fetch conversations from Dev 3 API
        response = await client.get("/v1/conversations")
        response.raise_for_status()
        
        dev3_data = response.json()
        conversations = dev3_data if isinstance(dev3_data, list) else dev3_data.get("data", [])
        
        # Compress conversations
        compressed = [
            compress_conversation(conv, include_transcript)
            for conv in conversations
        ]
        
        # Apply pagination
        paginated, current_page, total_pages = paginate_items(
            compressed,
            page=page,
            limit=limit
        )
        
        # Build response
        response_data = build_mobile_response(
            paginated,
            page=current_page,
            total_pages=total_pages
        )
        
        # Calculate ETag on final response
        etag = generate_etag(response_data)
        
        # Return response with ETag header
        return JSONResponse(
            content=response_data,
            headers={
                "ETag": etag,
                "Cache-Control": "public, max-age=300",  # 5 minutes
                "X-Mobile-Gateway": "armour-ai/v1"
            }
        )
        
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error fetching from Dev 3 API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    include_transcript: bool = Query(
        False,
        description="Include raw_transcript in insight cards"
    ),
) -> JSONResponse:
    """
    Get single conversation with compression.
    
    Path Parameters:
        - conversation_id: ID of the conversation
        
    Query Parameters:
        - include_transcript: Include raw transcripts (default: false)
    
    Returns:
        Mobile-optimized conversation with ETag
    """
    try:
        # Fetch conversation from Dev 3 API
        response = await client.get(f"/v1/conversations/{conversation_id}")
        response.raise_for_status()
        
        dev3_data = response.json()
        conversation = dev3_data.get("data", dev3_data)
        
        # Compress conversation
        compressed = compress_conversation(conversation, include_transcript)
        
        # Build response (single item, no pagination)
        response_data = build_mobile_response(
            compressed,
            page=1,
            total_pages=1
        )
        
        # Calculate ETag on final response
        etag = generate_etag(response_data)
        
        # Return response with ETag header
        return JSONResponse(
            content=response_data,
            headers={
                "ETag": etag,
                "Cache-Control": "public, max-age=600",  # 10 minutes
                "X-Mobile-Gateway": "armour-ai/v1"
            }
        )
        
    except httpx.HTTPError as e:
        if e.response and e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Conversation not found")
        raise HTTPException(
            status_code=502,
            detail=f"Error fetching from Dev 3 API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/conversations/{conversation_id}/insights")
async def get_conversation_insights(
    conversation_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(
        DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="Items per page (max 100)"
    ),
    include_transcript: bool = Query(
        False,
        description="Include raw_transcript in insight cards"
    ),
) -> JSONResponse:
    """
    Get paginated insight cards for a conversation.
    
    Path Parameters:
        - conversation_id: ID of the conversation
        
    Query Parameters:
        - page: Page number (default: 1)
        - limit: Items per page (default: 20, max: 100)
        - include_transcript: Include raw transcripts (default: false)
    
    Returns:
        Mobile-optimized insight cards with pagination and ETag
    """
    try:
        # Fetch conversation from Dev 3 API
        response = await client.get(f"/v1/conversations/{conversation_id}")
        response.raise_for_status()
        
        dev3_data = response.json()
        conversation = dev3_data.get("data", dev3_data)
        
        # Extract and compress insight cards
        insight_cards = conversation.get("insight_cards", [])
        compressed_cards = [
            compress_insight_card(card, include_transcript)
            for card in insight_cards
        ]
        
        # Apply pagination
        paginated, current_page, total_pages = paginate_items(
            compressed_cards,
            page=page,
            limit=limit
        )
        
        # Build response
        response_data = build_mobile_response(
            paginated,
            page=current_page,
            total_pages=total_pages
        )
        
        # Calculate ETag
        etag = generate_etag(response_data)
        
        # Return response with ETag header
        return JSONResponse(
            content=response_data,
            headers={
                "ETag": etag,
                "Cache-Control": "public, max-age=300",
                "X-Mobile-Gateway": "armour-ai/v1"
            }
        )
        
    except httpx.HTTPError as e:
        if e.response and e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Conversation not found")
        raise HTTPException(
            status_code=502,
            detail=f"Error fetching from Dev 3 API: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint for mobile gateway.
    
    Returns:
        Health status and gateway info
    """
    try:
        # Check Dev 3 API connectivity
        response = await client.get("/health", timeout=5.0)
        dev3_healthy = response.status_code == 200
    except Exception:
        dev3_healthy = False
    
    return {
        "status": "healthy" if dev3_healthy else "degraded",
        "service": "mobile-gateway",
        "dev3_api": "healthy" if dev3_healthy else "unreachable",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@router.post("/conversations/upload")
async def upload_audio(
    audio_file: UploadFile = File(None, description="Audio file (wav, m4a, aac, mp3)"),
    file: UploadFile = File(None, description="Audio file (wav, m4a, aac, mp3)"),
    device_id: str = Form(..., description="Device ID"),
    recorded_at: str = Form(..., description="ISO 8601 timestamp of recording"),
) -> JSONResponse:
    """
    Upload and process audio from mobile device.
    
    Accepts compressed audio in multiple formats, converts to 16kHz mono WAV,
    processes through transcription and insight pipeline.
    
    Form Parameters:
        - audio_file: Audio file in multipart/form-data (wav, m4a, aac, mp3)
        - device_id: UUID or identifier of the device uploading
        - recorded_at: ISO 8601 timestamp (e.g., "2026-03-29T10:30:45Z")
    
    Returns:
        JSON response with insight cards and processing metadata
        
    Status Codes:
        - 200: OK - Audio processed successfully
        - 400: Bad Request - Invalid parameters or format
        - 413: Payload Too Large - File exceeds MAX_AUDIO_SIZE_MB
        - 415: Unsupported Media Type - Audio format not supported
        - 500: Internal Server Error - Processing failed
    """
    temp_input_file = None
    temp_converted_file = None
    pipeline_start_time = time.time()
    
    try:
        # Validate recorded_at timestamp
        try:
            datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timestamp format: {recorded_at}. Use ISO 8601 format (e.g., '2026-03-29T10:30:45Z')"
            )
        
        # Validate device_id
        if not device_id or len(device_id) < 3:
            raise HTTPException(
                status_code=400,
                detail="Invalid device_id. Must be at least 3 characters."
            )
        
        # Check file format
        uploaded_file = audio_file or file
        if not uploaded_file or not uploaded_file.filename:
            raise HTTPException(
                status_code=400,
                detail="No filename provided"
            )
        
        file_ext = Path(uploaded_file.filename).suffix.lower()
        if not config.is_audio_format_allowed(uploaded_file.filename):
            allowed = ", ".join(config.ALLOWED_AUDIO_FORMATS)
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported audio format: {file_ext}. Allowed formats: {allowed}"
            )
        
        # Save uploaded file to temporary location
        logger.info(f"Device {device_id} - Receiving audio: {uploaded_file.filename}")
        
        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp:
            temp_input_file = tmp.name
            contents = await uploaded_file.read()
            tmp.write(contents)
        
        # Validate file size
        file_size = os.path.getsize(temp_input_file)
        max_size_bytes = config.get_max_audio_size_bytes()
        
        if file_size > max_size_bytes:
            max_mb = config.MAX_AUDIO_SIZE_MB
            actual_mb = file_size / (1024 * 1024)
            logger.warning(
                f"Device {device_id} - File too large: {actual_mb:.1f}MB (max: {max_mb}MB)"
            )
            raise HTTPException(
                status_code=413,
                detail=f"Audio file too large: {actual_mb:.1f}MB. Maximum allowed: {max_mb}MB"
            )
        
        # Validate audio file
        is_valid, error_msg = validate_audio(temp_input_file, max_size_bytes)
        if not is_valid:
            logger.warning(f"Device {device_id} - Validation error: {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio file: {error_msg}"
            )
        
        logger.info(f"Device {device_id} - File validated: {file_size / 1024:.1f}KB")
        
        # Convert audio to target format
        conversion_start = time.time()
        logger.info(f"Device {device_id} - Converting audio to {config.TARGET_SAMPLE_RATE}Hz mono WAV")
        
        temp_converted_file, conversion_time_ms = AudioProcessor.convert_to_target_format(
            temp_input_file,
            device_id,
        )
        
        logger.info(f"Device {device_id} - Conversion completed in {conversion_time_ms:.1f}ms")
        
        # Process through pipeline (transcription + insights)
        logger.info(f"Device {device_id} - Starting audio processing pipeline")
        
        # Read converted audio file and create chunk for orchestrator
        with open(temp_converted_file, "rb") as f:
            audio_bytes = f.read()
        
        audio_chunk = {
            "audio_bytes": audio_bytes,
            "audio_path": temp_converted_file,  # ASR engine will use this for processing
            "chunk_id": str(uuid_mod.uuid4()),
            "sample_rate": config.TARGET_SAMPLE_RATE,
            "filename": f"{device_id}_audio.wav",
            "content_type": "audio/wav",
            "duration": len(audio_bytes) / (config.TARGET_SAMPLE_RATE * 2),
        }
        
        # Use backend orchestrator to process audio
        orchestrator = PipelineOrchestrator()
        insight_dict = orchestrator.process(audio_chunk)
        
        # Convert orchestrator result to response format
        insight_card = {
            "id": f"insight_{device_id}_{uuid_mod.uuid4().hex[:8]}",
            "title": f"Analysis - {insight_dict.get('topic', 'Unknown')}",
            "summary": insight_dict.get("next_action", ""),
            "category": "analysis",
            "confidence": insight_dict.get("confidence_score", 0.0),
            "raw_transcript": insight_dict.get("raw_transcript", ""),
            "languages_detected": insight_dict.get("language_detected", "unknown"),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        total_processing_time_ms = (time.time() - pipeline_start_time) * 1000
        
        logger.info(
            f"Device {device_id} - Pipeline complete in {total_processing_time_ms:.1f}ms"
        )
        
        # Build response
        response_data = {
            "insight_cards": [insight_card],
            "upload_meta": {
                "device_id": device_id,
                "recorded_at": recorded_at,
                "file_size_kb": file_size / 1024,
                "file_format": file_ext.lstrip(".").lower(),
                "processing_time_ms": round(total_processing_time_ms, 2),
                "conversion_time_ms": round(conversion_time_ms, 2),
                "insights_count": 1,
                "status": "success",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        }
        
        return JSONResponse(
            content=response_data,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Mobile-Gateway": "armour-ai/v1"
            }
        )
        
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Device {device_id} - Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing failed: {str(e)}"
        )
    
    finally:
        # Clean up temporary files
        try:
            if temp_input_file and os.path.exists(temp_input_file):
                os.remove(temp_input_file)
                logger.debug(f"Cleaned up input temp file: {temp_input_file}")
        except Exception as e:
            logger.warning(f"Failed to cleanup input temp file: {str(e)}")
        
        try:
            if temp_converted_file:
                AudioProcessor.cleanup_temp_file(temp_converted_file)
        except Exception as e:
            logger.warning(f"Failed to cleanup converted temp file: {str(e)}")


@router.post("/devices/register")
async def register_device_endpoint(
    device_id: str = Form(..., description="Unique device identifier"),
    push_token: str = Form(..., description="Push notification token"),
    platform: str = Form(..., description="Platform (ios, android, web)"),
) -> JSONResponse:
    """
    Register a mobile device for push notifications.
    
    When conversations are flagged for review, the server will send notifications
    to registered devices via webhook and push services.
    
    Form Parameters:
        - device_id: Unique device identifier (UUID recommended, min 3 chars)
        - push_token: Push notification token from platform (FCM, APNs, etc.)
        - platform: Platform identifier (ios, android, web)
    
    Returns:
        JSON response with registration status
        
    Status Codes:
        - 200: OK - Device registered successfully
        - 400: Bad Request - Invalid parameters
        - 422: Unprocessable Entity - Unsupported platform
    """
    # Validation
    device_id = device_id.strip() if device_id else ""
    push_token = push_token.strip() if push_token else ""
    platform = platform.strip().lower() if platform else ""
    
    # Validate device_id
    if not device_id or len(device_id) < 3:
        logger.warning(f"Device registration failed: Invalid device_id length")
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "device_id must be at least 3 characters",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
    
    # Validate push_token
    if not push_token or len(push_token) < 10:
        logger.warning(f"Device registration failed: Invalid push_token")
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "push_token is required and must be at least 10 characters",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
    
    # Validate platform
    if platform not in config.ALLOWED_PLATFORMS:
        logger.warning(
            f"Device registration failed: Unsupported platform '{platform}'. "
            f"Allowed: {config.ALLOWED_PLATFORMS}"
        )
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "message": f"Unsupported platform. Allowed: {', '.join(config.ALLOWED_PLATFORMS)}",
                "allowed_platforms": config.ALLOWED_PLATFORMS,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
    
    try:
        # Register the device
        success = register_device(device_id, push_token, platform)
        
        if success:
            logger.info(
                f"Device registered successfully: device_id={device_id}, "
                f"platform={platform}"
            )
            
            return JSONResponse(
                status_code=200,
                content={
                    "status": "success",
                    "message": "Device registered successfully",
                    "device_id": device_id,
                    "platform": platform,
                    "notifications_enabled": config.ENABLE_PUSH_NOTIFICATIONS,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            )
        else:
            logger.error(f"Device registration failed in database for {device_id}")
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": "Failed to register device",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            )
    
    except Exception as e:
        logger.error(f"Unexpected error during device registration: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Internal server error during registration",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )


@router.get("/devices/{device_id}")
async def get_device_endpoint(device_id: str) -> JSONResponse:
    """
    Get device registration information.
    
    Path Parameters:
        - device_id: Device identifier
    
    Returns:
        JSON response with device info or 404
    """
    try:
        device_info = get_device_info(device_id)
        
        if not device_info:
            return JSONResponse(
                status_code=404,
                content={
                    "status": "not_found",
                    "message": f"Device '{device_id}' not registered",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            )
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "device": device_info,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
    
    except Exception as e:
        logger.error(f"Error retrieving device info for {device_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Failed to retrieve device info",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )


@router.get("/notifications/stats")
async def get_notification_stats_endpoint() -> JSONResponse:
    """
    Get notification system statistics.
    
    Returns:
        JSON response with notification stats (device count, platforms, etc.)
    """
    try:
        stats = get_notification_stats()
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "stats": stats,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
    
    except Exception as e:
        logger.error(f"Error retrieving notification stats: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "Failed to retrieve notification stats",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )


@router.on_event("shutdown")
async def shutdown():
    """Close HTTP client on shutdown."""
    await client.aclose()
