const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 10000;

const WEATHER_CODE_LABELS = {
  0: 'Ceu limpo',
  1: 'Predomínio de céu limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Névoa',
  48: 'Névoa com geada',
  51: 'Garoa fraca',
  53: 'Garoa moderada',
  55: 'Garoa forte',
  56: 'Garoa congelante fraca',
  57: 'Garoa congelante forte',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva forte',
  66: 'Chuva congelante fraca',
  67: 'Chuva congelante forte',
  71: 'Neve fraca',
  73: 'Neve moderada',
  75: 'Neve forte',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva fracas',
  81: 'Pancadas de chuva moderadas',
  82: 'Pancadas de chuva fortes',
  85: 'Pancadas de neve fracas',
  86: 'Pancadas de neve fortes',
  95: 'Trovoada',
  96: 'Trovoada com granizo fraco',
  99: 'Trovoada com granizo forte',
};

function weatherCodeLabel(code) {
  return WEATHER_CODE_LABELS[code] || 'Condição desconhecida';
}

function weatherCodeSeverity(code) {
  if (code === 95 || code === 96 || code === 99) return 100;
  if (code >= 80 && code <= 86) return 90;
  if (code >= 61 && code <= 77) return 80;
  if (code >= 51 && code <= 57) return 60;
  if (code === 45 || code === 48) return 50;
  if (code === 3) return 30;
  if (code === 2) return 20;
  if (code === 1) return 10;
  return 0;
}

function isFogCode(code) {
  return code === 45 || code === 48;
}

function isRainCode(code) {
  return code !== null && code >= 51 && code <= 86;
}

function isStormCode(code) {
  return code === 95 || code === 96 || code === 99;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function addDays(yyyyMmDd, days) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWithinObservationWindow(isoTime, date) {
  const t = new Date(isoTime);
  const windowStart = new Date(`${date}T18:00:00`);
  const windowEnd = new Date(`${addDays(date, 1)}T06:00:00`);
  return t >= windowStart && t <= windowEnd;
}

function isWithinDay(isoTime, date) {
  return isoTime.startsWith(date);
}

function classifySkyQuality(avgCloudCover) {
  if (avgCloudCover === null) return null;
  if (avgCloudCover <= 15) return 'Excelente';
  if (avgCloudCover <= 40) return 'Bom';
  if (avgCloudCover <= 70) return 'Regular';
  return 'Ruim';
}

function average(values) {
  const valid = values.filter((v) => v !== null && v !== undefined);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
}

async function fetchForecast({ lat, lon, date }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'cloudcover,precipitation_probability,visibility,weathercode',
    daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max',
    timezone: 'auto',
    forecast_days: '7',
  });

  const url = `${WEATHER_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    return {
      available: false,
      error: err.name === 'AbortError' ? 'Tempo limite excedido ao consultar a Open-Meteo.' : 'Falha de rede ao consultar a Open-Meteo.',
    };
  }

  if (!response.ok) {
    let reason = `status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.reason) reason = errBody.reason;
    } catch {
      reason = `status ${response.status}`;
    }
    return { available: false, error: `Open-Meteo: ${reason}` };
  }

  const payload = await response.json();
  return { available: true, payload, date };
}

function buildNightSummary(payload, date) {
  const hourly = payload.hourly;
  if (!hourly?.time?.length) {
    return { available: false, error: 'Sem dados horários retornados pela Open-Meteo.' };
  }

  const nightHours = hourly.time
    .map((time, i) => ({
      time,
      cloudcover: hourly.cloudcover?.[i] ?? null,
      precipitation: hourly.precipitation_probability?.[i] ?? null,
      visibility: hourly.visibility?.[i] ?? null,
      weathercode: hourly.weathercode?.[i] ?? null,
    }))
    .filter((h) => isWithinObservationWindow(h.time, date));

  if (nightHours.length === 0) {
    return { available: false, error: 'Sem dados para o período noturno solicitado. A previsão da Open-Meteo cobre cerca de 7 dias a partir de hoje.' };
  }

  const cloudValues = nightHours.map((h) => h.cloudcover);
  const avgCloudCover = average(cloudValues);
  const validCloud = cloudValues.filter((v) => v !== null);
  const minCloudCover = validCloud.length ? Math.min(...validCloud) : null;
  const maxCloudCover = validCloud.length ? Math.max(...validCloud) : null;

  const precipValues = nightHours.map((h) => h.precipitation).filter((v) => v !== null);
  const maxPrecipProbability = precipValues.length ? Math.max(...precipValues) : null;

  const worstCode = nightHours.reduce((worst, h) => {
    if (h.weathercode === null) return worst;
    if (worst === null) return h.weathercode;
    return weatherCodeSeverity(h.weathercode) > weatherCodeSeverity(worst) ? h.weathercode : worst;
  }, null);

  return {
    available: true,
    timezone: payload.timezone,
    summary: {
      avgCloudCover,
      minCloudCover,
      maxCloudCover,
      maxPrecipProbability,
      skyQuality: classifySkyQuality(avgCloudCover),
      weatherCode: worstCode,
      weatherLabel: worstCode !== null ? weatherCodeLabel(worstCode) : null,
      hasFog: nightHours.some((h) => isFogCode(h.weathercode)),
      hasRain: nightHours.some((h) => isRainCode(h.weathercode)),
      hasStorm: nightHours.some((h) => isStormCode(h.weathercode)),
    },
    hourly: nightHours,
  };
}

function buildDailyForecast(payload) {
  const daily = payload.daily;
  const hourly = payload.hourly;
  if (!daily?.time?.length) return [];

  return daily.time.map((date, i) => {
    const code = daily.weathercode?.[i] ?? null;

    let cloudCoverMean = null;
    if (hourly?.time?.length && hourly?.cloudcover?.length) {
      const dayCloudValues = hourly.time
        .map((time, idx) => ({ time, value: hourly.cloudcover[idx] }))
        .filter((h) => isWithinDay(h.time, date))
        .map((h) => h.value);
      cloudCoverMean = average(dayCloudValues);
    }

    return {
      date,
      weatherCode: code,
      weatherLabel: code !== null ? weatherCodeLabel(code) : null,
      temperatureMax: daily.temperature_2m_max?.[i] ?? null,
      temperatureMin: daily.temperature_2m_min?.[i] ?? null,
      precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
      precipitationSum: daily.precipitation_sum?.[i] ?? null,
      windSpeedMax: daily.windspeed_10m_max?.[i] ?? null,
      cloudCoverMean,
      isFog: isFogCode(code),
      isRain: isRainCode(code),
      isStorm: isStormCode(code),
    };
  });
}

async function getNightSkyConditions({ lat, lon, date }) {
  const forecast = await fetchForecast({ lat, lon, date });
  if (!forecast.available) return forecast;

  const night = buildNightSummary(forecast.payload, date);
  const daily = buildDailyForecast(forecast.payload);

  return { ...night, daily };
}

async function getCurrentCloudCover({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'cloud_cover,temperature_2m,weathercode,wind_speed_10m',
    timezone: 'auto',
  });

  const url = `${WEATHER_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    return {
      available: false,
      error: err.name === 'AbortError' ? 'Tempo limite excedido ao consultar a Open-Meteo.' : 'Falha de rede ao consultar a Open-Meteo.',
    };
  }

  if (!response.ok) {
    let reason = `status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.reason) reason = errBody.reason;
    } catch {
      reason = `status ${response.status}`;
    }
    return { available: false, error: `Open-Meteo: ${reason}` };
  }

  const payload = await response.json();
  const current = payload.current;

  if (!current) {
    return { available: false, error: 'Sem dados atuais retornados pela Open-Meteo.' };
  }

  const cloudCover = current.cloud_cover ?? null;
  const code = current.weathercode ?? null;

  return {
    available: true,
    time: current.time,
    timezone: payload.timezone,
    cloudCover,
    temperature: current.temperature_2m ?? null,
    windSpeed: current.wind_speed_10m ?? null,
    weatherCode: code,
    weatherLabel: code !== null ? weatherCodeLabel(code) : null,
    skyQuality: classifySkyQuality(cloudCover),
  };
}

module.exports = { getNightSkyConditions, getCurrentCloudCover, weatherCodeLabel };
