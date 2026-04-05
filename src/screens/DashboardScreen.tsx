import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface DashboardScreenProps {
  refreshKey?: number;
}

function canonicalizeTopic(rawTopic: string): string {
  const topic = (rawTopic || '').trim();
  const lower = topic.toLowerCase();

  if (!topic || lower === 'unknown') {
    return 'Unknown';
  }

  const isLoan =
    /\bloan\b|\bemi\b|home\s*loan/i.test(topic) ||
    /\u0932\u094b\u0928|\u0915\u0930\u094d\u091c|\u090b\u0923/.test(topic);
  if (isLoan) {
    return 'Loan';
  }

  const isInvestment =
    /\binvest(ment)?\b|\bsip\b|mutual\s*fund/i.test(topic) ||
    /\u0928\u093f\u0935\u0947\u0936|\u090f\u0938\u0906\u0908\u092a\u0940|\u092e\u094d\u092f\u0942\u091a\u0941\u0905\u0932/.test(topic);
  if (isInvestment) {
    return 'Investment';
  }

  const cleaned = topic.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function DashboardScreen({ refreshKey = 0 }: DashboardScreenProps) {
  const [items, setItems] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getConversations(1, 200);
        if (active) {
          setItems(response.data || []);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Failed to load dashboard');
        }
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

  const stats = useMemo(() => {
    const total = items.length;
    const avgConfidence =
      total > 0 ? Math.round((items.reduce((sum, item) => sum + (item.confidence_score || 0), 0) / total) * 100) : 0;

    const sentimentCounts = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    const topicCounts: Record<string, number> = {};

    for (const item of items) {
      const sentiment = (item.sentiment || 'neutral').toLowerCase();
      if (sentiment.includes('pos')) sentimentCounts.positive += 1;
      else if (sentiment.includes('neg')) sentimentCounts.negative += 1;
      else sentimentCounts.neutral += 1;

      const topic = canonicalizeTopic(item.structured_summary.topic || 'unknown');
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }

    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { total, avgConfidence, sentimentCounts, topTopics };
  }, [items]);

  const simplifiedTerms = useMemo(() => {
    if (!latestConversation) {
      return [] as Array<{ term: string; simpleMeaning: string }>;
    }

    const transcript = (latestConversation.raw_transcript || '').toLowerCase();
    const topic = (latestConversation.structured_summary.topic || '').toLowerCase();
    const combined = `${topic} ${transcript}`;

    const glossary: Array<{ term: string; matcher: RegExp; simpleMeaning: string }> = [
      {
        term: 'SIP',
        matcher: /\bsip\b|systematic investment plan/i,
        simpleMeaning: 'Monthly automatic investing, like a savings habit for future goals.',
      },
      {
        term: 'EMI',
        matcher: /\bemi\b|installment/i,
        simpleMeaning: 'The fixed monthly payment you make to repay a loan.',
      },
      {
        term: 'Loan',
        matcher: /\bloan\b|borrow/i,
        simpleMeaning: 'Money you take now and repay over time, usually with extra interest.',
      },
      {
        term: 'Interest Rate',
        matcher: /interest|rate/i,
        simpleMeaning: 'The extra cost charged on borrowed money.',
      },
      {
        term: 'Mutual Fund',
        matcher: /mutual\s*fund/i,
        simpleMeaning: 'A shared investment pool managed by professionals.',
      },
      {
        term: 'Risk Profile',
        matcher: /risk|volatile|volatility/i,
        simpleMeaning: 'How much ups and downs in value you are comfortable handling.',
      },
      {
        term: 'CAGR',
        matcher: /\bcagr\b|compound annual growth/i,
        simpleMeaning: 'How fast money grew each year on average.',
      },
    ];

    const detected = glossary
      .filter((item) => item.matcher.test(combined))
      .map((item) => ({ term: item.term, simpleMeaning: item.simpleMeaning }));

    if (detected.length > 0) {
      return detected.slice(0, 5);
    }

    return [
      {
        term: 'Financial Decision',
        simpleMeaning: 'A money choice about spending, borrowing, or investing.',
      },
      {
        term: 'Next Action',
        simpleMeaning: 'The immediate step to take so the decision becomes clear and practical.',
      },
    ];
  }, [latestConversation]);

  const analogies = useMemo(() => {
    if (simplifiedTerms.length === 0) {
      return [] as string[];
    }

    const analogiesByTerm: Record<string, string> = {
      SIP: 'Think of SIP like setting an auto-transfer to a piggy bank every month, but for investments.',
      EMI: 'An EMI is like paying a monthly subscription until the full price of what you bought is cleared.',
      Loan: 'A loan is like borrowing sugar from a neighbor and returning a little extra as thanks.',
      'Interest Rate': 'Interest is like a rental fee you pay for using someone else\'s money.',
      'Mutual Fund': 'A mutual fund is like a shared basket where many people put money and a manager invests it.',
      'Risk Profile': 'Risk profile is like choosing between a smooth road and a bumpy shortcut for a faster ride.',
      CAGR: 'CAGR is like checking a plant\'s average growth per year instead of daily changes.',
      'Financial Decision': 'A financial decision is like choosing the best route before starting a trip.',
      'Next Action': 'Next action is like your first turn on a map so you do not stay stuck at the start.',
    };

    const built = simplifiedTerms
      .map((item) => analogiesByTerm[item.term])
      .filter((entry): entry is string => Boolean(entry));

    return Array.from(new Set(built)).slice(0, 4);
  }, [simplifiedTerms]);

  const riskDetection = useMemo(() => {
    if (items.length === 0) {
      return {
        score: 0,
        severity: 'Low',
        summary: 'No risk signals detected yet.',
        signals: [] as string[],
        explanation: 'No conversations available, so risk factors have not been triggered yet.',
        breakdown: [] as Array<{ label: string; points: number; share: number }>,
        recommendation: 'Process more conversations to generate a reliable risk profile.',
      };
    }

    const recentItems = [...items]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    let weightedRisk = 0;
    const triggeredSignals = new Set<string>();
    const factorTotals = {
      flagged: 0,
      lowConfidence: 0,
      moderateConfidence: 0,
      negativeSentiment: 0,
      loanExposure: 0,
      unclearDecision: 0,
      missingAmount: 0,
      baseline: 0,
    };

    for (const item of recentItems) {
      let itemRisk = 10;
      factorTotals.baseline += 10;

      const sentiment = (item.sentiment || '').toLowerCase();
      const topic = (item.structured_summary.topic || '').toLowerCase();
      const transcript = (item.raw_transcript || '').toLowerCase();
      const decision = (item.structured_summary.decision || '').toLowerCase();
      const nextAction = (item.structured_summary.next_action || '').toLowerCase();
      const confidence = Number(item.confidence_score || 0);

      if (item.flagged_for_review) {
        itemRisk += 25;
        factorTotals.flagged += 25;
        triggeredSignals.add('Flagged conversations require manual review');
      }

      if (confidence < 0.45) {
        itemRisk += 20;
        factorTotals.lowConfidence += 20;
        triggeredSignals.add('Low confidence extraction in recent conversations');
      } else if (confidence < 0.7) {
        itemRisk += 10;
        factorTotals.moderateConfidence += 10;
      }

      if (sentiment.includes('neg') || transcript.includes('stress') || transcript.includes('worried')) {
        itemRisk += 15;
        factorTotals.negativeSentiment += 15;
        triggeredSignals.add('Negative or stressed sentiment detected');
      }

      if (topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi')) {
        itemRisk += 10;
        factorTotals.loanExposure += 10;
        triggeredSignals.add('Loan-related exposure present');
      }

      if (decision.includes('none') || decision.includes('unknown') || nextAction.includes('manual review')) {
        itemRisk += 12;
        factorTotals.unclearDecision += 12;
        triggeredSignals.add('Ambiguous decision or unclear next action');
      }

      const hasAmount =
        Boolean(item.structured_summary.amount_discussed) ||
        (Array.isArray(item.financial_entities?.amounts) && item.financial_entities.amounts.length > 0);

      if (!hasAmount) {
        itemRisk += 8;
        factorTotals.missingAmount += 8;
        triggeredSignals.add('Amount details are missing in some conversations');
      }

      weightedRisk += Math.min(100, itemRisk);
    }

    const score = Math.round(weightedRisk / recentItems.length);

    const severity = score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
    const summary =
      severity === 'High'
        ? 'Portfolio conversations show elevated risk indicators.'
        : severity === 'Medium'
          ? 'Moderate risk indicators detected; review important cases.'
          : 'Risk indicators are currently in a stable range.';

    const recommendation =
      severity === 'High'
        ? 'Prioritize flagged conversations, validate missing amounts, and confirm decision clarity before proceeding.'
        : severity === 'Medium'
          ? 'Review low-confidence conversations and confirm next actions to reduce ambiguity.'
          : 'Continue monitoring and keep decision/amount confirmations consistent.';

    const totalRiskPoints = Math.max(1, weightedRisk);
    const breakdown = [
      { label: 'Flagged conversations', points: factorTotals.flagged },
      { label: 'Low confidence extraction', points: factorTotals.lowConfidence + factorTotals.moderateConfidence },
      { label: 'Negative/stress sentiment', points: factorTotals.negativeSentiment },
      { label: 'Loan/EMI exposure', points: factorTotals.loanExposure },
      { label: 'Unclear decisions/actions', points: factorTotals.unclearDecision },
      { label: 'Missing amount details', points: factorTotals.missingAmount },
    ]
      .filter((factor) => factor.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 4)
      .map((factor) => ({
        ...factor,
        share: Math.round((factor.points / totalRiskPoints) * 100),
      }));

    const explanation =
      breakdown.length === 0
        ? 'Risk is mostly baseline because no strong risk factor is dominating recent conversations.'
        : `Risk is elevated mainly due to ${breakdown
            .slice(0, 2)
            .map((factor) => `${factor.label.toLowerCase()} (${factor.share}%)`)
            .join(' and ')}.`;

    return {
      score,
      severity,
      summary,
      signals: Array.from(triggeredSignals).slice(0, 5),
      explanation,
      breakdown,
      recommendation,
    };
  }, [items]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>A live snapshot of your conversation analysis.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#22c55e" />
          <Text style={styles.hint}>Loading dashboard...</Text>
        </View>
      ) : null}

      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error ? (
        <>
          <View style={styles.row}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Conversations</Text>
              <Text style={styles.cardValue}>{stats.total}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Avg Confidence</Text>
              <Text style={styles.cardValue}>{stats.avgConfidence}%</Text>
            </View>
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Sentiments</Text>
            <Text style={styles.blockBody}>Positive: {stats.sentimentCounts.positive}</Text>
            <Text style={styles.blockBody}>Neutral: {stats.sentimentCounts.neutral}</Text>
            <Text style={styles.blockBody}>Negative: {stats.sentimentCounts.negative}</Text>
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Top Topics</Text>
            {stats.topTopics.length === 0 ? (
              <Text style={styles.blockBody}>No topic data yet.</Text>
            ) : (
              stats.topTopics.map(([topic, count]) => (
                <Text key={topic} style={styles.blockBody}>
                  {topic}: {count}
                </Text>
              ))
            )}
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Jargon-to-Simple Translator</Text>
            {!latestConversation ? (
              <Text style={styles.blockBody}>No conversation available yet.</Text>
            ) : (
              simplifiedTerms.map((item) => (
                <View key={item.term} style={styles.simpleCard}>
                  <Text style={styles.simpleTerm}>{item.term}</Text>
                  <Text style={styles.simpleMeaning}>{item.simpleMeaning}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Analogy Engine</Text>
            {!latestConversation ? (
              <Text style={styles.blockBody}>No conversation available yet.</Text>
            ) : (
              analogies.map((analogy, index) => (
                <View key={`${analogy}-${index}`} style={styles.analogyCard}>
                  <Text style={styles.analogyIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={styles.analogyText}>{analogy}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Risk Detection</Text>
            <View style={styles.riskHeader}>
              <Text style={styles.riskLabel}>Risk Severity: {riskDetection.severity}</Text>
              <Text
                style={[
                  styles.riskValue,
                  riskDetection.score >= 70
                    ? styles.riskHigh
                    : riskDetection.score >= 40
                      ? styles.riskMedium
                      : styles.riskLow,
                ]}
              >
                {riskDetection.score}%
              </Text>
            </View>

            <View style={styles.riskBarTrack}>
              <View style={[styles.riskBarFill, { width: `${Math.max(2, riskDetection.score)}%` }]} />
            </View>

            <Text style={styles.blockBody}>{riskDetection.summary}</Text>

            {riskDetection.signals.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Detected Signals</Text>
                {riskDetection.signals.map((signal, index) => (
                  <Text key={`${signal}-${index}`} style={styles.blockBody}>
                    - {signal}
                  </Text>
                ))}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Risk Explanation</Text>
            <Text style={styles.sectionBody}>{riskDetection.explanation}</Text>
            {riskDetection.breakdown.map((factor) => (
              <View key={factor.label} style={styles.riskBreakdownRow}>
                <Text style={styles.riskBreakdownLabel}>{factor.label}</Text>
                <Text style={styles.riskBreakdownValue}>{factor.share}%</Text>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Recommendation</Text>
            <Text style={styles.sectionBody}>{riskDetection.recommendation}</Text>
          </View>

        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
  },
  content: {
    padding: 12,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  hint: {
    color: '#9ca3af',
    marginTop: 8,
  },
  error: {
    color: '#f87171',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    marginRight: 8,
  },
  cardLabel: {
    color: '#94a3b8',
    marginBottom: 4,
  },
  cardValue: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  cardBlock: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  blockTitle: {
    color: '#22c55e',
    fontWeight: '700',
    marginBottom: 8,
  },
  blockBody: {
    color: '#e2e8f0',
    marginBottom: 4,
  },
  simpleCard: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 12,
    backgroundColor: '#111827',
    padding: 12,
    marginBottom: 8,
  },
  simpleTerm: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  simpleMeaning: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  analogyCard: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 12,
    backgroundColor: '#0b1220',
    padding: 12,
    marginBottom: 8,
  },
  analogyIndex: {
    color: '#22c55e',
    fontWeight: '800',
    minWidth: 28,
  },
  analogyText: {
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 20,
  },
  intelligenceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  exportButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    color: '#22c55e',
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '700',
  },
  sectionBody: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  trafficCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
    marginTop: 6,
  },
  trafficDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    marginTop: 4,
  },
  trafficGood: {
    backgroundColor: '#22c55e',
  },
  trafficCaution: {
    backgroundColor: '#f59e0b',
  },
  trafficDanger: {
    backgroundColor: '#ef4444',
  },
  trafficContent: {
    flex: 1,
  },
  trafficTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    marginBottom: 4,
  },
  storyCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
  },
  storyLabel: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  storyText: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  compareCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
  },
  compareBefore: {
    color: '#fca5a5',
    lineHeight: 20,
  },
  compareArrow: {
    color: '#94a3b8',
    marginVertical: 4,
  },
  compareAfter: {
    color: '#86efac',
    lineHeight: 20,
  },
  suggestionWrap: {
    marginTop: 6,
    gap: 8,
  },
  suggestionCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
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
  qaWrap: {
    marginTop: 6,
    gap: 8,
    marginBottom: 4,
  },
  qaCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#314155',
    backgroundColor: '#0b1220',
  },
  qaQuestionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  questionDot: {
    color: '#38bdf8',
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  questionText: {
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 20,
  },
  qaAnswerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  answerLabel: {
    color: '#22c55e',
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  answerText: {
    color: '#cbd5e1',
    flex: 1,
    lineHeight: 20,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  riskLabel: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  riskValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  riskHigh: {
    color: '#ef4444',
  },
  riskMedium: {
    color: '#f59e0b',
  },
  riskLow: {
    color: '#22c55e',
  },
  riskBarTrack: {
    width: '100%',
    height: 12,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    overflow: 'hidden',
    marginBottom: 10,
  },
  riskBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  riskBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  riskBreakdownLabel: {
    color: '#cbd5e1',
    flex: 1,
    paddingRight: 8,
  },
  riskBreakdownValue: {
    color: '#f8fafc',
    fontWeight: '700',
  },
});
