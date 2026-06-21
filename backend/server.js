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

  app.get('*', (req, res) => {
    res.sendFile(frontendIndexHtml);
  });

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

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
  console.log(`Auth:         http://localhost:${PORT}/api/auth`);
  console.log(`Observações:  http://localhost:${PORT}/api/observations`);
  console.log(`Health:       http://localhost:${PORT}/api/health`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} recebido. Encerrando servidor...`);

  connectDB.stopRetrying();

  server.close(async (err) => {
    if (err) {
      console.error('Erro ao fechar o servidor HTTP:', err.message);
      process.exitCode = 1;
    } else {
      console.log(`Porta ${PORT} liberada.`);
    }

    try {
      await mongoose.connection.close();
      console.log('Conexão com o MongoDB encerrada.');
    } catch (mongoErr) {
      console.error('Erro ao fechar conexão com o MongoDB:', mongoErr.message);
    }

    console.log('Servidor encerrado com sucesso.\n');
    process.exit(process.exitCode || 0);
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
