const { logOperation } = require('../middleware/requestLogger');

const CACHE_DURATION_MS = 15 * 60 * 1000; // up to 15 minutes of lag, as required
const CITY = process.env.WEATHER_CITY || 'Tel Aviv,IL';

let cache = null; // { data, fetchedAt }

const ICONS = {
    '01': { icon: 'bi-sun', text: 'בהיר' },
    '02': { icon: 'bi-cloud-sun', text: 'מעונן חלקית' },
    '03': { icon: 'bi-cloud', text: 'מעונן' },
    '04': { icon: 'bi-clouds', text: 'מעונן' },
    '09': { icon: 'bi-cloud-drizzle', text: 'טפטוף' },
    '10': { icon: 'bi-cloud-rain', text: 'גשום' },
    '11': { icon: 'bi-cloud-lightning-rain', text: 'סוער' },
    '13': { icon: 'bi-snow', text: 'שלג' },
    '50': { icon: 'bi-cloud-fog', text: 'ערפילי' }
};

const fetchFromOpenWeatherMap = async (apiKey) => {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(CITY)}&units=metric&lang=he&appid=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OpenWeatherMap returned HTTP ${response.status}`);
    }
    const raw = await response.json();
    const iconKey = (raw.weather && raw.weather[0] && raw.weather[0].icon || '01d').slice(0, 2);
    const mapped = ICONS[iconKey] || ICONS['01'];

    return {
        city: raw.name,
        country: raw.sys && raw.sys.country,
        temp: Math.round(raw.main.temp),
        feelsLike: Math.round(raw.main.feels_like),
        humidity: raw.main.humidity,
        windSpeed: Math.round(raw.wind.speed * 3.6), // m/s -> km/h
        condition: (raw.weather && raw.weather[0] && raw.weather[0].description) || mapped.text,
        icon: mapped.icon,
        updatedAt: new Date().toISOString()
    };
};

const fallbackData = () => ({
    city: 'Tel Aviv',
    country: 'IL',
    temp: 26,
    feelsLike: 27,
    humidity: 60,
    windSpeed: 12,
    condition: 'נתונים זמניים',
    icon: 'bi-sun',
    updatedAt: new Date().toISOString()
});

/**
 * Returns weather data. Hits OpenWeatherMap at most once per 15 minutes no matter
 * how many users ask, and serves the last good value if the API is down.
 */
const getWeather = async () => {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_DURATION_MS) {
        return { data: cache.data, cached: true, fetchedAt: cache.fetchedAt };
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        logOperation('WEATHER_NO_API_KEY', { message: 'OPENWEATHER_API_KEY is not set, using placeholder data' });
        cache = { data: fallbackData(), fetchedAt: now };
        return { data: cache.data, cached: false, fallback: true, fetchedAt: now };
    }

    try {
        const data = await fetchFromOpenWeatherMap(apiKey);
        cache = { data, fetchedAt: now };
        logOperation('WEATHER_REFRESHED', { city: data.city, temp: data.temp });
        return { data, cached: false, fetchedAt: now };
    } catch (err) {
        logOperation('WEATHER_FETCH_FAILED', { error: err.message });
        if (cache) {
            return { data: cache.data, cached: true, stale: true, fetchedAt: cache.fetchedAt };
        }
        cache = { data: fallbackData(), fetchedAt: now };
        return { data: cache.data, cached: false, fallback: true, fetchedAt: now };
    }
};

const clearCache = () => { cache = null; };

module.exports = { getWeather, clearCache, CACHE_DURATION_MS };
