export interface InsightCard {
  conversation_id: string;
  timestamp: string;
  languages_detected: string[];
  raw_transcript: string;
  financial_entities: {
    amounts: string[];
    instruments: string[];
    durations: string[];
    decisions: string[];
    persons: string[];
    confidence_scores: number[];
    sentiment: string[];
    sentiment_score: number;
  };
  structured_summary: {
    topic: string;
    amount_discussed: string | null;
    decision: string | null;
    sentiment: string;
    next_action: string | null;
  };
  sentiment: string;
  confidence_score: number;
  flagged_for_review: boolean;
}
