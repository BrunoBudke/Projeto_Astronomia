const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      minlength: [2, 'Nome deve ter ao menos 2 caracteres'],
      maxlength: [80, 'Nome deve ter no máximo 80 caracteres'],
    },

    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Formato de e-mail inválido'],
    },

    password: {
      type: String,
      required: [true, 'Senha é obrigatória'],
      minlength: [8, 'Senha deve ter ao menos 8 caracteres'],
      select: false,
    },

    avatar: {
      type: String,
      default: null,
    },

    stats: {
      totalObservations: { type: Number, default: 0 },
      lastObservation: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

UserSchema.methods.toPublic = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    stats: this.stats,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
