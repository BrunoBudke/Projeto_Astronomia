const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authenticate(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-password');
  return user;
}

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Não autorizado. Faça login para continuar.',
    });
  }

  try {
    const user = await authenticate(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado. Token inválido.',
      });
    }
    req.user = user;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Sessão expirada. Faça login novamente.'
      : 'Token inválido.';
    return res.status(401).json({ success: false, message: msg });
  }
};

const protectStream = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Não autorizado. Faça login para continuar.',
    });
  }

  try {
    const user = await authenticate(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado. Token inválido.',
      });
    }
    req.user = user;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Sessão expirada. Faça login novamente.'
      : 'Token inválido.';
    return res.status(401).json({ success: false, message: msg });
  }
};

module.exports = { protect, protectStream };
