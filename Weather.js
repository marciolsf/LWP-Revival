const axios = require('axios');

/* =========================
   WEATHER FEEDS
========================= */
const iconMap = {
    1: 32, 2: 30, 3: 28, 4: 19, 5: 21, 6: 28, 7: 26, 8: 26, 
    11: 20, 12: 9, 13: 39, 14: 39, 15: 17, 16: 38, 17: 38, 18: 11, 
    19: 13, 20: 39, 21: 39, 22: 14, 23: 41, 24: 10, 25: 18, 26: 6, 
    29: 5, 30: 36, 31: 32, 32: 23, 33: 31, 34: 29, 35: 27, 36: 29, 
    37: 20, 38: 27, 39: 45, 40: 45, 41: 47, 42: 47, 43: 45, 44: 46
};

async function getWeather(accKey) {
    const API_KEY = '6e30dc9ea2aa4d3eb99ad8f6630174cd'; 
    const url = `http://api.accuweather.com/currentconditions/v1/${accKey}?apikey=${API_KEY}`;

    try {
        const res = await axios.get(url);
        const data = res.data[0];
        return {
            c: Math.round(data.Temperature.Metric.Value),
            f: Math.round(data.Temperature.Imperial.Value),
            icon: iconMap[data.WeatherIcon] || 32 
        };
    } catch (e) {
        console.error(`[WEATHER ERR] Key ${accKey}:`, e.message);
        return { c: "--", f: "--", icon: 32 }; 
    }
};

module.exports = getWeather;