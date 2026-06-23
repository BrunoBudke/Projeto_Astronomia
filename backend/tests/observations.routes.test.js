process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

jest.mock('../models/Observation');
jest.mock('../models/User');
jest.mock('../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'user123', updateOne: jest.fn().mockResolvedValue({}) };
    next();
  },
  protectStream: (req, _res, next) => {
    req.user = { _id: 'user123' };
    next();
  },
}));
jest.mock('../services/horizonsService', () => ({
  getVisibleBodies: jest.fn().mockResolvedValue([]),
  getWeeklyVisibility: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/weatherService', () => ({
  getNightSkyConditions: jest.fn().mockResolvedValue({ seeing: 'Bom' }),
  getCurrentCloudCover: jest.fn().mockResolvedValue({ cloudCover: 10 }),
}));
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    connection: { readyState: 1, on: jest.fn(), close: jest.fn() },
  };
});

const request = require('supertest');
const express = require('express');
const Observation = require('../models/Observation');
const { getWeeklyVisibility } = require('../services/horizonsService');
const obsRoutes = require('../routes/observations');

const app = express();
app.use(express.json());
app.use('/api/observations', obsRoutes);

describe('GET /api/observations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna lista paginada de observações', async () => {
    Observation.countDocuments.mockResolvedValue(2);
    Observation.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: 'obs1' }, { _id: 'obs2' }]),
    });

    const res = await request(app).get('/api/observations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filtra por objeto', async () => {
    Observation.countDocuments.mockResolvedValue(1);
    Observation.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: 'obs1', object: 'Lua' }]),
    });

    const res = await request(app).get('/api/observations?object=Lua');
    expect(res.status).toBe(200);
  });

  it('filtra por intervalo de datas (from e to)', async () => {
    Observation.countDocuments.mockResolvedValue(0);
    Observation.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });

    const res = await request(app).get('/api/observations?from=2024-01-01&to=2024-12-31');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('filtra apenas por from sem to', async () => {
    Observation.countDocuments.mockResolvedValue(0);
    Observation.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });

    const res = await request(app).get('/api/observations?from=2024-01-01');
    expect(res.status).toBe(200);
  });

  it('retorna 500 em erro de banco', async () => {
    Observation.countDocuments.mockRejectedValue(new Error('db error'));
    const res = await request(app).get('/api/observations');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/observations/stats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna estatísticas com sucesso', async () => {
    Observation.getStats = jest.fn().mockResolvedValue({ totalObservations: 5 });
    Observation.getMonthlyChart = jest.fn().mockResolvedValue([]);

    const res = await request(app).get('/api/observations/stats');
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
  });

  it('retorna 500 em erro', async () => {
    Observation.getStats = jest.fn().mockRejectedValue(new Error('crash'));
    const res = await request(app).get('/api/observations/stats');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/observations/suggestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 sem parâmetros', async () => {
    const res = await request(app).get('/api/observations/suggestions');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para coordenadas inválidas', async () => {
    const res = await request(app).get('/api/observations/suggestions?lat=999&lon=0&date=2024-01-01');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para data inválida', async () => {
    const res = await request(app).get('/api/observations/suggestions?lat=-27&lon=-48&date=invalida');
    expect(res.status).toBe(400);
  });

  it('retorna sugestões com parâmetros válidos', async () => {
    const res = await request(app).get('/api/observations/suggestions?lat=-27.5&lon=-48.5&date=2024-06-01');
    expect(res.status).toBe(200);
    expect(res.body.bodies).toBeDefined();
  });

  it('retorna 500 em erro de serviço', async () => {
    const { getVisibleBodies } = require('../services/horizonsService');
    getVisibleBodies.mockRejectedValueOnce(new Error('service crash'));

    const res = await request(app).get('/api/observations/suggestions?lat=-27.5&lon=-48.5&date=2024-06-01');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/observations/suggestions/week', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 sem parâmetros', async () => {
    const res = await request(app).get('/api/observations/suggestions/week');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para coordenadas inválidas', async () => {
    const res = await request(app).get('/api/observations/suggestions/week?lat=999&lon=0&date=2024-01-01');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para data inválida', async () => {
    const res = await request(app).get('/api/observations/suggestions/week?lat=-27&lon=-48&date=invalida');
    expect(res.status).toBe(400);
  });

  it('retorna sugestões semanais com corpos já observados', async () => {
    Observation.distinct = jest.fn().mockResolvedValue(['lua', 'marte']);
    Observation.aggregate = jest.fn().mockResolvedValue([{ _id: 'lua', count: 3 }]);
    getWeeklyVisibility.mockResolvedValueOnce([
      { name: 'Lua', visible: true, bestNight: null },
      { name: 'Marte', visible: false, bestNight: null },
    ]);

    const res = await request(app).get('/api/observations/suggestions/week?lat=-27.5&lon=-48.5&date=2024-06-01');
    expect(res.status).toBe(200);
    expect(res.body.bodies).toBeDefined();
    expect(res.body.recommended).toBeDefined();
  });

  it('retorna sugestões semanais quando todos os corpos já foram observados', async () => {
    Observation.distinct = jest.fn().mockResolvedValue(['lua']);
    Observation.aggregate = jest.fn().mockResolvedValue([]);
    getWeeklyVisibility.mockResolvedValueOnce([
      { name: 'Lua', visible: true, bestNight: null },
    ]);

    const res = await request(app).get('/api/observations/suggestions/week?lat=-27.5&lon=-48.5&date=2024-06-01');
    expect(res.status).toBe(200);
  });

  it('retorna 500 em erro de serviço', async () => {
    Observation.distinct = jest.fn().mockResolvedValue([]);
    Observation.aggregate = jest.fn().mockResolvedValue([]);
    getWeeklyVisibility.mockRejectedValueOnce(new Error('crash'));

    const res = await request(app).get('/api/observations/suggestions/week?lat=-27.5&lon=-48.5&date=2024-06-01');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/observations/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna observação por ID', async () => {
    Observation.findOne.mockResolvedValue({ _id: 'obs1', object: 'Lua' });

    const res = await request(app).get('/api/observations/obs1');
    expect(res.status).toBe(200);
    expect(res.body.data.object).toBe('Lua');
  });

  it('retorna 404 quando não encontrado', async () => {
    Observation.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/observations/naoexiste');
    expect(res.status).toBe(404);
  });

  it('retorna 400 para CastError', async () => {
    Observation.findOne.mockRejectedValue(Object.assign(new Error('cast'), { name: 'CastError' }));
    const res = await request(app).get('/api/observations/id-invalido');
    expect(res.status).toBe(400);
  });

  it('retorna 500 em erro inesperado', async () => {
    Observation.findOne.mockRejectedValue(new Error('crash'));
    const res = await request(app).get('/api/observations/obs1');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/observations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 sem campos obrigatórios', async () => {
    const res = await request(app).post('/api/observations').send({ object: 'Lua' });
    expect(res.status).toBe(400);
  });

  it('cria observação com sucesso', async () => {
    Observation.create.mockResolvedValue({ _id: 'obs1', object: 'Lua', date: new Date() });

    const res = await request(app).post('/api/observations').send({
      object: 'Lua',
      date: '2024-06-01',
      equipment: 'Telescópio',
      conditions: 'Bom',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('cria observação com campos opcionais', async () => {
    Observation.create.mockResolvedValue({ _id: 'obs1', object: 'Lua', date: new Date() });

    const res = await request(app).post('/api/observations').send({
      object: 'Lua',
      date: '2024-06-01',
      equipment: 'Telescópio',
      conditions: 'Bom',
      location: 'Florianópolis',
      lat: '-27.5',
      lon: '-48.5',
      notes: 'Visibilidade ótima',
    });
    expect(res.status).toBe(201);
  });

  it('retorna 400 para ValidationError', async () => {
    Observation.create.mockRejectedValue(Object.assign(new Error('val'), {
      name: 'ValidationError',
      errors: { conditions: { message: 'Valor inválido' } },
    }));

    const res = await request(app).post('/api/observations').send({
      object: 'Lua', date: '2024-06-01', equipment: 'Telescópio', conditions: 'Invalido',
    });
    expect(res.status).toBe(400);
  });

  it('retorna 500 em erro inesperado', async () => {
    Observation.create.mockRejectedValue(new Error('crash'));
    const res = await request(app).post('/api/observations').send({
      object: 'Lua', date: '2024-06-01', equipment: 'Telescópio', conditions: 'Bom',
    });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/observations/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 quando observação não encontrada', async () => {
    Observation.findOne.mockResolvedValue(null);
    const res = await request(app).put('/api/observations/naoexiste').send({ object: 'Saturno' });
    expect(res.status).toBe(404);
  });

  it('atualiza campos básicos com sucesso', async () => {
    const fakeObs = {
      _id: 'obs1', object: 'Lua', date: new Date(), equipment: 'Telescópio',
      conditions: 'Bom', notes: '', location: { name: '', lat: null, lon: null },
      photo: { url: null, filename: null },
      save: jest.fn().mockResolvedValue(true),
    };
    Observation.findOne.mockResolvedValue(fakeObs);

    const res = await request(app).put('/api/observations/obs1').send({
      object: 'Marte', date: '2024-07-01', equipment: 'Binóculo', conditions: 'Excelente', notes: 'Top',
    });
    expect(res.status).toBe(200);
    expect(fakeObs.object).toBe('Marte');
  });

  it('atualiza localização com coordenadas', async () => {
    const fakeObs = {
      _id: 'obs1', object: 'Lua', location: { name: '', lat: null, lon: null },
      photo: { url: null, filename: null },
      save: jest.fn().mockResolvedValue(true),
    };
    Observation.findOne.mockResolvedValue(fakeObs);

    const res = await request(app).put('/api/observations/obs1').send({
      location: 'Floripa', lat: '-27.5', lon: '-48.5',
    });
    expect(res.status).toBe(200);
    expect(fakeObs.location.name).toBe('Floripa');
    expect(fakeObs.location.lat).toBe(-27.5);
  });

  it('atualiza localização sem coordenadas (null)', async () => {
    const fakeObs = {
      _id: 'obs1', object: 'Lua', location: { name: 'old', lat: -10, lon: -10 },
      photo: { url: null, filename: null },
      save: jest.fn().mockResolvedValue(true),
    };
    Observation.findOne.mockResolvedValue(fakeObs);

    const res = await request(app).put('/api/observations/obs1').send({ location: 'Nova' });
    expect(res.status).toBe(200);
    expect(fakeObs.location.lat).toBeNull();
  });

  it('retorna 400 para ValidationError no save', async () => {
    const fakeObs = {
      _id: 'obs1', object: 'Lua', location: { name: '' }, photo: {},
      save: jest.fn().mockRejectedValue(Object.assign(new Error('val'), {
        name: 'ValidationError',
        errors: { conditions: { message: 'Inválido' } },
      })),
    };
    Observation.findOne.mockResolvedValue(fakeObs);

    const res = await request(app).put('/api/observations/obs1').send({ conditions: 'Errado' });
    expect(res.status).toBe(400);
  });

  it('remove foto existente quando removePhoto=true', async () => {
    const fakeObs = {
      _id: 'obs1', object: 'Lua',
      location: { name: '', lat: null, lon: null },
      photo: { url: '/uploads/old.jpg', filename: 'old.jpg' },
      save: jest.fn().mockResolvedValue(true),
    };
    Observation.findOne.mockResolvedValue(fakeObs);

    const res = await request(app).put('/api/observations/obs1').send({ removePhoto: 'true' });
    expect(res.status).toBe(200);
    expect(fakeObs.photo.url).toBeNull();
  });

  it('retorna 500 em erro inesperado', async () => {
    Observation.findOne.mockRejectedValue(new Error('crash'));
    const res = await request(app).put('/api/observations/obs1').send({ object: 'X' });
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/observations/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 quando observação não encontrada', async () => {
    Observation.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app).delete('/api/observations/naoexiste');
    expect(res.status).toBe(404);
  });

  it('deleta observação sem foto com sucesso', async () => {
    Observation.findOneAndDelete.mockResolvedValue({ _id: 'obs1', photo: { url: null, filename: null } });

    const res = await request(app).delete('/api/observations/obs1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('deleta observação com foto (arquivo inexistente no disco)', async () => {
    Observation.findOneAndDelete.mockResolvedValue({
      _id: 'obs1',
      photo: { url: '/uploads/foto.jpg', filename: 'foto.jpg' },
    });

    const res = await request(app).delete('/api/observations/obs1');
    expect(res.status).toBe(200);
  });

  it('retorna 500 em erro inesperado', async () => {
    Observation.findOneAndDelete.mockRejectedValue(new Error('crash'));
    const res = await request(app).delete('/api/observations/obs1');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/observations/sky-stream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 sem coordenadas', async () => {
    const res = await request(app).get('/api/observations/sky-stream');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para lat inválida', async () => {
    const res = await request(app).get('/api/observations/sky-stream?lat=999&lon=-48');
    expect(res.status).toBe(400);
  });

  it('retorna 400 para lon inválida', async () => {
    const res = await request(app).get('/api/observations/sky-stream?lat=-27&lon=999');
    expect(res.status).toBe(400);
  });

  it('abre stream SSE com coordenadas válidas', (done) => {
    const http = require('http');
    const { getCurrentCloudCover } = require('../services/weatherService');
    getCurrentCloudCover.mockResolvedValue({ cloudCover: 10, available: true });

    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      const req = http.get(`http://localhost:${port}/api/observations/sky-stream?lat=-27.5&lon=-48.5`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        req.destroy();
        server.close(done);
      });
      req.on('error', () => server.close(done));
    });
  }, 10000);
});
