export interface AiRecommendation {
  title: string;
  advice: string;
  priority: 'high' | 'medium' | 'low';
  category: 'soil' | 'crop' | 'water' | 'pest';
}

export interface AiAnalysisResult {
  summary: string;
  recommendations: AiRecommendation[];
  overallHealthScore: number;
}

export interface PredictiveRisk {
  type: string;
  riskLevel: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export interface RiskAnalysisResult {
  risks: PredictiveRisk[];
  alerts: string[];
}

export function analyzeFarmData(
  soil: { ph: number; nitrogen: number; phosphorus: number; potassium: number } | null,
  notes: string[],
  cropType: string
): AiAnalysisResult {
  const recommendations: AiRecommendation[] = [];
  let score = 80; // Baseline health score

  // 1. Soil pH Analysis
  if (soil) {
    if (soil.ph < 6.0) {
      recommendations.push({
        title: 'Soil Acidity Alert',
        advice: `The pH level (${soil.ph}) is low (acidic). Consider applying agricultural lime to neutralize the soil and improve nutrient availability for ${cropType}.`,
        priority: 'high',
        category: 'soil'
      });
      score -= 15;
    } else if (soil.ph > 7.5) {
      recommendations.push({
        title: 'Soil Alkalinity Alert',
        advice: `The pH level (${soil.ph}) is high (alkaline). Applying elemental sulfur or organic mulch can help lower the pH to an optimal range (6.5-7.0).`,
        priority: 'medium',
        category: 'soil'
      });
      score -= 10;
    }

    // 2. Macronutrient Analysis
    if (soil.nitrogen < 30) {
      recommendations.push({
        title: 'Nitrogen Deficiency',
        advice: 'Nitrogen levels are significantly low. Suggest applying Urea or composted manure to boost vegetative growth.',
        priority: 'high',
        category: 'soil'
      });
      score -= 20;
    }

    if (soil.phosphorus < 20) {
      recommendations.push({
        title: 'Phosphorus Boost Needed',
        advice: 'Low phosphorus levels detected. This may affect root development and flowering. Consider DAP or bone meal.',
        priority: 'medium',
        category: 'soil'
      });
      score -= 10;
    }
  }

  // 3. Observation Analysis (Search keywords)
  const combinedNotes = notes.join(' ').toLowerCase();
  
  if (combinedNotes.includes('pest') || combinedNotes.includes('insect') || combinedNotes.includes('worm')) {
    recommendations.push({
      title: 'Pest Detection',
      advice: 'Recent observations mention pests. Immediate scouting is required. Consider neem-based biopesticides or targeted intervention.',
      priority: 'high',
      category: 'pest'
    });
    score -= 20;
  }

  if (combinedNotes.includes('dry') || combinedNotes.includes('wilting') || combinedNotes.includes('moisture')) {
    recommendations.push({
      title: 'Water Management',
      advice: 'Signs of moisture stress detected. Ensure regular irrigation scheduling, preferably in early morning or late evening.',
      priority: 'high',
      category: 'water'
    });
    score -= 15;
  }

  if (combinedNotes.includes('yellow') || combinedNotes.includes('spot')) {
    recommendations.push({
      title: 'Nutrient/Disease Scouting',
      advice: 'Yellowing or spots observed on leaves. This could be a fungal infection or micronutrient (Zinc/Magnesium) deficiency.',
      priority: 'medium',
      category: 'crop'
    });
    score -= 10;
  }

  // Default recommendation if none found
  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Maintenance Mode',
      advice: 'Soil and field data look stable. Continue current practices and monitor weekly.',
      priority: 'low',
      category: 'crop'
    });
  }

  // Final Result
  return {
    summary: recommendations.length > 2 
      ? `Critical attention needed for ${cropType} plot due to ${recommendations[0].category} issues.`
      : `The ${cropType} plot is performing within acceptable parameters with minor adjustments needed.`,
    recommendations,
    overallHealthScore: Math.max(0, Math.min(100, score))
  };
}

export function predictiveRiskAnalysis(
  weather: { temp: number; humidity: number; condition: string; rain_chance?: number },
  cropType: string
): RiskAnalysisResult {
  const risks: PredictiveRisk[] = [];
  const alerts: string[] = [];

  // 1. Rain Alerts
  if (weather.rain_chance && weather.rain_chance > 50) {
    alerts.push(`High probability of rain (${weather.rain_chance}%). Avoid fertilizer application today.`);
  } else if (weather.condition.toLowerCase().includes('rain')) {
    alerts.push('Heavy rain detected/forecasted. Ensure proper drainage in fields.');
  }

  // 2. Pest Prediction (e.g., Humidity-based)
  if (weather.humidity > 70 && weather.temp > 25) {
    risks.push({
      type: 'Fungal Infection (Blight)',
      riskLevel: 'high',
      description: `High humidity (${weather.humidity}%) and warm temperatures are ideal for fungal growth in ${cropType}.`,
      recommendation: 'Apply preventive bio-fungicide and ensure space between plants for airflow.'
    });
  }

  if (weather.temp > 32 && weather.humidity < 40) {
    risks.push({
      type: 'Spider Mites / Sucking Pests',
      riskLevel: 'medium',
      description: 'Hot and dry conditions often trigger rapid reproduction of sucking pests.',
      recommendation: 'Monitor leaf undersides and maintain adequate soil moisture to reduce plant stress.'
    });
  }

  // 3. Climate/Disease Warnings
  if (weather.temp < 15 && weather.humidity > 80) {
    risks.push({
      type: 'Powdery Mildew',
      riskLevel: 'high',
      description: 'Cool mornings with high humidity create high risk for powdery mildew spread.',
      recommendation: 'Spray diluted milk or organic sulfur if initial spots appear.'
    });
  }

  // 4. General Crop specific risks (simplified)
  if (cropType.toLowerCase().includes('tomato') && weather.humidity > 75) {
    risks.push({
      type: 'Early Blight',
      riskLevel: 'high',
      description: 'Humid conditions are particularly dangerous for Tomato crops.',
      recommendation: 'Remove lower leaves to prevent soil-born spores from splashing onto foliage.'
    });
  }

  return { risks, alerts };
}
