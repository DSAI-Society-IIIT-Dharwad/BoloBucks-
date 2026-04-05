import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <View style={styles.appRoot}>
        <View style={styles.content}>
          {tab === 'record' ? <RecordScreen navigation={navigationStub} /> : null}
          {tab === 'history' ? (
            <HistoryScreen refreshKey={refreshKey} focusConversationId={focusConversationId} />
          ) : null}
          {tab === 'dashboard' ? <DashboardScreen refreshKey={refreshKey} /> : null}
        </View>

        <View style={styles.tabBar}>
          <TabButton label="Record" active={tab === 'record'} onPress={() => setTab('record')} />
          <TabButton label="History" active={tab === 'history'} onPress={() => setTab('history')} />
          <TabButton
            label="Dashboard"
            active={tab === 'dashboard'}
            onPress={() => setTab('dashboard')}
          />
        </View>
      </View>
    </ThemeProvider>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tabButton, active ? styles.tabButtonActive : null]} onPress={onPress}>
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  tabText: {
    color: '#9ca3af',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#22c55e',
  },
});
