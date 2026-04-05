import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface HistoryScreenProps {
  refreshKey?: number;
  focusConversationId?: string | null;
}

export function HistoryScreen({ refreshKey = 0, focusConversationId = null }: HistoryScreenProps) {
  const [items, setItems] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        setError(err?.message || 'Failed to load history');
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

  useEffect(() => {
    if (!focusConversationId) {
      return;
    }
    setSelectedId(focusConversationId);
  }, [focusConversationId]);

  useEffect(() => {
    if (selectedId) {
      return;
    }
    if (items.length > 0) {
      setSelectedId(items[0].conversation_id);
    }
  }, [items, selectedId]);

  const selected = useMemo(
    () => items.find((item) => item.conversation_id === selectedId) || null,
    [items, selectedId]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>History</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#22c55e" />
          <Text style={styles.hint}>Loading conversations...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {!loading && !error ? (
        <View style={styles.body}>
          <ScrollView style={styles.listPanel} contentContainerStyle={styles.listPanelContent}>
            {items.length === 0 ? <Text style={styles.hint}>No conversations yet.</Text> : null}
            {items.map((item) => {
              const active = item.conversation_id === selectedId;
              return (
                <Pressable
                  key={item.conversation_id}
                  style={[styles.item, active ? styles.itemActive : null]}
                  onPress={() => setSelectedId(item.conversation_id)}
                >
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.structured_summary.topic || 'unknown'}
                  </Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {item.raw_transcript || 'No transcript'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.detailPanel}>
            {!selected ? (
              <Text style={styles.hint}>Select a conversation to view details.</Text>
            ) : (
              <ScrollView>
                <Text style={styles.detailHeading}>{selected.structured_summary.topic || 'unknown'}</Text>
                <Text style={styles.detailMeta}>Sentiment: {selected.sentiment}</Text>
                <Text style={styles.detailMeta}>
                  Confidence: {Math.round((selected.confidence_score || 0) * 100)}%
                </Text>
                <Text style={styles.sectionTitle}>Decision</Text>
                <Text style={styles.sectionBody}>{selected.structured_summary.decision || 'None'}</Text>
                <Text style={styles.sectionTitle}>Next Action</Text>
                <Text style={styles.sectionBody}>{selected.structured_summary.next_action || 'None'}</Text>
                <Text style={styles.sectionTitle}>Transcript</Text>
                <Text style={styles.sectionBody}>{selected.raw_transcript || 'No transcript'}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 12,
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
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  listPanel: {
    flex: 1,
    marginRight: 12,
  },
  listPanelContent: {
    paddingBottom: 20,
  },
  item: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  itemActive: {
    borderColor: '#22c55e',
  },
  itemTitle: {
    color: '#f9fafb',
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
  },
  detailPanel: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 14,
  },
  detailHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 8,
  },
  detailMeta: {
    color: '#a5b4fc',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#22c55e',
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  sectionBody: {
    color: '#e5e7eb',
    lineHeight: 20,
  },
});
