import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemeProvider } from './src/theme/ThemeContext';
import { RecordScreen } from './src/screens/RecordScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SummarySuggestionsScreen } from './src/screens/SummarySuggestionsScreen';

type TabId = 'record' | 'history' | 'dashboard' | 'summary';

export default function App() {
  const [tab, setTab] = useState<TabId>('record');
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusConversationId, setFocusConversationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTranslateX = useRef(new Animated.Value(-320)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerTranslateX, {
      toValue: 0,
      duration: 230,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerTranslateX, {
      toValue: -320,
      duration: 210,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setDrawerOpen(false);
      }
    });
  };

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
            <View style={styles.headerLeft}>
              <Pressable
                style={styles.menuButton}
                onPress={drawerOpen ? closeDrawer : openDrawer}
                accessibilityRole="button"
                accessibilityLabel="Open navigation drawer"
              >
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
              </Pressable>

              <View>
                <Text style={styles.brand}>Armour.AI</Text>
                <Text style={styles.tagline}>Record conversations, review insights, track trends</Text>
              </View>
            </View>
            <View style={styles.headerPill}>
              <Text style={styles.headerPillDot}>●</Text>
              <Text style={styles.headerPillText}>Live web test</Text>
            </View>
          </View>

          {drawerOpen ? (
            <View style={styles.drawerOverlay}>
              <Pressable style={styles.backdrop} onPress={closeDrawer} />
              <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerTranslateX }] }]}>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle}>Navigation</Text>
                  <Pressable onPress={closeDrawer} style={styles.drawerCloseButton}>
                    <MaterialCommunityIcons name="close" size={20} color="#cbd5e1" />
                  </Pressable>
                </View>

                <DrawerItem
                  icon="microphone"
                  label="Record"
                  active={tab === 'record'}
                  onPress={() => {
                    setTab('record');
                    closeDrawer();
                  }}
                />
                <DrawerItem
                  icon="clock-outline"
                  label="History"
                  active={tab === 'history'}
                  onPress={() => {
                    setTab('history');
                    closeDrawer();
                  }}
                />
                <DrawerItem
                  icon="view-grid-outline"
                  label="Dashboard"
                  active={tab === 'dashboard'}
                  onPress={() => {
                    setTab('dashboard');
                    closeDrawer();
                  }}
                />
                <DrawerItem
                  icon="text-box-search-outline"
                  label="Summary and Suggestion"
                  active={tab === 'summary'}
                  onPress={() => {
                    setTab('summary');
                    closeDrawer();
                  }}
                />
              </Animated.View>
            </View>
          ) : null}

          <View style={styles.contentShell}>
            <View style={styles.content}>
              {tab === 'record' ? <RecordScreen navigation={navigationStub} /> : null}
              {tab === 'history' ? (
                <HistoryScreen refreshKey={refreshKey} focusConversationId={focusConversationId} />
              ) : null}
              {tab === 'dashboard' ? <DashboardScreen refreshKey={refreshKey} /> : null}
              {tab === 'summary' ? <SummarySuggestionsScreen refreshKey={refreshKey} /> : null}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ThemeProvider>
  );
}

function DrawerItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.drawerItem, active ? styles.drawerItemActive : null]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color={active ? '#22c55e' : '#cbd5e1'} />
      <Text style={[styles.drawerItemText, active ? styles.drawerItemTextActive : null]}>{label}</Text>
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
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(3, 8, 20, 0.52)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 3,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  menuLine: {
    width: 18,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'flex-start',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '62%',
    maxWidth: 280,
    paddingTop: 56,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderColor: '#223047',
    backgroundColor: '#0b1220',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  drawerTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  drawerCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  drawerItemActive: {
    backgroundColor: '#111827',
  },
  drawerItemText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 14,
  },
  drawerItemTextActive: {
    color: '#22c55e',
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
});
