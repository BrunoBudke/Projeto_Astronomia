import { useEffect, useState, useCallback } from 'react';
import * as obsService from '../services/observationService';
import ObservationFormModal from '../components/ObservationFormModal';
import AppHeader from '../components/AppHeader';
import './Observations.css';

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ObservationsPage() {
  const [observations, setObservations] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadObservations = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await obsService.listObservations({
        object: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page,
        limit: 12,
      });
      setObservations(res.data);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Erro ao carregar observações.');
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, page]);

  const refreshStats = useCallback(() => {
    obsService.getStats().then((res) => {
      setStats(res.stats);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  function openCreateModal() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditModal(obs) {
    setEditing(obs);
    setModalOpen(true);
  }

  async function handleFormSubmit(payload) {
    if (editing) {
      await obsService.updateObservation(editing._id, payload);
    } else {
      await obsService.createObservation(payload);
    }
    setModalOpen(false);
    setEditing(null);
    loadObservations();
    refreshStats();
  }

  async function handleDelete(obs) {
    const confirmed = window.confirm(`Excluir a observação de "${obs.object}" em ${formatDate(obs.date)}?`);
    if (!confirmed) return;
    try {
      await obsService.deleteObservation(obs._id);
      loadObservations();
      refreshStats();
    } catch (err) {
      alert(err.response?.data?.message || 'Erro ao excluir observação.');
    }
  }

  return (
    <div className="app-shell">
      <AppHeader />

      <main className="app-main">
        {stats && (
          <div className="stats-row stats-row-compact">
            <div className="stat-card">
              <div className="stat-label">Total de observações</div>
              <div className="stat-value">{stats.totalObservations}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Este mês</div>
              <div className="stat-value">{stats.observationsThisMonth}</div>
            </div>
          </div>
        )}

        <div className="toolbar">
          <h1>Minhas observações</h1>
          <div className="toolbar-filters">
            <input
              type="text"
              placeholder="Buscar por objeto (ex: Lua, Júpiter...)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <div className="date-filter-group">
              <span>De</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div className="date-filter-group">
              <span>Até</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
            {(search || dateFrom || dateTo) && (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          <button className="btn-primary-sm" onClick={openCreateModal}>+ Nova observação</button>
        </div>

        {errorMsg && <div className="auth-alert">{errorMsg}</div>}

        {loading ? (
          <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>
        ) : observations.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhuma observação registrada ainda</h3>
            <p>Comece registrando o que você observou no céu hoje.</p>
            <button className="btn-primary-sm" style={{ marginTop: 16 }} onClick={openCreateModal}>
              + Nova observação
            </button>
          </div>
        ) : (
          <>
            <div className="obs-grid">
              {observations.map((obs) => (
                <article className="obs-card" key={obs._id}>
                  {obs.photo?.url ? (
                    <img className="obs-photo" src={`${API_ORIGIN}${obs.photo.url}`} alt={obs.object} />
                  ) : (
                    <div className="obs-photo-placeholder">Sem foto</div>
                  )}
                  <div className="obs-body">
                    <div className="obs-object">{obs.object}</div>
                    <div className="obs-date">{formatDate(obs.date)}</div>
                    <div className="obs-meta">
                      <span className={`obs-tag condition-${obs.conditions}`}>{obs.conditions}</span>
                      <span className="obs-tag">{obs.equipment}</span>
                      {obs.location?.name && <span className="obs-tag">{obs.location.name}</span>}
                    </div>
                    {obs.notes && <p className="obs-notes">{obs.notes}</p>}
                    <div className="obs-actions">
                      <button className="edit-btn" onClick={() => openEditModal(obs)}>Editar</button>
                      <button className="delete-btn" onClick={() => handleDelete(obs)}>Excluir</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            )}
          </>
        )}
      </main>

      {modalOpen && (
        <ObservationFormModal
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}
