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
});
