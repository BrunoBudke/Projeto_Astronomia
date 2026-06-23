import { useState } from 'react';
import AppHeader from '../components/AppHeader';
import LiveSkyWidget from '../components/LiveSkyWidget';
import * as obsService from '../services/observationService';
import './Observations.css';
import './Suggestions.css';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function skyTone(avgCloudCover, hasStorm, hasRain) {
  if (hasStorm) return 'worse';
  if (hasRain) return 'bad';
  if (avgCloudCover === null) return 'fair';
  if (avgCloudCover <= 15) return 'good';
  if (avgCloudCover <= 40) return 'fair';
  if (avgCloudCover <= 70) return 'bad';
  return 'worse';
}

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatWeekday(isoDate, isToday) {
  if (isToday) return 'Hoje';
  const [y, m, d] = isoDate.split('-');
  const label = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('pt-BR', { weekday: 'short' });
  return label.replace('.', '').slice(0, 3);
}

function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function formatTime(horizonsTimeStr) {
  if (!horizonsTimeStr) return '—';
  const parts = horizonsTimeStr.trim().split(' ');
  return parts[parts.length - 1] || horizonsTimeStr;
}

function formatDegrees(value) {
  return value === null || value === undefined ? '—' : `${value}°`;
}

function formatNightDate(isoDate) {
  if (!isoDate) return '—';
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

export default function SuggestionsPage() {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [date, setDate] = useState(todayISO());
  const [locating, setLocating] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);

  function handleUseMyLocation() {
    setErrorMsg('');

    if (!navigator.geolocation) {
      setErrorMsg('Seu navegador não suporta geolocalização. Informe as coordenadas manualmente.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude.toFixed(4)));
        setLon(String(position.coords.longitude.toFixed(4)));
        setLocationLabel('Localização atual (GPS)');
        setLocating(false);
      },
      () => {
        setErrorMsg('Não foi possível obter sua localização. Verifique a permissão do navegador ou informe as coordenadas manualmente.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (lat === '' || lon === '' || Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      setErrorMsg('Informe latitude e longitude válidas (ou use sua localização atual).');
      return;
    }
    if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      setErrorMsg('Coordenadas fora do intervalo válido.');
      return;
    }
    if (!date) {
      setErrorMsg('Selecione uma data.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await obsService.getWeeklySuggestions({ lat: latNum, lon: lonNum, date });
      setResult(data);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Erro ao buscar sugestões. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />

      <main className="app-main">
        <div className="toolbar">
          <h1>Sugestões de observação</h1>
        </div>
        <p style={{ color: 'var(--ink-soft)', marginTop: -10, marginBottom: 20, fontSize: '0.9rem' }}>
          Informe local e data inicial para ver quais astros estarão visíveis ao longo da semana e como estará o céu.
        </p>

        <form className="suggestions-form" onSubmit={handleSubmit}>
          <div className="suggestions-form-row">
            <div className="location-field">
              <label htmlFor="lat">Latitude</label>
              <input
                id="lat"
                type="number"
                step="any"
                placeholder="Ex: -27.5954"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setLocationLabel('');
                }}
              />
              <div className="field-hint">{locationLabel || 'Use sua localização ou digite manualmente'}</div>
              <button type="button" className="btn-locate" onClick={handleUseMyLocation} disabled={locating}>
                {locating ? 'Localizando…' : 'Usar minha localização'}
              </button>
            </div>

            <div className="field">
              <label htmlFor="lon">Longitude</label>
              <input
                id="lon"
                type="number"
                step="any"
                placeholder="Ex: -48.5480"
                value={lon}
                onChange={(e) => {
                  setLon(e.target.value);
                  setLocationLabel('');
                }}
              />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="date">Início da semana</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <button className="btn-primary-sm suggestions-submit" type="submit" style={{ marginTop: 16 }} disabled={loading}>
            {loading ? 'Buscando…' : 'Ver sugestões da semana'}
          </button>
        </form>

        {errorMsg && <div className="auth-alert">{errorMsg}</div>}

        <LiveSkyWidget
          lat={lat !== '' ? Number(lat) : null}
          lon={lon !== '' ? Number(lon) : null}
        />

        {result && (
          <>
            <TonightCard sky={result.sky} date={result.query.startDate} />
            <WeekStrip daily={result.sky?.daily} referenceDate={result.query.startDate} />
            <RecommendedBanner bodies={result.bodies} recommended={result.recommended} historySummary={result.historySummary} />
            <BodiesSection bodies={result.bodies} />
          </>
        )}
      </main>
    </div>
  );
}

function TonightCard({ sky, date }) {
  if (!sky?.available) {
    return (
      <div className="sky-unavailable">
        Não foi possível obter a previsão do céu para essa data{sky?.error ? `: ${sky.error}` : '.'} A Open-Meteo
        fornece previsão apenas para os próximos dias.
      </div>
    );
  }

  const { avgCloudCover, minCloudCover, maxCloudCover, maxPrecipProbability, weatherLabel, hasFog, hasRain, hasStorm } = sky.summary;
  const tone = skyTone(avgCloudCover, hasStorm, hasRain);

  return (
    <div className="tonight-card">
      <div className={`tonight-tone-badge tone-${tone}`}>
        {weatherLabel || 'Condição indisponível'}
      </div>
      <div className="tonight-details">
        <h3>Noite de {formatDateLabel(date)}</h3>
        <div className="tonight-stats">
          <span className="tonight-stat">Nuvens méd. {avgCloudCover}%</span>
          <span className="tonight-stat">mín. {minCloudCover}% / máx. {maxCloudCover}%</span>
          {maxPrecipProbability !== null && <span className="tonight-stat">Chance de chuva {maxPrecipProbability}%</span>}
        </div>
        <div className="tonight-flags">
          {hasRain && <span className="tonight-flag flag-rain">Possibilidade de chuva</span>}
          {hasFog && <span className="tonight-flag flag-fog">Possibilidade de névoa</span>}
          {hasStorm && <span className="tonight-flag flag-storm">Possibilidade de tempestade</span>}
        </div>
      </div>
    </div>
  );
}

function WeekStrip({ daily, referenceDate }) {
  if (!daily?.length) return null;

  return (
    <>
      <div className="bodies-section-title">
        <h2>Previsão dos próximos dias</h2>
      </div>
      <div className="week-strip">
        {daily.map((day) => {
          const isToday = day.date === referenceDate;
          const tone = skyTone(day.cloudCoverMean, day.isStorm, day.isRain);
          return (
            <div key={day.date} className={`week-day-card tone-${tone} ${isToday ? 'is-today' : ''}`}>
              <span className="week-day-name">{formatWeekday(day.date, isToday)}</span>
              <span className="week-day-date">{formatShortDate(day.date)}</span>
              <span className="week-day-temps">
                {day.temperatureMax !== null ? Math.round(day.temperatureMax) : '—'}°
                <span className="temp-min">{day.temperatureMin !== null ? Math.round(day.temperatureMin) : '—'}°</span>
              </span>
              {day.precipitationProbability !== null && (
                <span className="week-day-precip">{day.precipitationProbability}% chuva</span>
              )}
              <span className="week-day-label">{day.weatherLabel}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RecommendedBanner({ bodies, recommended, historySummary }) {
  if (!recommended?.length) return null;

  const recommendedBodies = recommended
    .map((name) => bodies.find((b) => b.name === name))
    .filter(Boolean);

  return (
    <div className="recommended-banner">
      <div className="recommended-banner-title">
        Destaques da semana
        {historySummary && (
          <span className="recommended-banner-sub">
            Com base nos {historySummary.totalObservedObjects} objetos que você já observou
          </span>
        )}
      </div>
      <div className="recommended-list">
        {recommendedBodies.map((body) => (
          <div key={body.name} className="recommended-item">
            <span className="recommended-name">{body.name}</span>
            <span className={`recommended-tag ${body.alreadyObserved ? 'seen' : 'new'}`}>
              {body.alreadyObserved ? 'Já observado' : 'Novo para você'}
            </span>
            {body.bestNight && (
              <span className="recommended-night">
                Melhor noite: {formatNightDate(body.bestNight.date)} às {formatTime(body.bestNight.bestTime)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BodiesSection({ bodies }) {
  if (!bodies?.length) {
    return <p style={{ color: 'var(--ink-soft)' }}>Nenhum dado de visibilidade disponível.</p>;
  }

  const visibleCount = bodies.filter((b) => b.visible).length;

  return (
    <>
      <div className="bodies-section-title">
        <h2>Astros da semana</h2>
        <span className="count-tag">{visibleCount} de {bodies.length} visíveis em algum momento</span>
      </div>
      <div className="bodies-grid">
        {bodies.map((body) => (
          <BodyCard key={body.name} body={body} />
        ))}
      </div>
    </>
  );
}

function BodyCard({ body }) {
  return (
    <div className={`body-card ${body.visible ? '' : 'not-visible'}`}>
      <div className="body-card-top">
        <span className="body-name">{body.name}</span>
        <span className={`visibility-badge ${body.visible ? 'visible' : 'hidden'}`}>
          {body.visible ? 'Visível' : 'Não visível'}
        </span>
      </div>

      <div className="body-history-tag">
        {body.alreadyObserved ? (
          <span className="history-tag seen">Você já observou {body.timesObserved}x</span>
        ) : (
          <span className="history-tag new">Novo para você</span>
        )}
      </div>

      {body.error ? (
        <p className="body-card-error">{body.error}</p>
      ) : body.bestNight ? (
        <>
          <div className="body-detail-row">
            <span>Melhor noite</span>
            <span>{formatNightDate(body.bestNight.date)}</span>
          </div>
          <div className="body-detail-row">
            <span>Melhor horário</span>
            <span>{formatTime(body.bestNight.bestTime)}</span>
          </div>
          <div className="body-detail-row">
            <span>Elevação máx.</span>
            <span>{formatDegrees(body.bestNight.maxElevation)}</span>
          </div>
          <div className="body-detail-row">
            <span>Azimute</span>
            <span>{formatDegrees(body.bestNight.azimuth)}</span>
          </div>
          {body.bestNight.magnitude !== null && (
            <div className="body-detail-row">
              <span>Magnitude</span>
              <span>{body.bestNight.magnitude}</span>
            </div>
          )}
          <div className="body-detail-row">
            <span>Noites visíveis</span>
            <span>{body.visibleNightsCount} de 7</span>
          </div>
        </>
      ) : (
        <p className="body-card-error">Sem janela de visibilidade nesta semana.</p>
      )}
    </div>
  );
}
