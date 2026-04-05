import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import { uploadAudio } from '../api/conversations';
import { useTheme } from '../theme/ThemeContext';

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

export function RecordScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { colors } = theme;
  
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isActionInFlight, setIsActionInFlight] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const deviceIdRef = useRef<string>('');
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Get device ID on mount
  useEffect(() => {
    const getDeviceId = async () => {
      const id = Device.deviceId || Device.deviceName || 'unknown-device';
      deviceIdRef.current = id;
    };
    getDeviceId();
  }, []);

  // Ensure recorder instances are always cleaned up when the screen unmounts.
  useEffect(() => {
    return () => {
      const activeRecording = recordingRef.current;
      if (activeRecording) {
        activeRecording.stopAndUnloadAsync().catch(() => {
          // No-op: best-effort cleanup.
        });
      }
      recordingRef.current = null;
    };
  }, []);

  // Timer effect for elapsed time
  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state]);

  // Pulsing animation effect
  useEffect(() => {
    if (state === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  const cleanupActiveRecording = async () => {
    const activeRecording = recordingRef.current || recording;
    if (!activeRecording) {
      return;
    }

    try {
      await activeRecording.stopAndUnloadAsync();
    } catch {
      // Ignore cleanup errors and continue with a fresh recorder.
    } finally {
      recordingRef.current = null;
      setRecording(null);
    }
  };

  const handleStartRecording = async () => {
    if (state === 'recording' || state === 'processing' || isActionInFlight || isUploading) {
      return;
    }

    try {
      setIsActionInFlight(true);
      setErrorMessage('');

      // Always release any stale recorder before creating a new one.
      await cleanupActiveRecording();

      // Request permissions
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setState('error');
        setErrorMessage('Microphone permission denied');
        return;
      }

      // Create recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = newRecording;
      setRecording(newRecording);
      setElapsedTime(0);
      setState('recording');
    } catch (error: any) {
      setState('error');
      setErrorMessage(`Failed to start recording: ${error.message}`);
      recordingRef.current = null;
      setRecording(null);
    } finally {
      setIsActionInFlight(false);
    }
  };

  const handleStopRecording = async () => {
    if (isActionInFlight) {
      return;
    }

    const activeRecording = recordingRef.current || recording;
    if (!activeRecording) {
      setState('error');
      setErrorMessage('No recording found');
      return;
    }

    try {
      setIsActionInFlight(true);
      setState('processing');
      await activeRecording.stopAndUnloadAsync();

      const uri = activeRecording.getURI();
      recordingRef.current = null;
      setRecording(null);

      if (!uri) {
        setState('error');
        setErrorMessage('Failed to get recording URI');
        return;
      }

      // Prepare upload data
      const recordedAt = new Date().toISOString();
      const deviceId = deviceIdRef.current;

      // Upload audio
      const response = await uploadAudio(uri, deviceId, recordedAt);

      // Success - navigate to insight screen
      setState('idle');

      // Navigate to InsightScreen with the conversation ID
      navigation.navigate('History', {
        screen: 'Insight',
        params: {
          conversationId: response.conversation_id,
        },
      });
    } catch (error: any) {
      setState('error');
      setErrorMessage(
        error.message || 'Failed to upload recording. Please try again.'
      );
      recordingRef.current = null;
      setRecording(null);
    } finally {
      setIsActionInFlight(false);
    }
  };

  const handleUploadAudio = async () => {
    if (state === 'recording' || state === 'processing' || isUploading) {
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage('');

      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const selectedFile = result.assets?.[0];
      if (!selectedFile?.uri) {
        setState('error');
        setErrorMessage('No audio file was selected');
        return;
      }

      const response = await uploadAudio(
        selectedFile.uri,
        deviceIdRef.current,
        new Date().toISOString()
      );

      if (!response.conversation_id) {
        throw new Error('Backend did not return a conversation id');
      }

      setState('idle');
      setErrorMessage('');

      navigation.navigate('History', {
        screen: 'Insight',
        params: {
          conversationId: response.conversation_id,
        },
      });
    } catch (error: any) {
      console.error('Failed to upload audio from device:', error);
      setState('error');
      setErrorMessage(error?.message || 'Failed to upload audio from device');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = () => {
    cleanupActiveRecording().catch(() => {
      // No-op: UI reset should still proceed.
    });
    setState('idle');
    setErrorMessage('');
    setElapsedTime(0);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      scrollEnabled={false}
    >
      {/* Privacy Card - Condensed */}
      <View style={[styles.privacyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.privacyHeader}>
          <Feather name="shield" size={16} color={colors.accent} />
          <Text style={[styles.privacyTitle, { color: colors.text }]}>Your privacy is protected</Text>
        </View>
        <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
          Recording starts when you tap. Audio is processed and deleted. Only insights are stored, encrypted on your device.
        </Text>
      </View>

      {/* Record Button Section */}
      <View style={styles.buttonSection}>
        {/* Pulsing Record Button */}
        <Animated.View
          style={[
            styles.recordButtonContainer,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.recordButton,
              state === 'recording'
                ? [styles.recordButtonActive, { backgroundColor: colors.danger }]
                : [styles.recordButtonIdle, { backgroundColor: colors.primary }],
            ]}
            onPress={
              state === 'recording' ? handleStopRecording : handleStartRecording
            }
            disabled={state === 'processing' || isActionInFlight || isUploading}
          >
            <Feather
              name="mic"
              size={48}
              color={state === 'recording' ? colors.background : 'white'}
              style={styles.micIcon}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Elapsed Time Display */}
        {state === 'recording' && (
          <Text style={[styles.elapsedTime, { color: colors.accent }]}>{formatTime(elapsedTime)}</Text>
        )}

        {/* Button Label */}
        <Text style={[styles.buttonLabel, { color: colors.textSecondary }]}>
          {state === 'idle' && 'Tap to start recording'}
          {state === 'recording' && 'Recording... Tap to stop'}
          {state === 'processing' && 'Processing...'}
          {isUploading && 'Uploading...'}
          {state === 'error' && 'Error occurred'}
        </Text>

        <TouchableOpacity
          style={[
            styles.uploadButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: state === 'recording' || state === 'processing' || isUploading ? 0.6 : 1,
            },
          ]}
          onPress={handleUploadAudio}
          disabled={state === 'recording' || state === 'processing' || isUploading}
        >
          <Feather name="upload" size={16} color={colors.accent} />
          <Text style={[styles.uploadButtonText, { color: colors.text }]}>Upload Audio</Text>
        </TouchableOpacity>
      </View>

      {/* Processing Overlay */}
      {state === 'processing' && (
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.processingText, { color: colors.text }]}>
            Processing your conversation...
          </Text>
        </View>
      )}

      {/* Error State */}
      {state === 'error' && (
        <View style={styles.errorContainer}>
          <View style={[styles.errorBanner, { backgroundColor: colors.danger }]}>
            <View style={styles.errorContent}>
              <Feather name="alert-circle" size={20} color="white" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
  },

  // Privacy Card - Improved spacing & hierarchy
  privacyCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 48,
    width: '100%',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  privacyBody: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Button Section
  buttonSection: {
    alignItems: 'center',
    width: '100%',
    gap: 16,
  },
  recordButtonContainer: {
    marginBottom: 8,
  },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  recordButtonIdle: {
    // Color applied dynamically
  },
  recordButtonActive: {
    // Color applied dynamically
  },
  micIcon: {
    textAlign: 'center',
  },
  elapsedTime: {
    fontSize: 48,
    fontWeight: '700',
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Processing Overlay
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  processingText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },

  // Error State
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 998,
    paddingBottom: 40,
  },
  errorBanner: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  errorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    gap: 8,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
