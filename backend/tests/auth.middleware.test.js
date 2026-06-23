const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

jest.mock('../models/User');
const User = require('../models/User');

const { protect, protectStream } = require('../middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/auth - protect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 401 quando não há token', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 para token inválido', async () => {
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 quando usuário não existe no banco', async () => {
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() e define req.user quando token é válido', async () => {
    const fakeUser = { _id: 'user123', name: 'Astro' };
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(fakeUser);
  });

  it('retorna mensagem de sessão expirada para TokenExpiredError', async () => {
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: -1 });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('expirada') })
    );
  });
});

describe('middleware/auth - protectStream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 401 quando não há token', async () => {
    const req = { headers: {}, query: {} };
    const res = mockRes();
    const next = jest.fn();

    await protectStream(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('aceita token via query string', async () => {
    const fakeUser = { _id: 'user123', name: 'Astro' };
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const req = { headers: {}, query: { token } };
    const res = mockRes();
    const next = jest.fn();

    await protectStream(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(fakeUser);
  });

  it('aceita token via Authorization header', async () => {
    const fakeUser = { _id: 'user456' };
    const token = jwt.sign({ id: 'user456' }, process.env.JWT_SECRET);
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(fakeUser) });

    const req = { headers: { authorization: `Bearer ${token}` }, query: {} };
    const res = mockRes();
    const next = jest.fn();

    await protectStream(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('retorna 401 para token inválido via query', async () => {
    const req = { headers: {}, query: { token: 'invalido' } };
    const res = mockRes();
    const next = jest.fn();

    await protectStream(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
