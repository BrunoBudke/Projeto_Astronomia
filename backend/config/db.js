const mongoose = require('mongoose');

const RETRY_DELAY_MS = 5000;
let retryTimer = null;
let stopped = false;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB conectado: ${conn.connection.host}`);
  } catch (err) {
    if (stopped) return;
    console.error(`Erro ao conectar ao MongoDB: ${err.message}`);
    console.error(`Servidor tentando reconectar em ${RETRY_DELAY_MS / 1000}s...`);
    console.error('Dica: confira se o seu IP atual está liberado em Network Access no MongoDB Atlas.');
    retryTimer = setTimeout(connectDB, RETRY_DELAY_MS);
  }
};

connectDB.stopRetrying = () => {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
};

mongoose.connection.on('disconnected', () => {
  if (!stopped) console.warn('Conexão com o MongoDB perdida. Tentando reconectar automaticamente...');
});

mongoose.connection.on('reconnected', () => {
  console.log('Reconectado ao MongoDB.');
});

module.exports = connectDB;
