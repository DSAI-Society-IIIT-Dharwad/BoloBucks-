import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface AuthScreenProps {
  mode: 'signup' | 'login';
  message?: string;
  error?: string;
  onSubmit: (payload: { email: string; password: string }) => void;
  onSwitchMode: () => void;
}

export function AuthScreen({ mode, message, error, onSubmit, onSwitchMode }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const title = mode === 'signup' ? 'Create your account' : 'Log in to continue';
  const submitText = mode === 'signup' ? 'Sign Up' : 'Log In';
  const switchPrompt = mode === 'signup' ? 'Already have an account?' : 'Need an account first?';
  const switchAction = mode === 'signup' ? 'Log In' : 'Sign Up';

  const disabled = useMemo(() => {
    return !email.trim() || password.trim().length < 4;
  }, [email, password]);

  const handleSubmit = () => {
    if (disabled) {
      return;
    }

    onSubmit({
      email: email.trim(),
      password: password.trim(),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>Armour.AI</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Sign up once, then log in to access conversations and insights.</Text>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          placeholder="Email"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <TextInput
          placeholder="Password (min 4 chars)"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        <Pressable
          style={[styles.submitButton, disabled ? styles.submitButtonDisabled : null]}
          disabled={disabled}
          onPress={handleSubmit}
        >
          <Text style={styles.submitText}>{submitText}</Text>
        </Pressable>

        <Pressable onPress={onSwitchMode} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {switchPrompt} <Text style={styles.switchTextAccent}>{switchAction}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  brand: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94a3b8',
    marginBottom: 14,
    lineHeight: 19,
  },
  message: {
    color: '#22c55e',
    marginBottom: 10,
  },
  error: {
    color: '#f87171',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0b1220',
    borderColor: '#243041',
    borderWidth: 1,
    borderRadius: 12,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  switchButton: {
    alignSelf: 'center',
    marginTop: 12,
    padding: 6,
  },
  switchText: {
    color: '#94a3b8',
  },
  switchTextAccent: {
    color: '#38bdf8',
    fontWeight: '700',
  },
});
