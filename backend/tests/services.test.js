describe('weatherService - funções internas', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('getNightSkyConditions retorna dados com fetch bem-sucedido', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'America/Sao_Paulo',
        hourly: {
          time: ['2024-06-01T21:00', '2024-06-01T23:00', '2024-06-02T02:00', '2024-06-02T04:00'],
          cloudcover: [10, 20, 15, 5],
          precipitation_probability: [0, 5, 0, 0],
          visibility: [10000, 9000, 8000, 10000],
          weathercode: [0, 1, 0, 0],
        },
        daily: {
          time: ['2024-06-01'],
          weathercode: [0],
          temperature_2m_max: [20],
          temperature_2m_min: [12],
          precipitation_probability_max: [5],
          precipitation_sum: [0],
          windspeed_10m_max: [10],
        },
      }),
    });

    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.daily).toBeDefined();
  });

  it('getNightSkyConditions retorna available:false em falha de rede', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(false);
  });

  it('getNightSkyConditions retorna available:false em timeout', async () => {
    const abortErr = new Error('AbortError');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(false);
    expect(result.error).toContain('limite');
  });

  it('getNightSkyConditions retorna available:false em status não-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ reason: 'Internal error' }),
    });
    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(false);
  });

  it('getNightSkyConditions trata sem dados horários', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'America/Sao_Paulo',
        hourly: { time: [], cloudcover: [] },
        daily: { time: [] },
      }),
    });
    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(false);
  });

  it('getNightSkyConditions retorna available:false quando sem dados noturnos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'America/Sao_Paulo',
        hourly: {
          time: ['2024-06-01T12:00', '2024-06-01T14:00'],
          cloudcover: [10, 20],
          precipitation_probability: [0, 0],
          visibility: [10000, 10000],
          weathercode: [0, 0],
        },
        daily: { time: [] },
      }),
    });
    const { getNightSkyConditions } = require('../services/weatherService');
    const result = await getNightSkyConditions({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(result.available).toBe(false);
  });

  it('getCurrentCloudCover retorna dados atuais com sucesso', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'America/Sao_Paulo',
        current: {
          time: '2024-06-01T21:00',
          cloud_cover: 15,
          temperature_2m: 18,
          weathercode: 1,
          wind_speed_10m: 5,
        },
      }),
    });
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: -27.5, lon: -48.5 });
    expect(result.available).toBe(true);
    expect(result.cloudCover).toBe(15);
    expect(result.skyQuality).toBe('Excelente');
  });

  it('getCurrentCloudCover retorna available:false em falha de rede', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: -27.5, lon: -48.5 });
    expect(result.available).toBe(false);
  });

  it('getCurrentCloudCover retorna available:false em status não-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('no json')),
    });
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: -27.5, lon: -48.5 });
    expect(result.available).toBe(false);
  });

  it('getCurrentCloudCover retorna available:false sem campo current', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ timezone: 'UTC' }),
    });
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: -27.5, lon: -48.5 });
    expect(result.available).toBe(false);
  });

  it('weatherCodeLabel retorna rótulo correto', async () => {
    const { weatherCodeLabel } = require('../services/weatherService');
    expect(weatherCodeLabel(0)).toBe('Céu limpo');
    expect(weatherCodeLabel(3)).toBe('Nublado');
    expect(weatherCodeLabel(999)).toBe('Condição desconhecida');
  });

  it('classifica qualidade do céu por cobertura de nuvens', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'UTC',
        current: { time: '2024-06-01T21:00', cloud_cover: 60, temperature_2m: 18, weathercode: 2, wind_speed_10m: 3 },
      }),
    });
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: 0, lon: 0 });
    expect(result.skyQuality).toBe('Regular');
  });

  it('classifica qualidade Ruim para cobertura alta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        timezone: 'UTC',
        current: { time: '2024-06-01T21:00', cloud_cover: 90, temperature_2m: 15, weathercode: 3, wind_speed_10m: 8 },
      }),
    });
    const { getCurrentCloudCover } = require('../services/weatherService');
    const result = await getCurrentCloudCover({ lat: 0, lon: 0 });
    expect(result.skyQuality).toBe('Ruim');
  });
});

describe('horizonsService', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  const HORIZONS_RESPONSE_OK = {
    result: '$$SOE\n2024-Jun-01 21:00, , ,180.0, 45.0,  5.0, 90.0\n$$EOE',
  };

  it('getVisibleBodies retorna array vazio quando fetch falha', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch error'));
    const { getVisibleBodies } = require('../services/horizonsService');
    const result = await getVisibleBodies({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getVisibleBodies retorna corpos com dados válidos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(HORIZONS_RESPONSE_OK),
    });

    const { getVisibleBodies } = require('../services/horizonsService');
    const result = await getVisibleBodies({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(Array.isArray(result)).toBe(true);
    result.forEach((body) => {
      expect(body.name).toBeDefined();
    });
  });

  it('getVisibleBodies trata resposta não-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    });
    const { getVisibleBodies } = require('../services/horizonsService');
    const result = await getVisibleBodies({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getVisibleBodies trata resposta sem $$SOE/$$EOE', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'Sem dados de efeméride aqui.' }),
    });
    const { getVisibleBodies } = require('../services/horizonsService');
    const result = await getVisibleBodies({ lat: -27.5, lon: -48.5, date: '2024-06-01' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getWeeklyVisibility retorna array com bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(HORIZONS_RESPONSE_OK),
    });
    const { getWeeklyVisibility } = require('../services/horizonsService');
    const result = await getWeeklyVisibility({ lat: -27.5, lon: -48.5, startDate: '2024-06-01', days: 3 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('getWeeklyVisibility trata erros de fetch', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch error'));
    const { getWeeklyVisibility } = require('../services/horizonsService');
    const result = await getWeeklyVisibility({ lat: -27.5, lon: -48.5, startDate: '2024-06-01', days: 3 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getWeeklyVisibility trata resposta sem dados', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: '' }),
    });
    const { getWeeklyVisibility } = require('../services/horizonsService');
    const result = await getWeeklyVisibility({ lat: -27.5, lon: -48.5, startDate: '2024-06-01', days: 3 });
    result.forEach((b) => {
      expect(b.visible).toBe(false);
    });
  });
});
