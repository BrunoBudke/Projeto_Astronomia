const mongoose = require('mongoose');

const ObservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    object: {
      type: String,
      required: [true, 'Objeto observado é obrigatório'],
      trim: true,
      maxlength: [120, 'Nome do objeto muito longo'],
    },

    date: {
      type: Date,
      required: [true, 'Data da observação é obrigatória'],
      index: true,
    },

    equipment: {
      type: String,
      required: [true, 'Equipamento é obrigatório'],
      trim: true,
      maxlength: [100, 'Nome do equipamento muito longo'],
    },

    conditions: {
      type: String,
      enum: ['Excelente', 'Bom', 'Regular', 'Ruim'],
      required: [true, 'Condições do céu são obrigatórias'],
    },

    location: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      lat: { type: Number, default: null },
      lon: { type: Number, default: null },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notas muito longas (máx. 2000 caracteres)'],
      default: '',
    },

    photo: {
      url: { type: String, default: null },
      filename: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

ObservationSchema.index({ user: 1, date: -1 });
ObservationSchema.index({ user: 1, object: 1 });

ObservationSchema.statics.getStats = async function (userId) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totals, monthCount, equipStats, conditionStats] = await Promise.all([
    this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalObs: { $sum: 1 },
          uniqueObjects: { $addToSet: '$object' },
        },
      },
      {
        $project: {
          totalObs: 1,
          uniqueObjects: { $size: '$uniqueObjects' },
        },
      },
    ]),

    this.countDocuments({
      user: userId,
      date: { $gte: startMonth },
    }),

    this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$equipment', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]),

    this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$conditions', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    totalObservations: totals[0]?.totalObs ?? 0,
    uniqueObjects: totals[0]?.uniqueObjects ?? 0,
    observationsThisMonth: monthCount,
    topEquipment: equipStats.map(e => ({ name: e._id, count: e.count })),
    conditionsBreakdown: conditionStats.map(c => ({ name: c._id, count: c.count })),
  };
};

ObservationSchema.statics.getMonthlyChart = async function (userId, months = 6) {
  const start = new Date();
  start.setMonth(start.getMonth() - months + 1);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), date: { $gte: start } } },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);
};

module.exports = mongoose.model('Observation', ObservationSchema);
