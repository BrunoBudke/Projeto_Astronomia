process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

jest.useFakeTimers();

describe('config/db', () => {
  let mockConnect;
  let mockOn;

  beforeEach(() => {
    jest.resetModules();
    mockConnect = jest.fn();
    mockOn = jest.fn();

    jest.mock('mongoose', () => ({
      connect: mockConnect,
      connection: {
        readyState: 0,
        on: mockOn,
        close: jest.fn(),
      },
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  it('conecta com sucesso e loga o host', async () => {
    mockConnect.mockResolvedValue({ connection: { host: 'localhost' } });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const connectDB = require('../config/db');
    await connectDB();

    expect(mockConnect).toHaveBeenCalledWith(process.env.MONGODB_URI, expect.any(Object));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('localhost'));
    consoleSpy.mockRestore();
  });

  it('registra listeners de disconnected e reconnected', async () => {
    mockConnect.mockResolvedValue({ connection: { host: 'localhost' } });
    jest.spyOn(console, 'log').mockImplementation(() => {});

    require('../config/db');

    expect(mockOn).toHaveBeenCalledWith('disconnected', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('reconnected', expect.any(Function));
  });

  it('listener disconnected loga aviso quando não stopped', async () => {
    mockConnect.mockResolvedValue({ connection: { host: 'localhost' } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    require('../config/db');

    const disconnectedCb = mockOn.mock.calls.find(([ev]) => ev === 'disconnected')[1];
    disconnectedCb();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('listener reconnected loga mensagem', async () => {
    mockConnect.mockResolvedValue({ connection: { host: 'localhost' } });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    require('../config/db');

    const reconnectedCb = mockOn.mock.calls.find(([ev]) => ev === 'reconnected')[1];
    reconnectedCb();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reconectado'));
    logSpy.mockRestore();
  });

  it('agenda retry em caso de erro de conexão', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connection refused'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const connectDB = require('../config/db');
    await connectDB();

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('não agenda retry quando stopped = true', async () => {
    mockConnect.mockRejectedValue(new Error('connection refused'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const connectDB = require('../config/db');
    connectDB.stopRetrying();
    await connectDB();

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('stopRetrying cancela timer existente', async () => {
    mockConnect.mockRejectedValueOnce(new Error('fail'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const connectDB = require('../config/db');
    await connectDB();

    connectDB.stopRetrying();
    jest.runAllTimers();

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
});
