import React, { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, useColorScheme, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

import { useTranslation } from '@/context/language-context';

export default function LoginScreen() {
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');

  const handleAuth = async () => {
    if (!email || !password || (mode === 'signup' && !fullName)) {
      Alert.alert('Details Missing', 'Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace('/(tabs)');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            }
          }
        });
        if (error) throw error;
        Alert.alert('Signup Success', 'Please check your email to verify your account!');
        setMode('login');
      }
    } catch (error: any) {
      Alert.alert('Auth Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.langToggle}
            onPress={() => setLocale(locale === 'en' ? 'mr' : 'en')}
          >
            <ThemedText style={styles.langToggleText}>
              {locale === 'en' ? 'मराठी' : 'English'}
            </ThemedText>
          </TouchableOpacity>

          <ThemedView style={styles.logoCircle}>
            <IconSymbol name="leaf.fill" size={40} color={Colors[colorScheme ?? 'light'].tint} />
          </ThemedView>
          <ThemedText type="title" style={styles.title}>{t('appName')}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {mode === 'login' ? t('staffPortal') + ' ' + t('login') : t('signup')}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {mode === 'signup' && (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>{t('fullName')}</ThemedText>
              <View style={[styles.inputWrapper, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
                <IconSymbol name="person.fill" size={18} color="#94A3B8" />
                <TextInput
                  style={[styles.input, { color: Colors[colorScheme ?? 'light'].text }]}
                  placeholder="Employee Full Name"
                  placeholderTextColor="#94A3B8"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>{t('email')}</ThemedText>
            <View style={[styles.inputWrapper, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
              <IconSymbol name="envelope.fill" size={18} color="#94A3B8" />
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text }]}
                placeholder="staff@kksathi.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>{t('password')}</ThemedText>
            <View style={[styles.inputWrapper, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
              <IconSymbol name="lock.fill" size={18} color="#94A3B8" />
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text }]}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.mainButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} 
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>
                {mode === 'login' ? t('login') : t('signup')}
              </ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.switchButton} 
            onPress={() => Alert.alert('Auth Support', 'Please contact your Superadmin to reset your password or update your role.')}
          >
            <ThemedText style={styles.helpText}>Forgot Password? Contact Admin</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.switchButton} 
            onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            <ThemedText style={styles.switchText}>
              {mode === 'login' ? "New staff member? Request Signup" : "Already have an account? Sign In"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.farmerEntry}>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <ThemedText style={styles.dividerText}>{t('farmerPortal').toUpperCase()}</ThemedText>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity 
            style={[styles.farmerButton, { borderColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={() => router.push('/farmer-portal')}
          >
            <IconSymbol name="leaf.fill" size={18} color={Colors[colorScheme ?? 'light'].tint} />
            <ThemedText style={[styles.farmerButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
              {t('accessPortal')}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>Certified Agricultural Staff Portal v2.0</ThemedText>
          <ThemedText style={styles.footerText}>{t('secureIdentity')}</ThemedText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  langToggle: {
    position: 'absolute',
    top: -40,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  mainButton: {
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  switchText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  helpText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    marginTop: 60,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  farmerEntry: {
    marginTop: 40,
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 15,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2,
  },
  farmerButton: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  farmerButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
