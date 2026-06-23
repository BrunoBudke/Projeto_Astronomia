process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

jest.mock('../models/User');
jest.mock('../config/db', () => {
  const fn = jest.fn().mockResolvedValue(undefined);
  fn.stopRetrying = jest.fn();
  return fn;
});
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
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authRoutes = require('../routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const fakePublic = { id: 'uid1', name: 'Astro User', email: 'astro@test.com', stats: {} };

function makeAuthHeader(userId = 'uid1') {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return `Bearer ${token}`;
}

describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 quando campos obrigatórios ausentes', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('retorna 400 para senha curta', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'x@x.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('retorna 409 quando e-mail já existe', async () => {
    User.findOne.mockResolvedValue({ _id: 'existing' });
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'dup@x.com', password: 'senha123' });
    expect(res.status).toBe(409);
  });

  it('cria usuário e retorna 201 com token', async () => {
    User.findOne.mockResolvedValue(null);
    const fakeUser = { _id: 'uid1', toPublic: jest.fn().mockReturnValue(fakePublic) };
    User.create.mockResolvedValue(fakeUser);

    const res = await request(app).post('/api/auth/register').send({ name: 'Astro', email: 'new@test.com', password: 'senha123' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it('retorna 409 para erro de chave duplicada (code 11000)', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'dup@x.com', password: 'senha123' });
    expect(res.status).toBe(409);
  });

  it('retorna 400 para ValidationError do mongoose', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockRejectedValue(Object.assign(new Error('val'), {
      name: 'ValidationError',
      errors: { name: { message: 'Nome inválido' } },
    }));

    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'v@x.com', password: 'senha123' });
    expect(res.status).toBe(400);
  });

  it('retorna 500 em erro inesperado', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockRejectedValue(new Error('db crash'));

    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'e@x.com', password: 'senha123' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 quando campos ausentes', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  it('retorna 401 quando usuário não existe', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = await request(app).post('/api/auth/login').send({ email: 'no@x.com', password: 'senha123' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 para senha incorreta', async () => {
    const fakeUser = { _id: 'uid1', matchPassword: jest.fn().mockResolvedValue(false) };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('retorna 200 com token em login bem-sucedido', async () => {
    const fakeUser = { _id: 'uid1', matchPassword: jest.fn().mockResolvedValue(true), toPublic: jest.fn().mockReturnValue(fakePublic) };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('retorna 500 em erro inesperado', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockRejectedValue(new Error('crash')) });
    const res = await request(app).post('/api/auth/login').send({ email: 'e@x.com', password: 'senha123' });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('retorna 200 com dados do usuário autenticado', async () => {
    const fakeUser = { _id: 'uid1', toPublic: jest.fn().mockReturnValue(fakePublic) };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).get('/api/auth/me').set('Authorization', makeAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(fakePublic);
  });
});

describe('PUT /api/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 401 sem token', async () => {
    const res = await request(app).put('/api/auth/me').send({ name: 'Novo' });
    expect(res.status).toBe(401);
  });

  it('atualiza nome com sucesso', async () => {
    const fakeUser = {
      _id: 'uid1',
      name: 'Antigo',
      save: jest.fn().mockResolvedValue(true),
      toPublic: jest.fn().mockReturnValue({ ...fakePublic, name: 'Novo' }),
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ name: 'Novo' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('retorna 400 ao trocar senha sem informar a senha atual', async () => {
    const fakeUser = {
      _id: 'uid1',
      save: jest.fn(),
      toPublic: jest.fn().mockReturnValue(fakePublic),
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ newPassword: 'novaSenha123' });
    expect(res.status).toBe(400);
  });

  it('retorna 401 quando senha atual incorreta', async () => {
    const fakeUser = {
      _id: 'uid1',
      matchPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
      toPublic: jest.fn().mockReturnValue(fakePublic),
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ currentPassword: 'errada', newPassword: 'novaSenha123' });
    expect(res.status).toBe(401);
  });

  it('retorna 400 para nova senha curta', async () => {
    const fakeUser = {
      _id: 'uid1',
      matchPassword: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
      toPublic: jest.fn().mockReturnValue(fakePublic),
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ currentPassword: 'correta123', newPassword: '123' });
    expect(res.status).toBe(400);
  });

  it('troca senha com sucesso', async () => {
    const fakeUser = {
      _id: 'uid1',
      matchPassword: jest.fn().mockResolvedValue(true),
      password: 'old',
      save: jest.fn().mockResolvedValue(true),
      toPublic: jest.fn().mockReturnValue(fakePublic),
    };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ currentPassword: 'correta123', newPassword: 'novaSenha123' });
    expect(res.status).toBe(200);
    expect(fakeUser.password).toBe('novaSenha123');
  });

  it('retorna 500 em erro inesperado na atualização', async () => {
    const fakeUser = {
      _id: 'uid1',
      save: jest.fn().mockRejectedValue(new Error('crash')),
      toPublic: jest.fn().mockReturnValue(fakePublic),
    };
    User.findById
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: 'uid1', toPublic: jest.fn().mockReturnValue(fakePublic) }) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(fakeUser) });

    const res = await request(app).put('/api/auth/me').set('Authorization', makeAuthHeader()).send({ name: 'X' });
    expect(res.status).toBe(500);
  });
});
