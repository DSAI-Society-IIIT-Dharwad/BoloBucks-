import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface DashboardScreenProps {
  refreshKey?: number;
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

      const topic = (item.structured_summary.topic || 'unknown').trim() || 'unknown';
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
});
