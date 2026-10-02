const weatherService = require('../services/weatherService');

/**
 * GET /api/weather
 * Current weather for the site sidebar widget (cached for 15 minutes on the server).
 */
const getWeather = async (req, res, next) => {
    try {
        const result = await weatherService.getWeather();
        return res.status(200).json({
            success: true,
            cached: result.cached,
            fallback: Boolean(result.fallback),
            stale: Boolean(result.stale),
            cachedAt: new Date(result.fetchedAt),
            ageMinutes: Math.floor((Date.now() - result.fetchedAt) / 60000),
            data: result.data
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getWeather
};
