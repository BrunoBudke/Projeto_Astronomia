import api from './api';

export async function listObservations(params = {}) {
  const { data } = await api.get('/observations', { params });
  return data;
}

export async function getObservation(id) {
  const { data } = await api.get(`/observations/${id}`);
  return data.data;
}

export async function getStats() {
  const { data } = await api.get('/observations/stats');
  return data;
}

export async function getSuggestions({ lat, lon, date }) {
  const { data } = await api.get('/observations/suggestions', { params: { lat, lon, date } });
  return data;
}

export async function getWeeklySuggestions({ lat, lon, date }) {
  const { data } = await api.get('/observations/suggestions/week', { params: { lat, lon, date } });
  return data;
}

export async function createObservation(payload) {
  const body = toFormData(payload);
  const { data } = await api.post('/observations', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function updateObservation(id, payload) {
  const body = toFormData(payload);
  const { data } = await api.put(`/observations/${id}`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function deleteObservation(id) {
  const { data } = await api.delete(`/observations/${id}`);
  return data;
}

function toFormData(payload) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, value);
  });
  return formData;
}
