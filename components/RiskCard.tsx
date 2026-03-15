import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { PredictiveRisk } from '@/lib/ai-advisor-service';

interface RiskCardProps {
  risk: PredictiveRisk;
}

export function RiskCard({ risk }: RiskCardProps) {
  const colorScheme = useColorScheme();
  
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      default: return '#3B82F6';
    }
  };

  const riskColor = getRiskColor(risk.riskLevel);

  return (
    <ThemedView style={[styles.card, { borderColor: riskColor + '40', backgroundColor: Colors[colorScheme ?? 'light'].card }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: riskColor + '15' }]}>
          <IconSymbol 
            name={risk.riskLevel === 'high' ? 'exclamationmark.triangle.fill' : 'info.circle.fill'} 
            size={14} 
            color={riskColor} 
          />
          <ThemedText style={[styles.badgeText, { color: riskColor }]}>
            {risk.riskLevel.toUpperCase()} RISK
          </ThemedText>
        </View>
        <ThemedText style={styles.type}>{risk.type}</ThemedText>
      </View>
      
      <ThemedText style={styles.description}>{risk.description}</ThemedText>
      
      <View style={[styles.recommendationBox, { backgroundColor: riskColor + '08' }]}>
        <ThemedText style={[styles.recLabel, { color: riskColor }]}>Recommendation:</ThemedText>
        <ThemedText style={styles.recText}>{risk.recommendation}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  type: {
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 16,
  },
  recommendationBox: {
    padding: 12,
    borderRadius: 12,
  },
  recLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  recText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
