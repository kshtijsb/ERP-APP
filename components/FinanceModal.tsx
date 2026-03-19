import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, useColorScheme, TextInput } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { saveExpenseLogOffline, getExpenseLogsByFarmerId, ExpenseLog } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface FinanceModalProps {
  isVisible: boolean;
  onClose: () => void;
  farmerId: string;
  landArea: string;
  cropType: string;
}

export function FinanceModal({ isVisible, onClose, farmerId, landArea, cropType }: FinanceModalProps) {
  const colorScheme = useColorScheme();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseLog[]>([]);

  useEffect(() => {
    if (isVisible) loadExpenses();
  }, [isVisible]);

  const loadExpenses = async () => {
    try {
      const data = await getExpenseLogsByFarmerId(farmerId);
      setExpenses(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!amount || !description) {
      Alert.alert('Error', 'Please enter amount and description');
      return;
    }

    setLoading(true);
    try {
      await saveExpenseLogOffline({
        farmer_id: farmerId,
        amount: parseFloat(amount),
        description,
        date: new Date().toISOString()
      });
      syncOfflineData();
      setAmount('');
      setDescription('');
      loadExpenses();
    } catch (e) {
      Alert.alert('Error', 'Failed to log expense');
    } finally {
      setLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const estimatedRevenuePerAcre = cropType.toLowerCase().includes('tomato') ? 150000 : 80000;
  const acres = parseFloat(landArea) || 1;
  const estimatedRevenue = estimatedRevenuePerAcre * acres;
  const roi = estimatedRevenue - totalExpenses;

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Farm Finances & ROI</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark.circle.fill" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.roiCard}>
              <View style={styles.roiRow}>
                <View>
                  <ThemedText style={styles.roiLabel}>Total Expenses</ThemedText>
                  <ThemedText style={styles.expenseValue}>₹ {totalExpenses.toLocaleString()}</ThemedText>
                </View>
                <View>
                  <ThemedText style={styles.roiLabel}>Est. Revenue</ThemedText>
                  <ThemedText style={styles.revenueValue}>₹ {estimatedRevenue.toLocaleString()}</ThemedText>
                </View>
              </View>
              <View style={styles.roiDivider} />
              <View style={styles.roiRow}>
                <ThemedText style={styles.roiLabel}>Projected Net Profit</ThemedText>
                <ThemedText style={[styles.profitValue, { color: roi >= 0 ? '#10B981' : '#EF4444' }]}>
                  {roi >= 0 ? '+' : ''}₹ {roi.toLocaleString()}
                </ThemedText>
              </View>
            </View>

            <ThemedText style={styles.sectionTitle}>Log New Expense</ThemedText>

            <TextInput
              style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
              placeholder="Amount (₹)"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <TextInput
              style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border, marginTop: 12 }]}
              placeholder="Description (e.g., Tractor Rental, Labor)"
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
            />

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} 
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>Log Expense</ThemedText>}
            </TouchableOpacity>

            <ThemedText style={[styles.sectionTitle, { marginTop: 24 }]}>Recent Expenses</ThemedText>
            {expenses.map((exp, idx) => (
              <View key={idx} style={styles.expenseItem}>
                <View>
                  <ThemedText style={styles.expDesc}>{exp.description}</ThemedText>
                  <ThemedText style={styles.expDate}>{new Date(exp.date).toLocaleDateString()}</ThemedText>
                </View>
                <ThemedText style={styles.expAmount}>₹ {exp.amount.toLocaleString()}</ThemedText>
              </View>
            ))}
            {expenses.length === 0 && (
              <ThemedText style={styles.emptyText}>No expenses logged yet.</ThemedText>
            )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    height: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  roiCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  roiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  expenseValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#EF4444',
  },
  revenueValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
  },
  roiDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  profitValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  submitBtn: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  expDesc: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  expDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  expAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 12,
    fontStyle: 'italic',
  }
});
