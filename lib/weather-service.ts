import { updateFarmerWeather } from './offline-db';

const API_KEY = '8952848962776887469766'; // Mock or developer key placeholder
const MOCK_WEATHER = [
  { temp: 28, condition: 'Sunny', humidity: 45, wind: 12 },
  { temp: 30, condition: 'Partly Cloudy', humidity: 40, wind: 10 },
  { temp: 26, condition: 'Clear', humidity: 35, wind: 15 },
];

export async function fetchAndCacheWeather(farmerId: string, latitude?: number, longitude?: number) {
  try {
    let lat = latitude ?? 18.5204; // Default to Pune, India coordinates
    let lon = longitude ?? 73.8567;

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&wind_speed_unit=ms&timezone=auto`
    );
    const data = await response.json();
    
    if (!data.current) throw new Error('Invalid weather data');

    const weatherCodeMap: Record<number, string> = {
      0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing Rime Fog',
      51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle',
      61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
      80: 'Slight Rain Showers', 81: 'Moderate Rain Showers', 82: 'Violent Rain Showers',
      95: 'Thunderstorm',
    };

    const weatherData = {
      temp: Math.round(data.current.temperature_2m),
      condition: weatherCodeMap[data.current.weather_code] || 'Cloudy',
      humidity: data.current.relative_humidity_2m,
      last_updated: new Date().toISOString()
    };

    const weatherString = JSON.stringify(weatherData);

    // Update local DB
    await updateFarmerWeather(farmerId, weatherString);
    
    return weatherData;
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    // Fallback to minimal default
    return { temp: 28, condition: 'Humid', humidity: 82 };
  }
}

export function parseWeatherData(dataString: string | null) {
  if (!dataString) return null;
  try {
    return JSON.parse(dataString);
  } catch (e) {
    return null;
  }
}
