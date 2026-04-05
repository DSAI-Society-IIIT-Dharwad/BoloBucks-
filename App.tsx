import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ThemeProvider } from './src/theme/ThemeContext';
import { RecordScreen } from './src/screens/RecordScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';

type TabId = 'record' | 'history' | 'dashboard';

export default function App() {
  const [tab, setTab] = useState<TabId>('record');
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusConversationId, setFocusConversationId] = useState<string | null>(null);

  const navigationStub = useMemo(
    () => ({
      navigate: (_routeName: string, params?: any) => {
        const conversationId =
          params?.params?.conversationId || params?.conversationId || null;
        if (conversationId) {
          setFocusConversationId(String(conversationId));
        }
        setRefreshKey((prev) => prev + 1);
        setTab('history');
      },
    }),
    []
  );

  return (
    <ThemeProvider>
      <SafeAreaView style={styles.safeRoot}>
        <View style={styles.appRoot}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>Armour.AI</Text>
              <Text style={styles.tagline}>Record conversations, review insights, track trends</Text>
            </View>
            <View style={styles.headerPill}>
              <Text style={styles.headerPillDot}>●</Text>
              <Text style={styles.headerPillText}>Live web test</Text>
            </View>
          </View>

          <View style={styles.contentShell}>
            <View style={styles.content}>
              {tab === 'record' ? <RecordScreen navigation={navigationStub} /> : null}
              {tab === 'history' ? (
                <HistoryScreen refreshKey={refreshKey} focusConversationId={focusConversationId} />
              ) : null}
              {tab === 'dashboard' ? <DashboardScreen refreshKey={refreshKey} /> : null}
            </View>
          </View>

          <View style={styles.tabBar}>
            <TabButton
              label="Record"
              icon="mic"
              active={tab === 'record'}
              onPress={() => setTab('record')}
            />
            <TabButton
              label="History"
              icon="clock"
              active={tab === 'history'}
              onPress={() => setTab('history')}
            />
            <TabButton
              label="Dashboard"
              icon="grid"
              active={tab === 'dashboard'}
              onPress={() => setTab('dashboard')}
            />
          </View>
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tabButton, active ? styles.tabButtonActive : null]} onPress={onPress}>
      <Text style={[styles.tabIcon, active ? styles.tabTextActive : null]}>{icon}</Text>
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: '#050816',
  },
  appRoot: {
    flex: 1,
    backgroundColor: '#050816',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brand: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tagline: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 13,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  headerPillText: {
    color: '#d1fae5',
    fontWeight: '600',
    fontSize: 12,
  },
  headerPillDot: {
    color: '#22c55e',
    fontSize: 14,
    marginTop: -1,
  },
  contentShell: {
    flex: 1,
    backgroundColor: '#0a1020',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#182235',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 5,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#182235',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 18,
    marginTop: 12,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 14,
    gap: 4,
  },
  tabIcon: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tabButtonActive: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  tabText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#22c55e',
  },
});
