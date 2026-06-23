const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Observation = require('../models/Observation');
const { protect, protectStream } = require('../middleware/auth');
const { getVisibleBodies, getWeeklyVisibility } = require('../services/horizonsService');
const { getNightSkyConditions, getCurrentCloudCover } = require('../services/weatherService');

const router = express.Router();

const SKY_STREAM_INTERVAL_MS = 60000;
const SKY_STREAM_HEARTBEAT_MS = 20000;

router.get('/sky-stream', protectStream, async (req, res) => {
  const { lat, lon } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lon);

  if (Number.isNaN(latitude) || Number.isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ success: false, message: 'Informe lat e lon válidos.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  function sendEvent(event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  async function pushUpdate() {
    try {
      const conditions = await getCurrentCloudCover({ lat: latitude, lon: longitude });
      sendEvent('sky-update', { ...conditions, fetchedAt: new Date().toISOString() });
    } catch {
      sendEvent('sky-error', { message: 'Falha ao consultar condições do céu.' });
    }
  }

  await pushUpdate();
  const updateTimer = setInterval(pushUpdate, SKY_STREAM_INTERVAL_MS);
  const heartbeatTimer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, SKY_STREAM_HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(updateTimer);
    clearInterval(heartbeatTimer);
  });
});

router.use(protect);

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `obs_${req.user._id}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Formato de imagem inválido. Use JPG, PNG ou WebP.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/', async (req, res) => {
  try {
    const { object, from, to, page = 1, limit = 20 } = req.query;

    const filter = { user: req.user._id };

    if (object) {
      filter.object = { $regex: object, $options: 'i' };
    }
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Observation.countDocuments(filter);

    const observations = await Observation.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data: observations,
    });
  } catch (err) {
    console.error('[GET /observations]', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar observações.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [stats, chart] = await Promise.all([
      Observation.getStats(req.user._id),
      Observation.getMonthlyChart(req.user._id),
    ]);
    res.status(200).json({ success: true, stats, chart });
  } catch (err) {
    console.error('[GET /observations/stats]', err);
    res.status(500).json({ success: false, message: 'Erro ao calcular estatísticas.' });
  }
});

router.get('/suggestions/week', async (req, res) => {
  try {
    const { lat, lon, date } = req.query;

    if (!lat || !lon || !date) {
      return res.status(400).json({
        success: false,
        message: 'Informe lat, lon e date (YYYY-MM-DD) para gerar sugestões da semana.',
      });
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Coordenadas inválidas.' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Data inválida. Use o formato YYYY-MM-DD.' });
    }

    const [bodies, sky, observedObjects, recentCounts] = await Promise.all([
      getWeeklyVisibility({ lat: latitude, lon: longitude, startDate: date, days: 7 }),
      getNightSkyConditions({ lat: latitude, lon: longitude, date }),
      Observation.distinct('object', { user: req.user._id }),
      Observation.aggregate([
        { $match: { user: req.user._id } },
        { $group: { _id: { $toLower: '$object' }, count: { $sum: 1 } } },
      ]),
    ]);

    const observedSet = new Set(observedObjects.map((o) => o.trim().toLowerCase()));
    const countByObject = new Map(recentCounts.map((c) => [c._id, c.count]));

    const enrichedBodies = bodies.map((body) => {
      const key = body.name.trim().toLowerCase();
      return {
        ...body,
        alreadyObserved: observedSet.has(key),
        timesObserved: countByObject.get(key) || 0,
      };
    });

    const newForUser = enrichedBodies.filter((b) => b.visible && !b.alreadyObserved);
    const recommended = newForUser.length > 0 ? newForUser : enrichedBodies.filter((b) => b.visible);

    res.status(200).json({
      success: true,
      query: { lat: latitude, lon: longitude, startDate: date, days: 7 },
      bodies: enrichedBodies,
      recommended: recommended.slice(0, 3).map((b) => b.name),
      sky,
      historySummary: {
        totalObservedObjects: observedSet.size,
      },
    });
  } catch (err) {
    console.error('[GET /observations/suggestions/week]', err);
    res.status(500).json({ success: false, message: 'Erro ao gerar sugestões da semana.' });
  }
});

router.get('/suggestions', async (req, res) => {
  try {
    const { lat, lon, date } = req.query;

    if (!lat || !lon || !date) {
      return res.status(400).json({
        success: false,
        message: 'Informe lat, lon e date (YYYY-MM-DD) para gerar sugestões.',
      });
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Coordenadas inválidas.' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Data inválida. Use o formato YYYY-MM-DD.' });
    }

    const [bodies, sky] = await Promise.all([
      getVisibleBodies({ lat: latitude, lon: longitude, date }),
      getNightSkyConditions({ lat: latitude, lon: longitude, date }),
    ]);

    res.status(200).json({
      success: true,
      query: { lat: latitude, lon: longitude, date },
      bodies,
      sky,
    });
  } catch (err) {
    console.error('[GET /observations/suggestions]', err);
    res.status(500).json({ success: false, message: 'Erro ao gerar sugestões de observação.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const obs = await Observation.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!obs) {
      return res.status(404).json({ success: false, message: 'Observação não encontrada.' });
    }
    res.status(200).json({ success: true, data: obs });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'ID inválido.' });
    }
    res.status(500).json({ success: false, message: 'Erro ao buscar observação.' });
  }
});

router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const { object, date, equipment, conditions, location, lat, lon, notes } = req.body;

    if (!object || !date || !equipment || !conditions) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Objeto, data, equipamento e condições são obrigatórios.',
      });
    }

    const obsData = {
      user: req.user._id,
      object: object.trim(),
      date: new Date(date),
      equipment: equipment.trim(),
      conditions,
      notes: notes?.trim() || '',
      location: {
        name: location?.trim() || '',
        lat: lat ? Number(lat) : null,
        lon: lon ? Number(lon) : null,
      },
    };

    if (req.file) {
      obsData.photo = {
        url: `/uploads/${req.file.filename}`,
        filename: req.file.filename,
      };
    }

    const obs = await Observation.create(obsData);

    await req.user.updateOne({
      $inc: { 'stats.totalObservations': 1 },
      $set: { 'stats.lastObservation': obs.date },
    });

    res.status(201).json({
      success: true,
      message: 'Observação registrada com sucesso!',
      data: obs,
    });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.name === 'ValidationError') {
      const msg = Object.values(err.errors).map((e) => e.message)[0];
      return res.status(400).json({ success: false, message: msg });
    }
    console.error('[POST /observations]', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar observação.' });
  }
});

router.put('/:id', upload.single('photo'), async (req, res) => {
  try {
    const obs = await Observation.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!obs) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Observação não encontrada.' });
    }

    const { object, date, equipment, conditions, location, lat, lon, notes, removePhoto } = req.body;

    if (object) obs.object = object.trim();
    if (date) obs.date = new Date(date);
    if (equipment) obs.equipment = equipment.trim();
    if (conditions) obs.conditions = conditions;
    if (notes !== undefined) obs.notes = notes.trim();

    if (location !== undefined) {
      obs.location.name = location.trim();
      obs.location.lat = lat ? Number(lat) : null;
      obs.location.lon = lon ? Number(lon) : null;
    }

    if (req.file) {
      if (obs.photo?.filename) {
        const old = path.join(uploadDir, obs.photo.filename);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      obs.photo = { url: `/uploads/${req.file.filename}`, filename: req.file.filename };
    } else if (removePhoto === 'true' && obs.photo?.filename) {
      const old = path.join(uploadDir, obs.photo.filename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
      obs.photo = { url: null, filename: null };
    }

    await obs.save();
    res.status(200).json({ success: true, message: 'Observação atualizada.', data: obs });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.name === 'ValidationError') {
      const msg = Object.values(err.errors).map((e) => e.message)[0];
      return res.status(400).json({ success: false, message: msg });
    }
    console.error('[PUT /observations/:id]', err);
    res.status(500).json({ success: false, message: 'Erro ao atualizar observação.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const obs = await Observation.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!obs) {
      return res.status(404).json({ success: false, message: 'Observação não encontrada.' });
    }

    if (obs.photo?.filename) {
      const file = path.join(uploadDir, obs.photo.filename);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    await req.user.updateOne({ $inc: { 'stats.totalObservations': -1 } });

    res.status(200).json({ success: true, message: 'Observação excluída.' });
  } catch (err) {
    console.error('[DELETE /observations/:id]', err);
    res.status(500).json({ success: false, message: 'Erro ao excluir observação.' });
  }
});

module.exports = router;
