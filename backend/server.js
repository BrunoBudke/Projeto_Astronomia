require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const obsRoutes = require('./routes/observations');

connectDB();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const ROUTES_WITHOUT_DB = ['/api/health', '/api/observations/suggestions'];

app.use('/api', (req, res, next) => {
  const fullPath = req.baseUrl + req.path;
  if (ROUTES_WITHOUT_DB.includes(fullPath) || mongoose.connection.readyState === 1) {
    return next();
  }
  res.status(503).json({
    success: false,
    message: 'Banco de dados ainda conectando. Tente novamente em alguns segundos.',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/observations', obsRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', env: process.env.NODE_ENV, time: new Date() })
);

app.use('/api', (req, res) =>
  res.status(404).json({ success: false, message: `Rota ${req.originalUrl} não encontrada.` })
);

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const frontendIndexHtml = path.join(frontendDist, 'index.html');
const frontendBuildExists = fs.existsSync(frontendIndexHtml);

if (frontendBuildExists) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(frontendIndexHtml));
  console.log('Build do frontend encontrado, servindo arquivos estáticos.');
} else {
  console.log('Build do frontend não encontrado em frontend/dist; rodando apenas como API.');
}

app.use((err, _req, res, _next) => {
  console.error('[Erro não tratado]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erro interno do servidor.',
  });
});

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT);

server.on('listening', () => {
  const addr = server.address();
  const port = addr ? addr.port : PORT;
  console.log(`Servidor rodando na porta ${port} [${process.env.NODE_ENV}]`);
  console.log(`Auth:         http://localhost:${port}/api/auth`);
  console.log(`Observações:  http://localhost:${port}/api/observations`);
  console.log(`Health:       http://localhost:${port}/api/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} já está em uso.`);
    console.error(`Solução: altere PORT no arquivo .env ou encerre o processo na porta ${PORT}.`);
    console.error(`Windows: netstat -ano | findstr :${PORT}  → taskkill /PID <pid> /F`);
    process.exit(1);
  } else {
    console.error('Erro ao iniciar o servidor:', err.message);
    process.exit(1);
  }
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} recebido. Encerrando servidor...`);

  connectDB.stopRetrying();

  const closeServer = new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        console.error('Erro ao fechar o servidor HTTP:', err.message);
      } else {
        console.log(`Porta ${PORT} liberada.`);
      }
      resolve();
    });
  });

  const closeDB = mongoose.connection.close().catch((err) => {
    console.error('Erro ao fechar conexão com o MongoDB:', err.message);
  });

  Promise.all([closeServer, closeDB]).then(() => {
    console.log('Servidor encerrado com sucesso.\n');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Encerramento forçado após timeout (5s).');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('Exceção não capturada:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem tratamento:', reason);
  shutdown('unhandledRejection');
});
