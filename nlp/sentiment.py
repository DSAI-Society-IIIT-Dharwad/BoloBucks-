from __future__ import annotations


class SentimentDetector:
    def analyze(self, text: str) -> dict:
        text_lc = (text or "").lower()
        positive_keywords = ["good", "great", "happy", "excellent", "profit", "benefit"]
        negative_keywords = ["bad", "worried", "problem", "loss", "stress", "issue"]

        if any(keyword in text_lc for keyword in positive_keywords):
            return {"sentiment": "positive", "score": 0.8}
        if any(keyword in text_lc for keyword in negative_keywords):
            return {"sentiment": "negative", "score": 0.2}
        return {"sentiment": "neutral", "score": 0.5}