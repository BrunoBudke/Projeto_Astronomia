import { useEffect, useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function useSkyStream({ lat, lon, enabled }) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!enabled || lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) {
      return undefined;
    }

    const token = localStorage.getItem('astro_token');
    if (!token) return undefined;

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      token,
    });

    const url = `${API_URL}/observations/sky-stream?${params.toString()}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener('open', () => {
      setConnected(true);
      setError('');
    });

    source.addEventListener('sky-update', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);
        setConnected(true);
        setError('');
      } catch {
        setError('Resposta inválida do servidor.');
      }
    });

    source.addEventListener('sky-error', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setError(parsed.message || 'Erro ao atualizar condições do céu.');
      } catch {
        setError('Erro ao atualizar condições do céu.');
      }
    });

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [lat, lon, enabled]);

  return { data, connected, error };
}
