// Live week weather from Open-Meteo (free, no key). Cached 1 hour in IndexedDB.
import { getSetting, setSetting } from './db.js';

export const TORONTO = { name: 'Toronto, ON', lat: 43.6532, lon: -79.3832 };
const HOUR = 36e5;

export const rainy = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
export const snowy = c => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const describe = c => c === 0 ? 'Clear' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Cloudy' : c <= 48 ? 'Fog'
  : snowy(c) ? 'Snow' : c >= 95 ? 'Thunderstorm' : rainy(c) ? 'Rain' : 'Mixed';
export const wxIcon = c => c <= 1 ? 'sun' : c <= 3 ? 'cloud' : c <= 48 ? 'cloud-fog' : snowy(c) ? 'cloud-snow' : c >= 95 ? 'cloud-storm' : 'cloud-rain';
export const emoji = c => c === 0 ? '☀️' : c <= 2 ? '⛅' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : snowy(c) ? '❄️' : c >= 95 ? '⛈️' : rainy(c) ? '🌧️' : '🌥️';

export const getCity = () => getSetting('city', TORONTO);

// Returns {days:[{date, code, min, max, feelsMin, feelsMax, rain}], hours:{date:[...]}, current, offline, fetchedAt}
export async function getForecast(force = false) {
  const city = await getCity();
  const key = `wx:${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
  const cached = await getSetting(key);
  if (!force && cached && Date.now() - cached.fetchedAt < HOUR) return { ...cached, city };
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&timezone=auto&forecast_days=7`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max';
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), d = j.daily, h = j.hourly, hours = {};
    h.time.forEach((t, i) => (hours[t.slice(0, 10)] ??= []).push({
      time: t, temp: h.temperature_2m[i], feels: h.apparent_temperature[i],
      rain: h.precipitation_probability[i] ?? 0, code: h.weather_code[i], wind: h.wind_speed_10m[i] }));
    const out = {
      fetchedAt: Date.now(), hours,
      current: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code, wind: j.current.wind_speed_10m },
      days: d.time.map((date, i) => ({ date, code: d.weather_code[i], min: d.temperature_2m_min[i], max: d.temperature_2m_max[i],
        feelsMin: d.apparent_temperature_min[i], feelsMax: d.apparent_temperature_max[i], rain: d.precipitation_probability_max[i] ?? 0 })),
    };
    await setSetting(key, out);
    return { ...out, city };
  } catch (e) {
    console.warn('Weather fetch failed', e);
    return cached ? { ...cached, city, offline: true } : null;
  }
}

export async function geocode(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  const j = await r.json();
  return (j.results || []).map(x => ({ name: [x.name, x.admin1, x.country_code].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

// Local date string (device time) for "today".
export const todayStr = () => new Date().toLocaleDateString('en-CA');
