"""
pipeline.py

Complete NLP pipeline for financial conversations.
Uses lightweight, Windows-compatible components:
- Keyword-based classification
- spaCy + regex NER
- Robust sentiment detection

Usage:
    from nlp.pipeline import run_nlp_pipeline
    result = run_nlp_pipeline({
        'chunk_id': 'test-001',
        'raw_text': 'mujhe ek loan chahiye for do lakh rupees',
        'language_detected': 'hi-en'
    })
    print(result)
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from nlp.classifier import FinanceClassifier
from nlp.ner import FinancialNER
from nlp.sentiment import SentimentDetector

_classifier = None
_ner = None
_sentiment = None


def get_classifier():
    """Get or create classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = FinanceClassifier()
    return _classifier


def get_ner():
    """Get or create NER instance."""
    global _ner
    if _ner is None:
        _ner = FinancialNER()
    return _ner


def get_sentiment():
    """Get or create sentiment detector instance."""
    global _sentiment
    if _sentiment is None:
        _sentiment = SentimentDetector()
    return _sentiment


def run_nlp_pipeline(transcript: dict) -> dict:
    """
    Run complete NLP pipeline on transcript chunk.
    
    Args:
        transcript: dict with keys:
            - raw_text: str (the actual text)
            - language_detected: str (language code, e.g., 'hi', 'hi-en', 'en')
            - chunk_id: str (unique identifier)
    
    Returns:
        dict with fields or None if not financial
        
    Example return:
        {
            'chunk_id': 'test-001',
            'instruments': ['loan'],
            'amounts': ['2 lakh'],
            'durations': [],
            'decisions': ['lena chahiye'],
            'persons': [],
            'organizations': [],
            'monetary': ['2 lakh'],
            'topics': ['loan'],
            'sentiment': 'neutral',
            'sentiment_score': 0.5,
            'confidence_scores': {
                'instruments': 0.9,
                'amounts': 0.9,
                'durations': 0.0,
                'decisions': 0.85,
                'persons': 0.0,
            },
            'overall_confidence': 0.85,
            'flagged_for_review': False
        }
    """
    text = transcript.get('raw_text', '')
    language = transcript.get('language_detected', 'unknown')
    chunk_id = transcript.get('chunk_id', '')
    
    print(f'[Pipeline] running on: {text}')
    
    # Skip empty transcripts
    if not text or not text.strip():
        print('[Pipeline] empty transcript — skipping')
        return None
    
    # Get engines
    classifier = get_classifier()
    ner = get_ner()
    sentiment = get_sentiment()
    
    # Indian language list
    indian_langs = [
        'hi', 'te', 'ta', 'bn', 'kn', 'mr',
        'hi-en', 'te-en', 'ta-en', 'bn-en', 'kn-en',
        'hindi', 'telugu', 'tamil', 'bengali', 'kannada', 'marathi'
    ]
    
    # Determine if Indian language
    is_indian_lang = any(language.lower().startswith(l) for l in indian_langs)
    
    # Step 1: Classify if financial
    clf_result = classifier.predict(text)
    is_financial = clf_result.get('is_financial', True)  # Default to True for Indian languages
    
    if is_indian_lang:
        print('[Pipeline] Indian language — using keyword classifier')
        is_financial = clf_result.get('is_financial', True)
    else:
        print(f'[Pipeline] Classification: {is_financial}')
        if not is_financial:
            print('[Pipeline] not financial — returning None')
            return None
    
    # Step 2: Extract entities
    entities = ner.extract(text)
    
    # Step 3: Analyze sentiment
    sentiment_result = sentiment.analyze(text)
    
    # Step 4: Calculate overall confidence
    # Blend model confidences with coverage/intent heuristics so long, clear
    # financial conversations do not get under-scored.
    base_confidence = (
        entities['confidence_scores'].get('instruments', 0) * 0.35 +
        entities['confidence_scores'].get('amounts', 0) * 0.35 +
        entities['confidence_scores'].get('decisions', 0) * 0.2 +
        entities['confidence_scores'].get('persons', 0) * 0.1
    )

    coverage_boost = 0.0
    if entities.get('instruments'):
        coverage_boost += 0.08
    if entities.get('amounts') or entities.get('monetary'):
        coverage_boost += 0.10
    if entities.get('decisions'):
        coverage_boost += 0.08
    if entities.get('topics'):
        coverage_boost += 0.06

    financial_keywords = [
        'sip', 'mutual fund', 'investment', 'invest', 'loan', 'emi', 'insurance',
        'stock', 'equity', 'fd', 'amount', 'rupees', 'inr', 'lakh',
        'निवेश', 'म्यूचुअल', 'फंड', 'लोन', 'ईएमआई', 'रुपये', 'लाख', 'कर्ज'
    ]
    text_lc = text.lower()
    keyword_hits = sum(1 for kw in financial_keywords if kw in text_lc)
    keyword_boost = min(0.12, keyword_hits * 0.02)

    length_boost = 0.0
    if len(text.split()) >= 25:
        length_boost = 0.05

    overall_confidence = min(1.0, base_confidence + coverage_boost + keyword_boost + length_boost)
    
    # Step 5: Flag if low confidence
    flagged = overall_confidence < 0.6
    
    # Step 6: Construct result
    result = {
        'chunk_id': chunk_id,
        'instruments': entities.get('instruments', []),
        'amounts': entities.get('amounts', []),
        'durations': entities.get('durations', []),
        'decisions': entities.get('decisions', []),
        'persons': entities.get('persons', []),
        'organizations': entities.get('organizations', []),
        'monetary': entities.get('monetary', []),
        'topics': entities.get('topics', []),
        'sentiment': sentiment_result.get('sentiment', 'neutral'),
        'sentiment_score': sentiment_result.get('score', 0.5),
        'confidence_scores': entities.get('confidence_scores', {}),
        'overall_confidence': round(overall_confidence, 3),
        'flagged_for_review': flagged
    }
    
    print(f'[Pipeline] result: {result}')
    return result


# Example usage
if __name__ == "__main__":
    print("=" * 80)
    print("NLP PIPELINE TEST")
    print("=" * 80)
    
    test_cases = [
        {
            'chunk_id': 'test-001',
            'raw_text': 'mujhe ek loan chahiye for do lakh rupees',
            'language_detected': 'hi-en'
        },
        {
            'chunk_id': 'test-002',
            'raw_text': '20 lakh ka home loan lena chahiye',
            'language_detected': 'hi-en'
        },
        {
            'chunk_id': 'test-003',
            'raw_text': 'SIP mein 5000 rupees monthly invest karna hai',
            'language_detected': 'hi-en'
        },
    ]
    
    for test_case in test_cases:
        print(f"\nProcessing: {test_case['raw_text']}")
        result = run_nlp_pipeline(test_case)
        if result:
            print(f"  Instruments: {result.get('instruments', [])}")
            print(f"  Amounts: {result.get('amounts', [])}")
            print(f"  Sentiment: {result.get('sentiment')}")
            print(f"  Confidence: {result.get('overall_confidence')}")
        else:
            print("  [Not financial]")
