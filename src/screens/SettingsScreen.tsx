import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type SettingsItemId = 'help' | 'terms' | 'privacy';

export function SettingsScreen() {
  const [activeInfo, setActiveInfo] = useState<SettingsItemId | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Manage legal info, support, and account actions.</Text>

      <View style={styles.card}>
        <Pressable
          style={styles.rowButton}
          onPress={() => setActiveInfo((prev) => (prev === 'help' ? null : 'help'))}
        >
          <Text style={styles.rowLabel}>Help and Support</Text>
          <Text style={styles.rowArrow}>{activeInfo === 'help' ? '⌃' : '⌄'}</Text>
        </Pressable>
        {activeInfo === 'help' ? (
          <View style={styles.dropdownBody}>
            <Text style={styles.infoBody}>
              Help & Support: Contact support@armour-ai.app or call 9632700164 for assistance. Include your device type,
              timestamp, and issue details for faster resolution.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={styles.rowButton}
          onPress={() => setActiveInfo((prev) => (prev === 'terms' ? null : 'terms'))}
        >
          <Text style={styles.rowLabel}>Terms and Conditions</Text>
          <Text style={styles.rowArrow}>{activeInfo === 'terms' ? '⌃' : '⌄'}</Text>
        </Pressable>
        {activeInfo === 'terms' ? (
          <View style={styles.dropdownBody}>
            <Text style={styles.infoBody}>
              Terms & Conditions:{'\n'}
              1. Insights are advisory and do not replace professional financial/legal advice.{"\n"}
              2. You are responsible for verifying all amounts, recommendations, and decisions before action.{"\n"}
              3. Do not upload unlawful, abusive, or unauthorized content.{"\n"}
              4. Service features may be updated over time; continuing use implies acceptance of updated terms.{"\n"}
              5. Armour.AI is not liable for losses from decisions made without independent verification.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.rowButton, styles.rowButtonLast]}
          onPress={() => setActiveInfo((prev) => (prev === 'privacy' ? null : 'privacy'))}
        >
          <Text style={styles.rowLabel}>Privacy Policy</Text>
          <Text style={styles.rowArrow}>{activeInfo === 'privacy' ? '⌃' : '⌄'}</Text>
        </Pressable>
        {activeInfo === 'privacy' ? (
          <View style={[styles.dropdownBody, styles.dropdownBodyLast]}>
            <Text style={styles.infoBody}>
              Privacy Policy:{'\n'}
              1. Audio and transcripts are processed to generate conversation insights and summaries.{"\n"}
              2. Only required metadata is retained based on configured retention settings.{"\n"}
              3. Access is limited to authorized app flows and protected by environment-level controls.{"\n"}
              4. You can request deletion of local app data by clearing stored conversations/files from the app.{"\n"}
              5. Support contact for privacy queries: support@armour-ai.app.
            </Text>
          </View>
        ) : null}
      </View>

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
    paddingBottom: 26,
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  subtitle: {
    color: '#94a3b8',
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingVertical: 4,
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  rowButtonLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  rowArrow: {
    color: '#94a3b8',
    fontSize: 20,
    marginTop: -2,
  },
  dropdownBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  dropdownBodyLast: {
    borderBottomWidth: 0,
  },
  infoBody: {
    color: '#cbd5e1',
    lineHeight: 20,
  },
});
