import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface ProfileScreenProps {
  email?: string;
}

type SectionId = 'account' | 'credentials' | 'stats' | 'files' | 'devices';

interface DeviceItem {
  id: string;
  name: string;
  status: string;
}

export function ProfileScreen({ email = '' }: ProfileScreenProps) {
  const [name, setName] = useState('Rohin');
  const [username, setUsername] = useState('rohin_user');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialMessage, setCredentialMessage] = useState('');
  const [credentialError, setCredentialError] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<InsightCard[]>([]);
  const [savedFiles, setSavedFiles] = useState<string[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([
    { id: 'device-1', name: 'Rohin Android Phone', status: 'Active now' },
    { id: 'device-2', name: 'Web Browser (LAN)', status: 'Last active 3 min ago' },
    { id: 'device-3', name: 'Windows Development Machine', status: 'Active now' },
  ]);
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    account: true,
    credentials: true,
    stats: false,
    files: false,
    devices: false,
  });

  useEffect(() => {
    if (!email) {
      return;
    }

    const localPart = email.split('@')[0] || 'user';
    const prettified = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    setName(prettified || 'User');
    setUsername(localPart.toLowerCase());
  }, [email]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [conversationResponse, files] = await Promise.all([
          getConversations(1, 200),
          FileSystem.documentDirectory
            ? FileSystem.readDirectoryAsync(FileSystem.documentDirectory)
            : Promise.resolve([] as string[]),
        ]);

        if (!active) {
          return;
        }

        const sortedConversations = [...(conversationResponse.data || [])].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setConversations(sortedConversations);
        setSavedFiles((files || []).slice(0, 12));
      } catch (err: any) {
        if (!active) {
          return;
        }
        setError(err?.message || 'Failed to load profile details');
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
  }, []);

  const stats = useMemo(() => {
    const total = conversations.length;
    const flagged = conversations.filter((item) => item.flagged_for_review).length;
    const avgConfidence =
      total > 0 ? Math.round((conversations.reduce((sum, item) => sum + (item.confidence_score || 0), 0) / total) * 100) : 0;

    return { total, flagged, avgConfidence };
  }, [conversations]);

  const toggleSection = (sectionId: SectionId) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleSaveCredentials = () => {
    setCredentialError('');
    setCredentialMessage('');

    if (!username.trim()) {
      setCredentialError('Username cannot be empty.');
      return;
    }

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        setCredentialError('Please enter current password.');
        return;
      }
      if (newPassword.length < 4) {
        setCredentialError('New password must be at least 4 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setCredentialError('New password and confirm password do not match.');
        return;
      }
    }

    setCredentialMessage('Username/password updated successfully for this session.');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => prev.filter((device) => device.id !== id));
  };

  const renderSectionHeader = (sectionId: SectionId, title: string) => (
    <Pressable style={styles.sectionHeader} onPress={() => toggleSection(sectionId)}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <MaterialCommunityIcons
        name={openSections[sectionId] ? 'chevron-up' : 'chevron-down'}
        size={20}
        color="#22c55e"
      />
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Manage account, credentials, files, and connected devices.</Text>

      <View style={styles.card}>
        {renderSectionHeader('account', 'Account')}
        {openSections.account ? (
          <>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter your name" placeholderTextColor="#64748b" />

            <Text style={styles.label}>Email ID</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email || 'Not provided'}
              editable={false}
              placeholderTextColor="#64748b"
            />
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        {renderSectionHeader('credentials', 'Edit Username & Password')}
        {openSections.credentials ? (
          <>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Enter username" placeholderTextColor="#64748b" autoCapitalize="none" />

            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="Enter current password"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Enter new password"
              placeholderTextColor="#64748b"
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm new password"
              placeholderTextColor="#64748b"
            />

            {credentialError ? <Text style={styles.error}>{credentialError}</Text> : null}
            {credentialMessage ? <Text style={styles.success}>{credentialMessage}</Text> : null}

            <Pressable style={styles.actionButton} onPress={handleSaveCredentials}>
              <Text style={styles.actionButtonText}>Save Credentials</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        {renderSectionHeader('stats', 'Conversation Stats')}
        {openSections.stats ? (
          loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#22c55e" />
              <Text style={styles.muted}>Loading profile stats...</Text>
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <>
              <Text style={styles.valueLine}>Total Conversations: {stats.total}</Text>
              <Text style={styles.valueLine}>Flagged Cases: {stats.flagged}</Text>
              <Text style={styles.valueLine}>Average Confidence: {stats.avgConfidence}%</Text>
            </>
          )
        ) : null}
      </View>

      <View style={styles.card}>
        {renderSectionHeader('files', 'Saved Files')}
        {openSections.files ? (
          loading ? (
            <Text style={styles.muted}>Loading saved files...</Text>
          ) : savedFiles.length === 0 ? (
            <Text style={styles.muted}>No saved files found in app storage.</Text>
          ) : (
            savedFiles.map((fileName, index) => (
              <Text key={`${fileName}-${index}`} style={styles.fileLine}>
                - {fileName}
              </Text>
            ))
          )
        ) : null}
      </View>

      <View style={styles.card}>
        {renderSectionHeader('devices', 'Device Management')}
        {openSections.devices ? (
          devices.length === 0 ? (
            <Text style={styles.muted}>No connected devices.</Text>
          ) : (
            devices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceStatus}>{device.status}</Text>
                </View>
                <Pressable style={styles.removeButton} onPress={() => handleRemoveDevice(device.id)}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )
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
    gap: 12,
    paddingBottom: 24,
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
    borderRadius: 14,
    backgroundColor: '#111827',
    padding: 12,
  },
  sectionTitle: {
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#cbd5e1',
    marginBottom: 6,
    marginTop: 4,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 10,
    backgroundColor: '#0b1220',
    color: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputDisabled: {
    color: '#94a3b8',
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  muted: {
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
    marginTop: 8,
  },
  success: {
    color: '#22c55e',
    marginTop: 8,
  },
  valueLine: {
    color: '#cbd5e1',
    marginBottom: 4,
  },
  actionButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16a34a',
  },
  actionButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  fileLine: {
    color: '#cbd5e1',
    marginBottom: 4,
  },
  deviceRow: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 10,
    backgroundColor: '#0b1220',
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#e2e8f0',
    fontWeight: '700',
    marginBottom: 2,
  },
  deviceStatus: {
    color: '#94a3b8',
    fontSize: 12,
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#3b0a0a',
  },
  removeButtonText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
  },
});
