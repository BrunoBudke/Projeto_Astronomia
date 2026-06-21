const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const generateToken = (userId) =>
  jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, e-mail e senha são obrigatórios.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A senha deve ter ao menos 8 caracteres.',
      });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Este e-mail já está cadastrado.',
      });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      token,
      user: user.toPublic(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Este e-mail já está cadastrado.',
      });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    console.error('[POST /auth/register]', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'E-mail e senha são obrigatórios.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha incorretos.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha incorretos.',
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login realizado com sucesso!',
      token,
      user: user.toPublic(),
    });
  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
});

router.get('/me', protect, async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user.toPublic(),
  });
});

router.put('/me', protect, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (name) user.name = name;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Informe a senha atual para alterá-la.',
        });
      }
      const ok = await user.matchPassword(currentPassword);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: 'Senha atual incorreta.',
        });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'A nova senha deve ter ao menos 8 caracteres.',
        });
      }
      user.password = newPassword;
    }

    await user.save();
    res.status(200).json({
      success: true,
      message: 'Perfil atualizado.',
      user: user.toPublic(),
    });
  } catch (err) {
    console.error('[PUT /auth/me]', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
});

module.exports = router;
