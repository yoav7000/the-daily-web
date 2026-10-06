const { logOperation } = require('../middleware/requestLogger');

const CACHE_DURATION_MS = 15 * 60 * 1000; // up to 15 minutes of lag, as required
const RETRY_AFTER_FAILURE_MS = 60 * 1000; // after a failure, try the real service again soon
const CITY = process.env.WEATHER_CITY || 'Tel Aviv,IL';

// { data, fetchedAt, expiresAt, fallback, stale }
let cache = null;
// the request to OpenWeatherMap that is running right now, shared by everyone who asks meanwhile
let inFlight = null;

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

// Shown only when the real service cannot be used. The page labels it as sample data (fallback: true).
const fallbackData = () => ({
    city: 'Tel Aviv',
    country: 'IL',
    temp: 26,
    feelsLike: 27,
    humidity: 60,
    windSpeed: 12,
    condition: 'נתוני דוגמה',
    icon: 'bi-sun',
    updatedAt: new Date().toISOString()
});

const toResult = (entry, cached) => ({
    data: entry.data,
    cached,
    fallback: entry.fallback,
    stale: entry.stale,
    fetchedAt: entry.fetchedAt
});

const refresh = async () => {
    const now = Date.now();
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        logOperation('WEATHER_NO_API_KEY', { message: 'OPENWEATHER_API_KEY is not set, showing sample data' });
        cache = { data: fallbackData(), fetchedAt: now, expiresAt: now + CACHE_DURATION_MS, fallback: true, stale: false };
        return toResult(cache, false);
    }

    try {
        const data = await fetchFromOpenWeatherMap(apiKey);
        cache = { data, fetchedAt: now, expiresAt: now + CACHE_DURATION_MS, fallback: false, stale: false };
        logOperation('WEATHER_REFRESHED', { city: data.city, temp: data.temp });
        return toResult(cache, false);
    } catch (err) {
        logOperation('WEATHER_FETCH_FAILED', { error: err.message });
        const expiresAt = now + RETRY_AFTER_FAILURE_MS;
        if (cache && !cache.fallback) {
            // keep showing the last real reading, marked as stale
            cache = { ...cache, stale: true, expiresAt };
        } else {
            cache = { data: fallbackData(), fetchedAt: now, expiresAt, fallback: true, stale: false };
        }
        return toResult(cache, true);
    }
};

/**
 * Returns the weather. OpenWeatherMap is called at most once per 15 minutes no matter how many users ask,
 * and users who ask while a refresh is running wait for that same request instead of starting their own.
 * If the service fails, the last real reading is served (stale), or labelled sample data if there never was one.
 */
const getWeather = async () => {
    if (cache && Date.now() < cache.expiresAt) {
        return toResult(cache, true);
    }

    if (!inFlight) {
        inFlight = refresh().finally(() => { inFlight = null; });
    }
    return inFlight;
};

const clearCache = () => {
    cache = null;
    inFlight = null;
};

module.exports = { getWeather, clearCache, CACHE_DURATION_MS };
