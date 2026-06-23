const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const BODIES = [
  { id: '301', name: 'Lua' },
  { id: '199', name: 'Mercúrio' },
  { id: '299', name: 'Vênus' },
  { id: '499', name: 'Marte' },
  { id: '599', name: 'Júpiter' },
  { id: '699', name: 'Saturno' },
  { id: '799', name: 'Urano' },
  { id: '899', name: 'Netuno' },
];

const QUANTITIES = '4,9,10';
const TIMEOUT_MS = 12000;
const REQUEST_SPACING_MS = 350;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function quote(value) {
  return `'${value}'`;
}

function buildHorizonsUrl({ bodyId, lat, lon, startTime, stopTime, stepSize }) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: quote(bodyId),
    OBJ_DATA: quote('NO'),
    MAKE_EPHEM: quote('YES'),
    EPHEM_TYPE: quote('OBSERVER'),
    CENTER: quote('coord@399'),
    COORD_TYPE: quote('GEODETIC'),
    SITE_COORD: quote(`${lon},${lat},0`),
    START_TIME: quote(startTime),
    STOP_TIME: quote(stopTime),
    STEP_SIZE: quote(stepSize),
    QUANTITIES: quote(QUANTITIES),
    CSV_FORMAT: quote('YES'),
    ANG_FORMAT: quote('DEG'),
    APPARENT: quote('AIRLESS'),
    SKIP_DAYLT: quote('NO'),
  });

  return `${HORIZONS_URL}?${params.toString()}`;
}

function addOneDay(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function extractDataLines(resultText) {
  const startIdx = resultText.indexOf('$$SOE');
  const endIdx = resultText.indexOf('$$EOE');
  if (startIdx === -1 || endIdx === -1) return [];

  const block = resultText.slice(startIdx + 5, endIdx).trim();
  if (!block) return [];

  return block.split('\n').map((l) => l.trim()).filter(Boolean);
}

function parseLine(line) {
  const cols = line.split(',').map((c) => c.trim());
  const dateStr = cols[0];
  const numeric = cols.slice(3).map((v) => (v === '' || v === 'n.a.' ? null : Number(v)));
  const [azimuth, elevation, magnitude, illumination] = numeric;

  return {
    time: dateStr,
    azimuth: Number.isFinite(azimuth) ? azimuth : null,
    elevation: Number.isFinite(elevation) ? elevation : null,
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    illumination: Number.isFinite(illumination) ? illumination : null,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function requestHorizons(url) {
  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    return {
      ok: false,
      retryable: err.name !== 'AbortError',
      error: err.name === 'AbortError' ? 'Tempo limite excedido ao consultar a NASA Horizons.' : 'Falha de rede ao consultar a NASA Horizons.',
    };
  }

  if (!response.ok) {
    const retryable = response.status === 503 || response.status === 429 || response.status >= 500;
    return { ok: false, retryable, error: `NASA Horizons retornou status ${response.status}.` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, retryable: true, error: 'Resposta inválida da NASA Horizons.' };
  }

  if (payload.error) {
    return { ok: false, retryable: false, error: payload.error, payload };
  }

  return { ok: true, payload };
}

async function requestWithRetry(url) {
  let attempt = 0;
  let result;

  while (attempt <= MAX_RETRIES) {
    result = await requestHorizons(url);
    if (result.ok || !result.retryable) break;
    attempt += 1;
    if (attempt <= MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  return result;
}

async function fetchBodyVisibility({ bodyId, name, lat, lon, date }) {
  const startTime = `${date} 18:00`;
  const stopTime = `${addOneDay(date)} 06:00`;
  const url = buildHorizonsUrl({ bodyId, lat, lon, startTime, stopTime, stepSize: '30 min' });

  const result = await requestWithRetry(url);

  if (!result.ok) {
    console.error(`[Horizons] Falha para ${name} (COMMAND=${bodyId}):`, result.error);
    console.error(`[Horizons] URL da consulta: ${url}`);
    return { name, visible: false, error: result.error };
  }

  const lines = extractDataLines(result.payload.result || '');
  if (lines.length === 0) {
    console.error(`[Horizons] Sem $$SOE/$$EOE na resposta para ${name} (COMMAND=${bodyId}).`);
    console.error(`[Horizons] URL da consulta: ${url}`);
    console.error(`[Horizons] Início da resposta: ${(result.payload.result || '').slice(0, 300)}`);
    return { name, visible: false, error: 'Sem dados de efeméride retornados.' };
  }

  const points = lines.map(parseLine).filter((p) => p.elevation !== null);
  if (points.length === 0) {
    return { name, visible: false, error: 'Sem dados de elevação válidos.' };
  }

  const best = points.reduce((max, p) => (p.elevation > max.elevation ? p : max), points[0]);

  return {
    name,
    visible: best.elevation > 0,
    bestTime: best.time,
    maxElevation: round1(best.elevation),
    azimuth: best.azimuth !== null ? round1(best.azimuth) : null,
    magnitude: best.magnitude !== null ? round2(best.magnitude) : null,
    illumination: best.illumination !== null ? round2(best.illumination) : null,
  };
}

async function getVisibleBodies({ lat, lon, date }) {
  const results = [];

  for (let i = 0; i < BODIES.length; i += 1) {
    const body = BODIES[i];
    results.push(fetchBodyVisibility({ bodyId: body.id, name: body.name, lat, lon, date }));
    if (i < BODIES.length - 1) {
      await sleep(REQUEST_SPACING_MS);
    }
  }

  const resolved = await Promise.all(results);

  return resolved.sort((a, b) => {
    if (a.visible && !b.visible) return -1;
    if (!a.visible && b.visible) return 1;
    return (b.maxElevation ?? -999) - (a.maxElevation ?? -999);
  });
}

function nightKeyFromHorizonsTime(horizonsTimeStr, baseDate) {
  const parts = horizonsTimeStr.trim().split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00:00';
  const [hh] = timePart.split(':').map(Number);

  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const [y, mon, d] = datePart.split('-');
  const parsed = new Date(Date.UTC(Number(y), months[mon], Number(d)));

  if (hh < 12) {
    parsed.setUTCDate(parsed.getUTCDate() - 1);
  }

  const key = parsed.toISOString().slice(0, 10);
  return key >= baseDate ? key : baseDate;
}

async function fetchBodyWeeklyVisibility({ bodyId, name, lat, lon, startDate, days }) {
  const startTime = `${startDate} 18:00`;
  const stopTime = `${addDays(startDate, days)} 06:00`;
  const url = buildHorizonsUrl({ bodyId, lat, lon, startTime, stopTime, stepSize: '1 h' });

  const result = await requestWithRetry(url);

  if (!result.ok) {
    console.error(`[Horizons] Falha semanal para ${name} (COMMAND=${bodyId}):`, result.error);
    console.error(`[Horizons] URL da consulta: ${url}`);
    return { name, error: result.error, nights: [] };
  }

  const lines = extractDataLines(result.payload.result || '');
  if (lines.length === 0) {
    console.error(`[Horizons] Sem $$SOE/$$EOE na resposta semanal para ${name} (COMMAND=${bodyId}).`);
    return { name, error: 'Sem dados de efeméride retornados.', nights: [] };
  }

  const points = lines.map(parseLine).filter((p) => p.elevation !== null);
  if (points.length === 0) {
    return { name, error: 'Sem dados de elevação válidos.', nights: [] };
  }

  const byNight = new Map();
  points.forEach((p) => {
    const nightKey = nightKeyFromHorizonsTime(p.time, startDate);
    const current = byNight.get(nightKey);
    if (!current || p.elevation > current.elevation) {
      byNight.set(nightKey, p);
    }
  });

  const nights = Array.from(byNight.entries())
    .map(([nightDate, best]) => ({
      date: nightDate,
      visible: best.elevation > 0,
      bestTime: best.time,
      maxElevation: round1(best.elevation),
      azimuth: best.azimuth !== null ? round1(best.azimuth) : null,
      magnitude: best.magnitude !== null ? round2(best.magnitude) : null,
      illumination: best.illumination !== null ? round2(best.illumination) : null,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { name, error: null, nights };
}

function addDays(yyyyMmDd, days) {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getWeeklyVisibility({ lat, lon, startDate, days = 7 }) {
  const results = [];

  for (let i = 0; i < BODIES.length; i += 1) {
    const body = BODIES[i];
    results.push(
      fetchBodyWeeklyVisibility({ bodyId: body.id, name: body.name, lat, lon, startDate, days })
    );
    if (i < BODIES.length - 1) {
      await sleep(REQUEST_SPACING_MS);
    }
  }

  const resolved = await Promise.all(results);

  return resolved.map((body) => {
    if (body.error) {
      return { name: body.name, visible: false, error: body.error, bestNight: null, nights: [] };
    }

    const visibleNights = body.nights.filter((n) => n.visible);
    const bestNight = visibleNights.reduce(
      (max, n) => (!max || n.maxElevation > max.maxElevation ? n : max),
      null
    );

    return {
      name: body.name,
      visible: visibleNights.length > 0,
      bestNight,
      visibleNightsCount: visibleNights.length,
      nights: body.nights,
      error: null,
    };
  }).sort((a, b) => {
    if (a.visible && !b.visible) return -1;
    if (!a.visible && b.visible) return 1;
    return (b.bestNight?.maxElevation ?? -999) - (a.bestNight?.maxElevation ?? -999);
  });
}

module.exports = { getVisibleBodies, getWeeklyVisibility };
