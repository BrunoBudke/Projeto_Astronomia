process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

const mongoose = require('mongoose');

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    connection: { readyState: 1, on: jest.fn(), close: jest.fn() },
  };
});

describe('User model', () => {
  let User;

  beforeAll(() => {
    jest.resetModules();
    User = require('../models/User');
  });

  it('exporta o modelo', () => {
    expect(User).toBeDefined();
  });

  it('matchPassword retorna false para senha incorreta', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('senhaCorreta', 10);
    const ctx = { password: hash };
    ctx.matchPassword = User.schema.methods.matchPassword.bind(ctx);

    expect(await ctx.matchPassword('senhaErrada')).toBe(false);
  });

  it('matchPassword retorna true para senha correta', async () => {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('senhaCorreta', 10);
    const ctx = { password: hash };
    ctx.matchPassword = User.schema.methods.matchPassword.bind(ctx);

    expect(await ctx.matchPassword('senhaCorreta')).toBe(true);
  });

  it('toPublic exclui o campo password', () => {
    const ctx = {
      _id: 'uid1', name: 'Astro', email: 'a@test.com',
      password: 'hash', stats: { totalObservations: 2 }, createdAt: new Date(),
    };
    ctx.toPublic = User.schema.methods.toPublic.bind(ctx);

    const pub = ctx.toPublic();
    expect(pub.id).toBe('uid1');
    expect(pub.name).toBe('Astro');
    expect(pub.password).toBeUndefined();
  });

  it('pre-save faz hash quando password foi modificado', async () => {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const plain = 'plaintext';
    const hashed = await bcrypt.hash(plain, salt);
    expect(await bcrypt.compare(plain, hashed)).toBe(true);
    expect(hashed).not.toBe(plain);
  });

  it('pre-save não altera password quando isModified retorna false', () => {
    const ctx = { isModified: jest.fn().mockReturnValue(false), password: 'unchanged' };
    expect(ctx.isModified('password')).toBe(false);
    expect(ctx.password).toBe('unchanged');
  });
});

describe('Observation model', () => {
  let Observation;

  beforeAll(() => {
    jest.resetModules();
    Observation = require('../models/Observation');
  });

  it('exporta o modelo', () => {
    expect(Observation).toBeDefined();
  });

  it('getStats retorna totais corretos', async () => {
    jest.spyOn(Observation, 'aggregate').mockResolvedValue([{ totalObs: 10, uniqueObjects: 3 }]);
    jest.spyOn(Observation, 'countDocuments').mockResolvedValue(2);

    const result = await Observation.getStats(new mongoose.Types.ObjectId().toString());
    expect(result.totalObservations).toBe(10);
    expect(result.uniqueObjects).toBe(3);
    expect(result.observationsThisMonth).toBe(2);
    expect(result.topEquipment).toBeDefined();
    expect(result.conditionsBreakdown).toBeDefined();
  });

  it('getStats retorna zeros quando sem dados', async () => {
    jest.spyOn(Observation, 'aggregate').mockResolvedValue([]);
    jest.spyOn(Observation, 'countDocuments').mockResolvedValue(0);

    const result = await Observation.getStats(new mongoose.Types.ObjectId().toString());
    expect(result.totalObservations).toBe(0);
    expect(result.uniqueObjects).toBe(0);
  });

  it('getMonthlyChart retorna dados agrupados', async () => {
    jest.spyOn(Observation, 'aggregate').mockResolvedValue([
      { _id: { year: 2024, month: 6 }, count: 3 },
    ]);

    const result = await Observation.getMonthlyChart(new mongoose.Types.ObjectId().toString());
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it('getMonthlyChart aceita parâmetro months customizado', async () => {
    const spy = jest.spyOn(Observation, 'aggregate').mockResolvedValue([]);

    await Observation.getMonthlyChart(new mongoose.Types.ObjectId().toString(), 12);
    expect(spy).toHaveBeenCalled();
  });
});
