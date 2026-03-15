import React, { useMemo } from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
let BlurView: any;
try {
  BlurView = require('expo-blur').BlurView;
} catch (e) {
  BlurView = ({ children, style }: any) => <View style={[style, { backgroundColor: 'rgba(255,255,255,0.8)' }]}>{children}</View>;
}
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { analyzeFarmData, AiAnalysisResult } from '@/lib/ai-advisor-service';

interface AiAdvisorModalProps {
  isVisible: boolean;
  onClose: () => void;
  soilData: { ph: number; nitrogen: number; phosphorus: number; potassium: number } | null;
  notes: string[];
  cropType: string;
}

export function AiAdvisorModal({ isVisible, onClose, soilData, notes, cropType }: AiAdvisorModalProps) {
  const colorScheme = useColorScheme();
  
  const analysis: AiAnalysisResult = useMemo(() => {
    return analyzeFarmData(soilData, notes, cropType);
  }, [soilData, notes, cropType]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      default: return '#10B981';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'soil': return 'leaf.fill';
      case 'crop': return 'leaf.fill';
      case 'water': return 'drop.fill';
      case 'pest': return 'ant.fill';
      default: return 'info.circle.fill';
    }
  };

  return (
    <Modal visible={isVisible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <BlurView intensity={20} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={[styles.aiBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}>
                <ThemedText style={styles.aiBadgeText}>AI</ThemedText>
              </View>
              <ThemedText type="subtitle">Agronomic Advisor</ThemedText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.topSummary}>
              <View style={styles.scoreContainer}>
                <ThemedText style={styles.scoreLabel}>Farm Health Score</ThemedText>
                <ThemedText style={[styles.scoreValue, { color: getPriorityColor(analysis.overallHealthScore > 70 ? 'low' : analysis.overallHealthScore > 40 ? 'medium' : 'high') }]}>
                  {analysis.overallHealthScore}%
                </ThemedText>
              </View>
              <View style={styles.summaryBox}>
                <ThemedText style={styles.summaryText}>{analysis.summary}</ThemedText>
              </View>
            </View>

            <ThemedText style={styles.sectionTitle}>Recommendations</ThemedText>
            
            {analysis.recommendations.map((rec, index) => (
              <View key={index} style={[styles.recCard, { borderColor: getPriorityColor(rec.priority) + '30' }]}>
                <View style={styles.recHeader}>
                  <View style={[styles.recIcon, { backgroundColor: getPriorityColor(rec.priority) + '15' }]}>
                    <IconSymbol name={getCategoryIcon(rec.category)} size={16} color={getPriorityColor(rec.priority)} />
                  </View>
                  <View style={styles.recTitleCol}>
                    <ThemedText style={styles.recTitle}>{rec.title}</ThemedText>
                    <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(rec.priority) + '10' }]}>
                      <ThemedText style={[styles.priorityText, { color: getPriorityColor(rec.priority) }]}>
                        {rec.priority.toUpperCase()} PRIORITY
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <ThemedText style={styles.recAdvice}>{rec.advice}</ThemedText>
              </View>
            ))}

            <View style={styles.disclaimer}>
              <IconSymbol name="info.circle" size={12} color="#94A3B8" />
              <ThemedText style={styles.disclaimerText}>
                AI recommendations are for guidance only. Please verify with a qualified agronomist before major interventions.
              </ThemedText>
            </View>
          </ScrollView>

          <TouchableOpacity 
            style={[styles.doneButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={onClose}
          >
            <ThemedText style={styles.doneButtonText}>Acknowledge Insights</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  aiBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  topSummary: {
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '900',
  },
  summaryBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 16,
    width: '100%',
  },
  summaryText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  recCard: {
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  recHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  recIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recTitleCol: {
    flex: 1,
    gap: 4,
  },
  recTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '900',
  },
  recAdvice: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  disclaimer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
    fontStyle: 'italic',
  },
  doneButton: {
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
