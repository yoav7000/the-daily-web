const test = require('node:test');
const assert = require('node:assert/strict');

const weatherService = require('../src/services/weatherService');

const realFetch = global.fetch;
let calls;

const openWeatherReply = (temp) => ({
    ok: true,
    json: async () => ({
        name: 'Tel Aviv',
        sys: { country: 'IL' },
        main: { temp, feels_like: temp, humidity: 50 },
        wind: { speed: 5 },
        weather: [{ icon: '01d', description: 'שמיים בהירים' }]
    })
});

const mockFetch = (handler) => {
    calls = 0;
    global.fetch = async (url) => {
        calls += 1;
        assert.match(String(url), /api\.openweathermap\.org/);
        return handler();
    };
};

test.beforeEach(() => {
    weatherService.clearCache();
    process.env.OPENWEATHER_API_KEY = 'test-key';
});

test.after(() => {
    global.fetch = realFetch;
    delete process.env.OPENWEATHER_API_KEY;
});

test('many simultaneous visitors cause a single call to the weather service', async () => {
    mockFetch(async () => openWeatherReply(21.4));

    const results = await Promise.all(Array.from({ length: 50 }, () => weatherService.getWeather()));

    assert.equal(calls, 1);
    assert.ok(results.every((r) => r.data.temp === 21 && !r.fallback));
});

test('the answer is reused for 15 minutes', async () => {
    mockFetch(async () => openWeatherReply(30));

    const first = await weatherService.getWeather();
    const second = await weatherService.getWeather();

    assert.equal(calls, 1);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(weatherService.CACHE_DURATION_MS, 15 * 60 * 1000);
});

test('without a working service the sample data is labelled as such, also when served from the cache', async () => {
    mockFetch(async () => ({ ok: false, status: 401 }));

    const first = await weatherService.getWeather();
    const second = await weatherService.getWeather();

    assert.equal(first.fallback, true);
    assert.equal(second.fallback, true, 'cached sample data must still be marked as sample data');
    assert.equal(calls, 1, 'a failed call is not repeated for every visitor');
});

test('if the service fails later, the last real reading is shown as stale', async () => {
    mockFetch(async () => openWeatherReply(18));
    await weatherService.getWeather();

    // force the entry to expire, then make the service fail
    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 60 * 1000;
    try {
        mockFetch(async () => { throw new Error('network down'); });
        const result = await weatherService.getWeather();

        assert.equal(result.data.temp, 18);
        assert.equal(result.stale, true);
        assert.equal(result.fallback, false);
    } finally {
        Date.now = realNow;
    }
});

test('no API key: sample data without calling the service', async () => {
    delete process.env.OPENWEATHER_API_KEY;
    mockFetch(async () => openWeatherReply(25));

    const result = await weatherService.getWeather();

    assert.equal(calls, 0);
    assert.equal(result.fallback, true);
});
