from __future__ import annotations


class FinanceClassifier:
    def predict(self, text: str) -> dict:
        text_lc = (text or "").lower()
        financial_keywords = [
            "loan",
            "emi",
            "sip",
            "investment",
            "invest",
            "insurance",
            "mutual fund",
            "stock",
            "equity",
            "lakh",
            "crore",
            "रुपये",
            "लोन",
            "निवेश",
            "सिप",
        ]
        is_financial = any(keyword in text_lc for keyword in financial_keywords)
        return {
            "is_financial": is_financial,
            "confidence": 0.9 if is_financial else 0.3,
            "prediction": "financial" if is_financial else "non_financial",
        }