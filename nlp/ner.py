"""
ner.py

Financial Named Entity Recognition using spaCy + regex patterns.
Supports Hindi, English, and Hinglish text.
No heavy transformers - pure regex and spaCy lightweight model.

Usage:
    from nlp.ner import FinancialNER
    ner = FinancialNER()
    result = ner.extract("mujhe ek loan chahiye for do lakh rupees")
    print(result)
"""

import re
import spacy
from typing import Dict, List


class FinancialNER:
    """Financial NER using spaCy and regex patterns for Hinglish text."""
    
    def __init__(self):
        """Initialize spaCy model and pattern lists."""
        print('[NER] Loading spaCy model...')
        try:
            self.nlp = spacy.load('en_core_web_sm')
            print('[NER] spaCy loaded successfully.')
        except OSError:
            print('[NER] ERROR: spaCy model not found. Run: python -m spacy download en_core_web_sm')
            self.nlp = None
        
        # Pattern lists — covers Hindi, English and Hinglish variants
        self.INSTRUMENT_PATTERNS = [
            r'\b(home\s*loan|home\s*लोन|होम\s*लोन)\b',
            r'\b(personal\s*loan|personal\s*लोन|पर्सनल\s*लोन)\b',
            r'\b(car\s*loan|car\s*लोन|कार\s*लोन)\b',
            r'\b(education\s*loan|education\s*लोन|शिक्षा\s*लोन)\b',
            r'\b(loan|लोन|लोण|ऋण)\b',
            r'\b(SIP|sip|एसआईपी)\b',
            r'\b(FD|fixed\s*deposit|फिक्स्ड\s*डिपॉजिट|एफडी)\b',
            r'\b(mutual\s*fund|म्यूचुअल\s*फंड|मतलब फंड)\b',
            r'\b(EMI|emi|किस्त|क़िस्त)\b',
            r'\b(insurance|bima|बीमा|इंश्योरेंस)\b',
            r'\b(credit\s*card|क्रेडिट\s*कार्ड|क्रेडिट कार्ड)\b',
            r'\b(debit\s*card|डेबिट\s*कार्ड)\b',
            r'\b(gold|सोना|गोल्ड)\b',
            r'\b(stock|share|शेयर|स्टॉक)\b',
            r'\b(PPF|NPS|ELSS|RD|recurring\s*deposit)\b',
            r'\b(investment|निवेश|निवेश)\b',
            r'\b(savings|account|बचत|खाता)\b',
        ]
        
        self.AMOUNT_PATTERNS = [
            # Amount with unit (lakh, crore, k, etc.)
            r'(?:rs\.?|₹|rupees?|रुपए|रुपये|रुपया)?\s*'
            r'\d+(?:\.\d+)?\s*'
            r'(?:lakh|lac|लाख|crore|करोड़|cr|'
            r'thousand|हज़ार|हजार|k|million)',
            # Amount in words (do, teen, etc.)
            r'\b(do|teen|char|paanch|chhe|saat|aath|nau|das)\s+'
            r'(?:lakh|lac|लाख|crore|करोड़|thousand|हज़ार)\b',
            # Rs with numbers
            r'(?:rs\.?|₹|rupees?|रुपए|रुपये)\s*\d+(?:,\d+)*(?:\.\d+)?',
            # Just numbers with k, lakh, crore
            r'\d+(?:,\d+)*(?:\.\d+)?\s*'
            r'(?:lakh|lac|लाख|crore|करोड़|thousand|हज़ार|k)',
            # SIP-style periodic amount mentions
            r'\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:per\s*month|monthly|month|mahina|महीना|महीने)\b',
            r'\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:pm|p\.m\.)\b',
            # Comma-separated numbers
            r'\d+(?:,\d+)+',
        ]
        
        self.DURATION_PATTERNS = [
            r'(\d+)\s*(?:year|yr|साल|वर्ष|years)',
            r'(\d+)\s*(?:month|mahina|महीना|महीने|मास|months)',
            r'(\d+)\s*(?:day|din|दिन|days)',
        ]
        
        self.DECISION_PATTERNS = [
            r'\b(lena\s*hai|lena\s*chahiye|लेना\s*है|लेना\s*चाहिए|'
            r'want\s*to\s*take|going\s*to\s*take|willing)\b',
            r'\b(invest\s*karna|invest\s*करना|निवेश\s*करना)\b',
            r'\b(nahi\s*lena|नहीं\s*लेना|not\s*taking|cancel|avoid)\b',
            r'\b(sochna\s*hai|सोचना\s*है|considering|thinking)\b',
            r'\b(badha\s*dena|बढ़ा\s*देना|increase\s*karna|increase)\b',
            r'\b(band\s*karna|बंद\s*करना|close|stop|discontinue)\b',
            r'\b(apply|open|start|buy|sell|redeem|withdraw|deposit)\b',
        ]
    
    def extract(self, text: str) -> Dict:
        """
        Extract financial entities from text.
        
        Args:
            text: Input text (Hindi, English, or Hinglish)
        
        Returns:
            Dictionary with extracted entities and confidence scores
        """
        print(f'[NER] extracting from: {text}')
        
        if not text or not text.strip():
            return self._empty_result()
        
        text_lower = text.lower()
        
        # Extract using regex patterns
        instruments = []
        for pattern in self.INSTRUMENT_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE | re.UNICODE)
            instruments.extend(matches)
        
        amounts = []
        for pattern in self.AMOUNT_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE | re.UNICODE)
            for match in matches:
                full_match = match.group(0).strip()
                if full_match:
                    amounts.append(full_match)
        
        durations = []
        for pattern in self.DURATION_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE | re.UNICODE)
            durations.extend(matches)
        
        decisions = []
        for pattern in self.DECISION_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE | re.UNICODE)
            decisions.extend(matches)
        
        # Use spaCy for person and org names from English portions
        persons = []
        organizations = []
        if self.nlp:
            doc = self.nlp(text)
            persons = [ent.text for ent in doc.ents if ent.label_ == 'PERSON']
            organizations = [ent.text for ent in doc.ents
                           if ent.label_ in ['ORG', 'GPE']]
        
        # Clean up duplicates and empty strings
        def clean(lst):
            return list(set(
                item.strip() if isinstance(item, str) else str(item)
                for item in lst if (item.strip() if isinstance(item, str) else str(item))
            ))

        def normalize_amount(value: str) -> str:
            cleaned = re.sub(r'\s+', ' ', value).strip()
            cleaned = re.sub(r'^(rs\.?|rupees?|₹)\s*', '', cleaned, flags=re.IGNORECASE)
            return cleaned
        
        instruments = clean(instruments)
        amounts = [normalize_amount(a) for a in clean(amounts)]
        durations = clean(durations)
        decisions = clean(decisions)
        persons = clean(persons)
        organizations = clean(organizations)
        
        result = {
            'instruments': instruments,
            'amounts': amounts,
            'durations': durations,
            'decisions': decisions,
            'persons': persons,
            'organizations': organizations,
            'monetary': amounts,  # Alias
            'topics': instruments,  # Alias
            'confidence_scores': {
                'instruments': 0.9 if instruments else 0.0,
                'amounts': 0.9 if amounts else 0.0,
                'durations': 0.85 if durations else 0.0,
                'decisions': 0.85 if decisions else 0.0,
                'persons': 0.8 if persons else 0.0,
            }
        }
        
        print(f'[NER] extracted: {result}')
        return result
    
    def _empty_result(self) -> Dict:
        """Return empty result dict."""
        return {
            'instruments': [],
            'amounts': [],
            'durations': [],
            'decisions': [],
            'persons': [],
            'organizations': [],
            'monetary': [],
            'topics': [],
            'confidence_scores': {
                'instruments': 0.0,
                'amounts': 0.0,
                'durations': 0.0,
                'decisions': 0.0,
                'persons': 0.0,
            }
        }