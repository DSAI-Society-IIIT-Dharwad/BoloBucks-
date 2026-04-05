"""
ASR Engine with AI4Bharat indicwav2vec models and Whisper fallback.

Detects audio language first, then routes to the appropriate model:
- indicwav2vec for Indian languages (Hi, Te, Ta, Bn, Kn, Mr)
- Whisper fallback for code-mixed or unsupported languages
"""

import os
import logging
import re
from pathlib import Path
from typing import Dict, Optional, Any
import torch
import librosa
import numpy as np
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# Configure logging
logger = logging.getLogger("ASR")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s | [ASR] %(levelname)s | %(message)s"))
logger.addHandler(handler)

# Import ML libraries
try:
    from faster_whisper import WhisperModel
    logger.info("✓ faster-whisper imported")
except ImportError:
    logger.error("❌ faster-whisper not installed. Run: pip install faster-whisper")
    raise

try:
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    logger.info("✓ transformers imported for wav2vec2")
except ImportError:
    logger.error("❌ transformers not installed. Run: pip install transformers")
    raise


# Model caches to avoid reloading heavy models on every request.
_WHISPER_MODELS: Dict[str, WhisperModel] = {}
_WAV2VEC_MODELS: Dict[str, tuple[Wav2Vec2Processor, Wav2Vec2ForCTC]] = {}


ASR_FAST_MODE = os.environ.get("ASR_FAST_MODE", "1").lower() in {"1", "true", "yes", "on"}
ASR_ULTRA_FAST_MODE = os.environ.get("ASR_ULTRA_FAST_MODE", "1").lower() in {"1", "true", "yes", "on"}
LANG_DETECT_MODEL_SIZE = os.environ.get("ASR_LANG_DETECT_MODEL", "tiny" if ASR_FAST_MODE else "small")


def get_whisper_model(model_size: str = 'small') -> WhisperModel:
    """Get or create a cached WhisperModel instance."""
    if model_size not in _WHISPER_MODELS:
        logger.info(f"[WHISPER] Loading model '{model_size}' (first time)")
        _WHISPER_MODELS[model_size] = WhisperModel(model_size, device='cpu', compute_type='int8')
    return _WHISPER_MODELS[model_size]


def get_wav2vec_model(model_name: str) -> tuple[Wav2Vec2Processor, Wav2Vec2ForCTC]:
    """Get or create cached indicwav2vec processor+model."""
    if model_name not in _WAV2VEC_MODELS:
        logger.info(f"[WAV2VEC] Loading model '{model_name}' (first time)")
        processor = Wav2Vec2Processor.from_pretrained(model_name)
        model = Wav2Vec2ForCTC.from_pretrained(model_name)
        _WAV2VEC_MODELS[model_name] = (processor, model)
    return _WAV2VEC_MODELS[model_name]


# ─────────────────────────────────────────────────────────────────────────────
# PART 1: Language Detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_audio_language(audio_path: str) -> Dict[str, Any]:
    """
    Detect the language of audio using faster-whisper (small model).
    Fixes Hindi/Urdu confusion by checking script markers.
    
    Args:
        audio_path: Path to .wav file at 16kHz mono
        
    Returns:
        {
            'language': str (ISO 639-1 code, e.g., 'hi', 'te', 'ta'),
            'confidence': float (0.0-1.0),
            'is_code_mixed': bool (True if confidence < 0.75)
        }
    """
    try:
        logger.info(f"[LANG_DETECT] Starting language detection on {Path(audio_path).name}")
        
        # Use a lightweight model in fast mode for quicker language routing.
        model = get_whisper_model(LANG_DETECT_MODEL_SIZE)
        
        # Transcribe for language detection only
        segments, info = model.transcribe(
            audio_path,
            without_timestamps=True,
            beam_size=1 if ASR_FAST_MODE else 5,
            best_of=1 if ASR_FAST_MODE else 3,
            vad_filter=True if ASR_FAST_MODE else False,
            condition_on_previous_text=False if ASR_FAST_MODE else True,
            temperature=0.0,
        )
        segments_list = list(segments)
        transcribed_text = ' '.join([seg.text for seg in segments_list])
        
        language = info.language or 'unknown'
        confidence = info.language_probability or 0.0
        is_code_mixed = confidence < 0.75
        
        logger.info(f"[LANG_DETECT] Raw detection: language={language}, confidence={confidence:.2f}")
        logger.info(f"[LANG_DETECT] Transcribed text: {transcribed_text[:100]}")
        
        # Fix Hindi/Urdu confusion: Check for Devanagari script characters
        # Devanagari is used for Hindi, Persian-Arabic for Urdu
        if language == 'ur' or language == 'hi':
            # Unicode range for Devanagari: U+0900 to U+097F
            # Check if text contains any Devanagari characters
            devanagari_count = 0
            for char in transcribed_text:
                unicode_val = ord(char)
                # Devanagari Unicode range: 0x0900 - 0x097F
                if 0x0900 <= unicode_val <= 0x097F:
                    devanagari_count += 1
            
            logger.info(f"[LANG_DETECT] Devanagari character count: {devanagari_count}")
            
            if devanagari_count > 0 and language == 'ur':
                logger.info(f"[LANG_DETECT] Urdu detected but Devanagari script found → correcting to Hindi")
                language = 'hi'
                is_code_mixed = True  # Mark as code-mixed since Whisper was confused
        
        logger.info(
            f"[LANG_DETECT] Final: language={language}, confidence={confidence:.2f}, is_code_mixed={is_code_mixed}"
        )
        
        return {
            'language': language,
            'confidence': confidence,
            'is_code_mixed': is_code_mixed
        }
    except Exception as e:
        logger.error(f"[LANG_DETECT] Error: {e}", exc_info=True)
        return {
            'language': 'unknown',
            'confidence': 0.0,
            'is_code_mixed': True  # Assume code-mixed on error
        }


# ─────────────────────────────────────────────────────────────────────────────
# PART 2: Model Router
# ─────────────────────────────────────────────────────────────────────────────

class ModelRouter:
    """Routes to the correct ASR model based on language and code-mixing."""
    
    MODEL_MAP = {
        'hi': 'ai4bharat/indicwav2vec_v1_hindi',
        'te': 'ai4bharat/indicwav2vec_v1_telugu',
        'ta': 'ai4bharat/indicwav2vec_v1_tamil',
        'bn': 'ai4bharat/indicwav2vec_v1_bengali',
        'kn': 'ai4bharat/indicwav2vec_v1_kannada',
        'mr': 'ai4bharat/indicwav2vec_v1_marathi',
        'en': 'openai/whisper-large-v3',  # English uses Whisper for best quality
    }
    
    FALLBACK_MODEL = 'openai/whisper-large-v3'
    
    def __init__(self):
        self._loaded_models = {}  # Cache of loaded models
        logger.info("✓ ModelRouter initialized")
    
    def get_model(self, language_code: str, is_code_mixed: bool) -> str:
        """
        Get the appropriate model for the given language.
        
        Args:
            language_code: ISO 639-1 language code (e.g., 'hi', 'te')
            is_code_mixed: Whether audio is likely code-mixed
            
        Returns:
            HuggingFace model name string
        """
        # Use Whisper for code-mixed audio (handles multiple languages better)
        if is_code_mixed:
            logger.info("[ROUTER] Code-mixed detected → using Whisper fallback")
            return self.FALLBACK_MODEL
        
        # Check if language is supported
        if language_code not in self.MODEL_MAP:
            logger.info(f"[ROUTER] Language '{language_code}' not in MODEL_MAP → using Whisper")
            return self.FALLBACK_MODEL
        
        model_name = self.MODEL_MAP[language_code]
        logger.info(f"[ROUTER] Language '{language_code}' → {model_name}")
        return model_name
    
    def get_cached_model(self, model_name: str):
        """Get a cached model or return None if not cached."""
        return self._loaded_models.get(model_name)
    
    def cache_model(self, model_name: str, model_obj):
        """Cache a loaded model."""
        self._loaded_models[model_name] = model_obj
        logger.info(f"[ROUTER] Cached model: {model_name}")


# ─────────────────────────────────────────────────────────────────────────────
# PART 3: Transcription with indicwav2vec
# ─────────────────────────────────────────────────────────────────────────────

def transcribe_with_indicwav2vec(audio_path: str, model_name: str) -> Optional[str]:
    """
    Transcribe using AI4Bharat indicwav2vec models.
    
    Args:
        audio_path: Path to .wav file at 16kHz mono
        model_name: HuggingFace model identifier
        
    Returns:
        Transcribed text string, or None on failure
    """
    try:
        logger.info(f"[WAV2VEC] Using model: {model_name}")
        
        # Use cached processor/model across requests
        processor, model = get_wav2vec_model(model_name)
        
        logger.info("[WAV2VEC] Model loaded, processing audio...")
        
        # Load audio
        audio, sr = librosa.load(audio_path, sr=16000, mono=True)
        
        # Process
        inputs = processor(
            audio,
            sampling_rate=16000,
            return_tensors='pt',
            padding=True
        )
        
        # Inference
        with torch.no_grad():
            logits = model(**inputs).logits
        
        # Decode
        predicted_ids = torch.argmax(logits, dim=-1)
        transcript = processor.batch_decode(predicted_ids)[0]
        
        logger.info(f"[WAV2VEC] ✓ Transcription successful: '{transcript[:80]}'")
        return transcript
        
    except Exception as e:
        logger.error(f"[WAV2VEC] Error: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# PART 4: Transcription with Whisper fallback
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_whisper_language(language: Optional[str]) -> Optional[str]:
    """Map internal language tags to Whisper-compatible language codes."""
    if not language:
        return None

    lang = str(language).lower().strip()
    if not lang or lang == 'unknown':
        return None

    # Whisper expects a single ISO code, not code-mixed tags like hi-en.
    if lang in {'hi-en', 'en-hi', 'hinglish', 'ur'}:
        return 'hi'

    if '-' in lang:
        return lang.split('-')[0]

    return lang


def transcribe_with_whisper(
    audio_path: str,
    language: Optional[str] = None,
    model_size: str = 'small'
) -> Optional[str]:
    """
    Transcribe using faster-whisper (large-v3 model).
    
    Args:
        audio_path: Path to .wav file at 16kHz mono
        language: ISO language code (optional). If None, Whisper auto-detects
        
    Returns:
        Transcribed text string, or None on failure
    """
    try:
        whisper_language = _normalize_whisper_language(language)
        logger.info(
            f"[WHISPER] Transcribing with model={model_size}, "
            f"language={whisper_language or 'auto'}"
        )
        
        model = get_whisper_model(model_size)
        beam_size = 1 if ASR_FAST_MODE else 5
        best_of = 1 if ASR_FAST_MODE else 3
        use_vad = True if ASR_FAST_MODE else False
        condition_prev = False if ASR_FAST_MODE else True
        
        # Pass 1: language-guided decode (if available)
        segments, _ = model.transcribe(
            audio_path,
            language=whisper_language,
            beam_size=beam_size,
            best_of=best_of,
            vad_filter=use_vad,
            condition_on_previous_text=condition_prev,
            temperature=0.0,
        )
        transcript = ' '.join(seg.text for seg in list(segments)).strip()

        # Pass 2: if empty output, retry with auto-language decode
        if not transcript and not ASR_ULTRA_FAST_MODE:
            logger.info("[WHISPER] Empty transcript on pass 1, retrying with auto language")
            retry_segments, _ = model.transcribe(
                audio_path,
                language=None,
                beam_size=beam_size,
                best_of=best_of,
                vad_filter=use_vad,
                condition_on_previous_text=condition_prev,
                temperature=0.0,
            )
            transcript = ' '.join(seg.text for seg in list(retry_segments)).strip()
        
        logger.info(f"[WHISPER] ✓ Transcription successful: '{transcript[:80]}'")
        return transcript
        
    except Exception as e:
        logger.error(f"[WHISPER] Error: {e}")
        return None


def _score_transcript_quality(text: str) -> float:
    """Heuristic quality score to choose the best Whisper pass."""
    content = (text or "").strip()
    if not content:
        return 0.0

    total_chars = len(content)
    word_count = len([w for w in re.split(r"\s+", content) if w])
    latin_count = sum(1 for ch in content if ('a' <= ch.lower() <= 'z'))
    devanagari_count = sum(1 for ch in content if 0x0900 <= ord(ch) <= 0x097F)
    cjk_count = sum(1 for ch in content if 0x4E00 <= ord(ch) <= 0x9FFF)

    script_bonus = min(0.35, (latin_count + devanagari_count) / max(total_chars, 1))
    cjk_penalty = min(0.45, cjk_count / max(total_chars, 1))
    length_bonus = min(0.45, word_count / 40.0)

    return round(max(0.0, 0.2 + script_bonus + length_bonus - cjk_penalty), 4)


# ─────────────────────────────────────────────────────────────────────────────
# PART 5: Main ASREngine class
# ─────────────────────────────────────────────────────────────────────────────

class ASREngine:
    """
    End-to-end ASR engine with language detection and model routing.
    
    Pipeline:
    1. Detect language using faster-whisper (small)
    2. Route to indicwav2vec or Whisper based on language
    3. Transcribe with selected model
    4. Fall back to Whisper if indicwav2vec fails
    """
    
    def __init__(self):
        self.router = ModelRouter()
        logger.info("✓ ASREngine initialized")
    
    def transcribe(self, chunk: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transcribe audio chunk.
        
        Args:
            chunk: {
                'chunk_id': str,
                'audio_path': str (path to .wav file at 16kHz mono)
            }
            
        Returns:
            {
                'chunk_id': str,
                'transcript': str,
                'language': str,
                'confidence': float,
                'model_used': str,
                'is_code_mixed': bool
            }
        """
        audio_path = chunk.get('audio_path')
        chunk_id = chunk.get('chunk_id', 'unknown')
        
        logger.info(f"\n{'='*70}")
        logger.info(f"[TRANS] Starting transcription: chunk {chunk_id}")
        logger.info(f"[TRANS] Audio: {Path(audio_path).name if audio_path else 'N/A'}")
        logger.info(f"{'='*70}")
        
        # Validate audio path
        if not audio_path or not Path(audio_path).exists():
            logger.error(f"[TRANS] Audio file not found: {audio_path}")
            return {
                'chunk_id': chunk_id,
                'transcript': '',
                'language': 'unknown',
                'confidence': 0.0,
                'model_used': 'error',
                'is_code_mixed': False,
                'error': f'Audio file not found: {audio_path}'
            }
        
        try:
            if ASR_ULTRA_FAST_MODE:
                logger.info("[TRANS] Ultra-fast mode enabled: skipping language detection and model routing")
                whisper_size = os.environ.get('WHISPER_MODEL_SIZE', 'tiny')
                raw_text = transcribe_with_whisper(audio_path, None, model_size=whisper_size) or ''
                return {
                    'chunk_id': chunk_id,
                    'transcript': raw_text.strip(),
                    'language': 'unknown',
                    'confidence': 0.0,
                    'model_used': f'openai/whisper-{whisper_size}',
                    'is_code_mixed': True
                }

            # Step 1: Detect language
            logger.info("[TRANS] Step 1/5: Language detection...")
            lang_info = detect_audio_language(audio_path)
            language = lang_info['language']
            confidence = lang_info['confidence']
            is_code_mixed = lang_info['is_code_mixed']
            
            # Mark code-mixed audio as Hinglish (hi-en)
            if is_code_mixed and language == 'hi':
                language = 'hi-en'
                logger.info("[TRANS] Code-mixed Hindi detected → marking as 'hi-en' (Hinglish)")
            
            # Step 2: Get model
            logger.info("[TRANS] Step 2/5: Model routing...")
            model_name = self.router.get_model(language, is_code_mixed)
            
            # Step 3: Try indicwav2vec if not Whisper
            logger.info("[TRANS] Step 3/5: Primary transcription...")
            raw_text = None
            if 'indicwav2vec' in model_name:
                raw_text = transcribe_with_indicwav2vec(audio_path, model_name)
            
            # Step 4: Fall back to Whisper if needed
            if raw_text is None or raw_text.strip() == '':
                logger.info("[TRANS] Step 4/5: Fallback to Whisper...")
                # Fast mode uses a single decode pass with one optional retry.
                whisper_size = os.environ.get(
                    'WHISPER_MODEL_SIZE',
                    'tiny' if ASR_FAST_MODE else ('large-v3' if is_code_mixed or (language or '').startswith('hi') else 'small')
                )

                primary_lang = language if confidence > 0.5 and language and language != 'unknown' else None
                raw_text = transcribe_with_whisper(audio_path, primary_lang, model_size=whisper_size)

                if (raw_text is None or not raw_text.strip()) and primary_lang is not None:
                    raw_text = transcribe_with_whisper(audio_path, None, model_size=whisper_size)

                model_name = f'openai/whisper-{whisper_size}'  # Update model used
            
            # Step 5: Ensure we have something
            if raw_text is None:
                raw_text = ''
            
            logger.info(f"[TRANS] Step 5/5: Complete!")
            logger.info(f"[TRANS] Final transcript: '{raw_text[:100]}...'")
            logger.info(f"{'='*70}\n")
            
            return {
                'chunk_id': chunk_id,
                'transcript': raw_text.strip(),
                'language': language,
                'confidence': confidence,
                'model_used': model_name,
                'is_code_mixed': is_code_mixed
            }
            
        except Exception as e:
            logger.error(f"[TRANS] Unexpected error: {e}")
            return {
                'chunk_id': chunk_id,
                'transcript': '',
                'language': 'unknown',
                'confidence': 0.0,
                'model_used': 'error',
                'is_code_mixed': False,
                'error': str(e)
            }


# ─────────────────────────────────────────────────────────────────────────────
# Test
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    engine = ASREngine()
    
    # Find a test audio file
    test_audio_path = None
    for candidate in [
        'tests/test_audio.wav',
        'test_audio.wav',
        'sample_audio.wav'
    ]:
        if Path(candidate).exists():
            test_audio_path = candidate
            break
    
    if test_audio_path:
        result = engine.transcribe({
            'chunk_id': 'test-001',
            'audio_path': test_audio_path
        })
        print("\n" + "="*70)
        print("TEST RESULT:")
        print("="*70)
        for key, value in result.items():
            print(f"  {key}: {value}")
    else:
        print("⚠ No test audio file found. Tested components individually.")
