import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface SummarySuggestionsScreenProps {
  refreshKey?: number;
}

export function SummarySuggestionsScreen({ refreshKey = 0 }: SummarySuggestionsScreenProps) {
  const [items, setItems] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getConversations(1, 100);
        if (!active) {
          return;
        }
        setItems(response.data || []);
      } catch (err: any) {
        if (!active) {
          return;
        }
        setError(err?.message || 'Failed to load summary and suggestions');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const latestConversation = useMemo(() => {
    if (items.length === 0) {
      return null;
    }

    return [...items].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    })[0];
  }, [items]);

  const summary = useMemo(() => {
    if (!latestConversation) {
      return null;
    }

    const topic = latestConversation.structured_summary.topic || 'financial discussion';
    const decision = latestConversation.structured_summary.decision || 'no final decision yet';
    const nextAction = latestConversation.structured_summary.next_action || 'a follow-up step still needs confirmation';
    const amountText =
      latestConversation.structured_summary.amount_discussed ||
      latestConversation.financial_entities.amounts[0] ||
      'no clear amount mentioned';
    const confidencePercent = Math.round((latestConversation.confidence_score || 0) * 100);
    const sentiment = latestConversation.sentiment || 'neutral';

    return {
      summaryText: `This conversation is mainly about ${topic}. The user discussed ${amountText}, with sentiment trending ${sentiment}. The current decision is ${decision}, and the next step is ${nextAction}.`,
      points: [
        `Topic: ${topic}`,
        `Amount Discussed: ${amountText}`,
        `Decision: ${decision}`,
        `Next Action: ${nextAction}`,
        `Confidence: ${confidencePercent}%`,
      ],
    };
  }, [latestConversation]);

  const suggestions = useMemo(() => {
    if (!latestConversation) {
      return [] as string[];
    }

    const topic = (latestConversation.structured_summary.topic || '').toLowerCase();
    const transcript = (latestConversation.raw_transcript || '').toLowerCase();
    const sentiment = (latestConversation.sentiment || '').toLowerCase();
    const amountText =
      latestConversation.structured_summary.amount_discussed || latestConversation.financial_entities.amounts[0] || '';

    const itemsList = new Set<string>();

    if (topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi')) {
      itemsList.add('Compare interest rates and processing fees before final approval.');
      itemsList.add('Check whether the EMI stays within a comfortable monthly budget.');
      itemsList.add('Keep an emergency fund aside so the loan does not create cash-flow stress.');
    }

    if (topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund')) {
      itemsList.add('Review the risk profile before increasing SIP or investment amounts.');
      itemsList.add('Start with a smaller commitment if the goal is still being refined.');
      itemsList.add('Track the plan for at least one cycle before changing allocation.');
    }

    if (amountText) {
      itemsList.add(`Validate the amount discussed: ${amountText}.`);
    }

    if (sentiment.includes('neg') || transcript.includes('worried') || transcript.includes('stress')) {
      itemsList.add('Address concerns first, then confirm the next action in writing.');
    }

    if (
      (latestConversation.structured_summary.decision || '').toLowerCase().includes('none') ||
      latestConversation.flagged_for_review
    ) {
      itemsList.add('Ask one follow-up question to remove ambiguity before closing the conversation.');
    }

    if (itemsList.size === 0) {
      itemsList.add('Summarize the main point and share a clear next step with the user.');
      itemsList.add('Confirm any amount, timeline, or decision that still needs validation.');
    }

    return Array.from(itemsList).slice(0, 6);
  }, [latestConversation]);

  const loanSuggestions = useMemo(() => {
    if (!latestConversation) {
      return [] as Array<{
        bank: string;
        product: string;
        interestRange: string;
        processingFee: string;
        maxTenure: string;
        why: string;
      }>;
    }

    const topic = (latestConversation.structured_summary.topic || '').toLowerCase();
    const transcript = (latestConversation.raw_transcript || '').toLowerCase();
    const isLoanConversation =
      topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi') || transcript.includes('home loan');

    if (!isLoanConversation) {
      return [];
    }

    const amountText =
      latestConversation.structured_summary.amount_discussed || latestConversation.financial_entities.amounts[0] || transcript;

    const parseAmountInLakhs = (text: string) => {
      const raw = (text || '').toLowerCase();
      const numeric = raw.match(/(\d+(?:\.\d+)?)/);
      if (!numeric) {
        return null;
      }

      const base = Number(numeric[1]);
      if (Number.isNaN(base)) {
        return null;
      }

      if (raw.includes('crore')) {
        return base * 100;
      }
      if (raw.includes('lakh') || raw.includes('lac')) {
        return base;
      }
      if (base >= 100000) {
        return base / 100000;
      }

      return base;
    };

    const requestedLakhs = parseAmountInLakhs(amountText || '');

    const options = [
      {
        bank: 'SBI',
        product: 'Home Loan MaxGain',
        interestRange: '8.40% - 9.15%',
        processingFee: 'Up to 0.35%',
        maxTenureYears: 30,
        maxAmountLakhs: 500,
      },
      {
        bank: 'HDFC Bank',
        product: 'Home Loan Standard',
        interestRange: '8.50% - 9.40%',
        processingFee: 'Up to 0.50%',
        maxTenureYears: 30,
        maxAmountLakhs: 600,
      },
      {
        bank: 'ICICI Bank',
        product: 'Express Home Loan',
        interestRange: '8.75% - 9.50%',
        processingFee: 'Up to 0.50%',
        maxTenureYears: 30,
        maxAmountLakhs: 500,
      },
      {
        bank: 'Axis Bank',
        product: 'Fast Forward Home Loan',
        interestRange: '8.75% - 9.60%',
        processingFee: 'Up to 1.00%',
        maxTenureYears: 30,
        maxAmountLakhs: 400,
      },
    ];

    return options
      .map((option) => {
        const interestLow = Number(option.interestRange.split('%')[0]);
        const feePercent = option.processingFee.includes('1.00') ? 1.0 : option.processingFee.includes('0.50') ? 0.5 : 0.35;

        const amountFit = requestedLakhs ? (option.maxAmountLakhs >= requestedLakhs ? 1 : -2) : 0;
        const score = amountFit - interestLow * 0.3 - feePercent * 0.4 + option.maxTenureYears * 0.02;

        let why = `Competitive rate range and tenure up to ${option.maxTenureYears} years.`;
        if (requestedLakhs && option.maxAmountLakhs >= requestedLakhs) {
          why = `Can support around ${requestedLakhs.toFixed(1)} lakh requirement with manageable tenure options.`;
        } else if (requestedLakhs && option.maxAmountLakhs < requestedLakhs) {
          why = `May need re-check for higher amount requests above ${option.maxAmountLakhs} lakh.`;
        }

        return {
          bank: option.bank,
          product: option.product,
          interestRange: option.interestRange,
          processingFee: option.processingFee,
          maxTenure: `${option.maxTenureYears} years`,
          score,
          why,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ score, ...rest }) => rest);
  }, [latestConversation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Summary and Suggestion</Text>
        <Text style={styles.subtitle}>Quick guidance generated from your latest conversation.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#22c55e" />
          <Text style={styles.muted}>Loading latest conversation...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !latestConversation ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>No conversations found yet.</Text>
        </View>
      ) : (
        <>
          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Conversation Summary</Text>
            <Text style={styles.blockBody}>{summary?.summaryText || 'No summary available.'}</Text>
            {(summary?.points || []).map((point, index) => (
              <Text key={`${point}-${index}`} style={styles.pointLine}>
                {'- '}
                {point}
              </Text>
            ))}
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Suggestion Engine</Text>
            <View style={styles.suggestionWrap}>
              {suggestions.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.suggestionCard}>
                  <Text style={styles.suggestionIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={styles.suggestionText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Loan Suggestion Engine</Text>
            {loanSuggestions.length === 0 ? (
              <Text style={styles.blockBody}>
                Loan recommendations appear when the latest conversation is about loans.
              </Text>
            ) : (
              <View style={styles.loanWrap}>
                {loanSuggestions.map((item, index) => (
                  <View key={`${item.bank}-${index}`} style={styles.loanCard}>
                    <Text style={styles.loanTitle}>{item.bank}</Text>
                    <Text style={styles.loanMeta}>{item.product}</Text>
                    <Text style={styles.loanMeta}>Rate: {item.interestRange}</Text>
                    <Text style={styles.loanMeta}>Processing Fee: {item.processingFee}</Text>
                    <Text style={styles.loanMeta}>Max Tenure: {item.maxTenure}</Text>
                    <Text style={styles.loanWhy}>{item.why}</Text>
                  </View>
                ))}
                <Text style={styles.disclaimerText}>
                  Indicative comparison only. Verify latest rates and eligibility with the bank before deciding.
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1020',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  headerBlock: {
    marginBottom: 6,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 6,
    fontSize: 13,
  },
  centered: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  muted: {
    color: '#94a3b8',
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
  },
  cardBlock: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 14,
    backgroundColor: '#111827',
    padding: 14,
  },
  blockTitle: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  blockBody: {
    color: '#e2e8f0',
    lineHeight: 20,
    marginBottom: 8,
  },
  pointLine: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 2,
  },
  suggestionWrap: {
    gap: 8,
  },
  suggestionCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
  },
  suggestionIndex: {
    color: '#22c55e',
    fontWeight: '800',
    minWidth: 28,
  },
  suggestionText: {
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 20,
  },
  loanWrap: {
    gap: 8,
  },
  loanCard: {
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
    borderRadius: 12,
    padding: 12,
  },
  loanTitle: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  loanMeta: {
    color: '#e2e8f0',
    marginBottom: 2,
  },
  loanWhy: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginTop: 4,
  },
  disclaimerText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
});
