// Bandeja de solicitudes (rediseno 2026-10-09). No es solo una tabla filtrable: organiza el trabajo.
//  - Vistas con contador: "Requieren tu accion", "En tramite", "Por corregir", "Completadas", "Anuladas", "Todas".
//  - Cada fila dice en que ETAPA va (con barra de avance), EN PODER DE QUIEN esta y HACE CUANTOS DIAS no se mueve
//    (semaforo: >=4 dias atencion, >=8 critico). Los datos los calcula el backend (solicitud.service.js#list).
//  - Las que le tocan al usuario se destacan y salen primero, las mas antiguas arriba.
//  - Exportar a CSV lo que se esta viendo.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, SlidersHorizontal } from 'lucide-react';
import { listSolicitudes } from '../../api/solicitudes.js';
import { listProyectos } from '../../api/proyectos.js';
import { listFrentes } from '../../api/frentes.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { usuarioTienePermiso } from '../../utils/permisos.js';
import { TIPO_SOLICITUD_LABELS, ESTADO_LABELS, CATEGORIA_LABELS, formatCurrency, formatearMiles, soloDigitos, categoriaSlug } from '../../utils/solicitudes.js';
import { descargarCsv } from '../configuracion/usuarioUtils.js';
import { SolicitudBadge } from './SolicitudBadge.jsx';
import { HistoricoBadge } from './HistoricoBadge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { useSortableTable, ariaSort } from '../../hooks/useSortableTable.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import styles from '../configuracion/Usuarios.module.css';
import b from './Bandeja.module.css';

const PAGE_SIZE = 20;

const ESTADOS_EN_TRAMITE = [
  'ENVIADA', 'PENDIENTE_DIRECTOR_TECNICO', 'APROBADA_DIRECTOR', 'PENDIENTE_RESIDENTE_ADMINISTRATIVO', 'EN_PROYECCION_CONTROLES',
  'EN_TRAMITE_CONTRATOS', 'CREACION_MINUTA', 'ENVIO_CONTRATO_POLIZAS', 'EN_CONTROLES', 'APROBACION_FINAL', 'PENDIENTE_GERENTE_COMPRAS',
];
const ESTADOS_POR_CORREGIR = ['BORRADOR', 'DEVUELTA', 'EN_REVISION'];

// Etapas del recorrido normal de cada categoria, solo para dibujar el avance (no gobierna nada).
const RECORRIDO = {
  INDIRECTA: ['ENVIADA', 'PENDIENTE_DIRECTOR_TECNICO', 'APROBADA_DIRECTOR', 'EN_TRAMITE_CONTRATOS', 'CREACION_MINUTA', 'EN_CONTROLES', 'APROBACION_FINAL', 'COMPLETADA'],
  DIRECTA: ['ENVIADA', 'PENDIENTE_RESIDENTE_ADMINISTRATIVO', 'EN_PROYECCION_CONTROLES', 'EN_CONTROLES', 'APROBACION_FINAL', 'PENDIENTE_GERENTE_COMPRAS', 'COMPLETADA'],
};

function avance(s) {
  const pasos = RECORRIDO[s.categoria] ?? RECORRIDO.INDIRECTA;
  const i = pasos.indexOf(s.estado);
  if (i < 0) return null;
  return { actual: i + 1, total: pasos.length, pct: Math.round((i / (pasos.length - 1)) * 100) };
}

const gravedad = (dias) => (dias == null ? null : dias >= 8 ? 'critico' : dias >= 4 ? 'atencion' : 'ok');

export function SolicitudesPage({ categoria }) {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const canCrear = usuarioTienePermiso(usuario, `crear_solicitudes_${categoria === 'DIRECTA' ? 'directas' : 'indirectas'}`);
  const slug = categoriaSlug(categoria);

  const [solicitudes, setSolicitudes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [frentes, setFrentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [vista, setVista] = useState(null); // null = aun sin elegir (se decide al cargar)
  const [busqueda, setBusqueda] = usePersistentState(`solicitudes-list:busqueda:${slug}`, '');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [mostrarMas, setMostrarMas] = useState(false);
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [filtroFrente, setFiltroFrente] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtroValorMin, setFiltroValorMin] = useState('');
  const [filtroValorMax, setFiltroValorMax] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    listProyectos().then((res) => setProyectos(res.data)).catch(() => setProyectos([]));
    listFrentes().then((res) => setFrentes(res.data)).catch(() => setFrentes([]));
  }, []);

  useEffect(() => {
    setCargando(true);
    setVista(null);
    listSolicitudes({ categoria, tipo: filtroTipo, proyectoId: filtroProyecto, frenteId: filtroFrente, fechaDesde: filtroFechaDesde, fechaHasta: filtroFechaHasta })
      .then((res) => setSolicitudes(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [categoria, filtroTipo, filtroProyecto, filtroFrente, filtroFechaDesde, filtroFechaHasta]);

  const miId = Number(usuario?.id);
  const esMiaPorCorregir = (s) => ESTADOS_POR_CORREGIR.includes(s.estado) && s.solicitanteId === miId;
  const VISTAS = useMemo(
    () => [
      { key: 'mias', label: 'Requieren tu acción', alerta: true, test: (s) => s.requiereMiAccion || esMiaPorCorregir(s) },
      { key: 'tramite', label: 'En trámite', test: (s) => ESTADOS_EN_TRAMITE.includes(s.estado) },
      { key: 'corregir', label: 'Por corregir', test: (s) => ['DEVUELTA', 'EN_REVISION'].includes(s.estado) },
      { key: 'borrador', label: 'Borradores', test: (s) => s.estado === 'BORRADOR' },
      { key: 'completadas', label: 'Completadas', test: (s) => s.estado === 'COMPLETADA' },
      { key: 'anuladas', label: 'Anuladas', test: (s) => s.estado === 'ANULADA' },
      { key: 'todas', label: 'Todas', test: () => true },
    ],
    [miId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Al cargar, abre en "Requieren tu accion" si hay algo; si no, en "Todas".
  useEffect(() => {
    if (vista === null && !cargando) setVista(solicitudes.some((s) => s.requiereMiAccion || esMiaPorCorregir(s)) ? 'mias' : 'todas');
  }, [cargando, solicitudes, vista]); // eslint-disable-line react-hooks/exhaustive-deps

  const conteos = useMemo(() => Object.fromEntries(VISTAS.map((v) => [v.key, solicitudes.filter(v.test).length])), [VISTAS, solicitudes]);
  const vistaActual = VISTAS.find((v) => v.key === vista) ?? VISTAS[VISTAS.length - 1];

  const enTramite = solicitudes.filter((s) => ESTADOS_EN_TRAMITE.includes(s.estado));
  const valorEnTramite = enTramite.reduce((sum, s) => sum + Number(s.valorFinal ?? 0), 0);
  const demoradas = enTramite.filter((s) => (s.diasEnPaso ?? 0) >= 8).length;

  const frentesFiltrados = filtroProyecto ? frentes.filter((f) => String(f.proyecto_id) === String(filtroProyecto)) : frentes;

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (!vistaActual.test(s)) return false;
      if (q) {
        const match = s.consecutivo.toLowerCase().includes(q) || (s.tercero?.razonSocial ?? '').toLowerCase().includes(q) || (s.tercero?.nit ?? '').toLowerCase().includes(q) || (s.solicitante?.nombre ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filtroValorMin && s.valorFinal != null && Number(s.valorFinal) < Number(filtroValorMin)) return false;
      if (filtroValorMax && s.valorFinal != null && Number(s.valorFinal) > Number(filtroValorMax)) return false;
      return true;
    });
  }, [solicitudes, vistaActual, busqueda, filtroValorMin, filtroValorMax]);

  const valueGetters = useMemo(
    () => ({
      consecutivo: (s) => s.consecutivo,
      tercero: (s) => s.tercero?.razonSocial ?? '',
      valorFinal: (s) => Number(s.valorFinal ?? 0),
      etapa: (s) => avance(s)?.actual ?? 0,
      dias: (s) => s.diasEnPaso,
      fechaSolicitud: (s) => new Date(s.fechaSolicitud).getTime(),
    }),
    []
  );
  const { sortedRows, sort, toggleSort } = useSortableTable(filtradas, valueGetters);

  // Sin orden elegido: las que te tocan primero y, dentro de cada grupo, las mas antiguas en su paso arriba.
  const ordenadas = useMemo(() => {
    if (sort.key) return sortedRows;
    return [...sortedRows].sort((a, c) => {
      const ta = a.requiereMiAccion ? 0 : 1;
      const tc = c.requiereMiAccion ? 0 : 1;
      if (ta !== tc) return ta - tc;
      return (c.diasEnPaso ?? -1) - (a.diasEnPaso ?? -1);
    });
  }, [sortedRows, sort.key]);

  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const avanzadosActivos = [filtroTipo, filtroProyecto, filtroFrente, filtroFechaDesde, filtroFechaHasta, filtroValorMin, filtroValorMax].filter(Boolean).length;

  function limpiar() {
    setBusqueda('');
    setFiltroTipo('');
    setFiltroProyecto('');
    setFiltroFrente('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setFiltroValorMin('');
    setFiltroValorMax('');
    setPage(1);
  }

  function exportar() {
    const filas = ordenadas.map((s) => [
      s.consecutivo,
      TIPO_SOLICITUD_LABELS[s.tipo] ?? s.tipo,
      s.tercero?.razonSocial ?? '',
      s.tercero?.nit ?? '',
      s.valorFinal ?? '',
      ESTADO_LABELS[s.estado] ?? s.estado,
      s.enPoderDe?.nombre ?? '',
      s.diasEnPaso ?? '',
      s.solicitante?.nombre ?? '',
      new Date(s.fechaSolicitud).toLocaleDateString('es-CO'),
    ]);
    descargarCsv(`solicitudes-${slug}.csv`, [['Consecutivo', 'Tipo', 'Contratista', 'NIT', 'Valor', 'Etapa', 'En poder de', 'Días en el paso', 'Solicitante', 'Fecha'], ...filas]);
  }

  const cambiar = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const tarjetas = [
    { key: 'mias', valor: conteos.mias ?? 0, label: 'Requieren tu acción', hint: 'Empieza por estas', ir: 'mias' },
    { key: 'tramite', valor: conteos.tramite ?? 0, label: 'En trámite', hint: valorEnTramite ? `${formatCurrency(valorEnTramite)} en juego` : 'Sin valor registrado', ir: 'tramite' },
    { key: 'demoradas', valor: demoradas, label: 'Con 8+ días en el mismo paso', hint: demoradas ? 'Conviene moverlas' : 'Todo fluye', ir: 'tramite' },
    { key: 'corregir', valor: conteos.corregir ?? 0, label: 'Por corregir', hint: 'Devueltas o en revisión', ir: 'corregir' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.title}>Solicitudes {CATEGORIA_LABELS[categoria]}s</h1>
          <p className={styles.subtitle}>Qué te toca resolver, en qué etapa va cada solicitud, en poder de quién está y cuánto lleva sin moverse.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={exportar} disabled={ordenadas.length === 0}>
            <Download size={14} aria-hidden="true" /> Exportar CSV
          </Button>
          {canCrear && (
            <>
              <Button type="button" variant="secondary" onClick={() => navigate(`/solicitudes-${slug}/importar-historico`)}>
                Importar histórico
              </Button>
              <Button type="button" variant="primary" onClick={() => navigate(`/solicitudes-${slug}/nueva`)}>
                Nueva solicitud
              </Button>
            </>
          )}
        </div>
      </div>

      {!cargando && (
        <div className={styles.kpiRow}>
          {tarjetas.map((t) => (
            <button key={t.key} type="button" className={`${styles.kpiCard} ${b.kpiClickable}`} onClick={() => { setVista(t.ir); setPage(1); }}>
              <span className={styles.kpiValor}>{t.valor}</span>
              <span className={styles.kpiLabel}>{t.label}</span>
              <span className={b.kpiHint}>{t.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <div className={b.tabs} role="tablist" aria-label="Vistas de solicitudes">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={vistaActual.key === v.key}
            className={`${b.tab} ${vistaActual.key === v.key ? b.tabActive : ''} ${v.alerta && (conteos[v.key] ?? 0) > 0 ? b.tabAlert : ''}`}
            onClick={() => { setVista(v.key); setPage(1); }}
          >
            {v.label}
            <span className={b.tabCount}>{conteos[v.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className={styles.filters}>
        <label className={`${styles.filterField} ${styles.filterSearch}`}>
          <span>Buscar</span>
          <input type="text" className={styles.control} placeholder="Consecutivo, contratista, NIT o solicitante..." value={busqueda} onChange={cambiar(setBusqueda)} aria-label="Buscar solicitudes" />
        </label>
        <button type="button" className={b.masFiltros} onClick={() => setMostrarMas((v) => !v)} aria-expanded={mostrarMas}>
          <SlidersHorizontal size={13} aria-hidden="true" /> Más filtros{avanzadosActivos > 0 ? ` (${avanzadosActivos})` : ''}
        </button>
        {(busqueda || avanzadosActivos > 0) && (
          <button type="button" className={styles.clearBtn} onClick={limpiar}>
            Limpiar filtros
          </button>
        )}
      </div>

      {mostrarMas && (
        <div className={b.avanzados}>
          <label className={styles.filterField}>
            <span>Tipo</span>
            <select className={styles.control} value={filtroTipo} onChange={cambiar(setFiltroTipo)}>
              <option value="">Todos</option>
              {Object.entries(TIPO_SOLICITUD_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Proyecto</span>
            <select className={styles.control} value={filtroProyecto} onChange={(e) => { setFiltroProyecto(e.target.value); setFiltroFrente(''); setPage(1); }}>
              <option value="">Todos</option>
              {proyectos.map((pr) => (
                <option key={pr.id} value={pr.id}>{pr.nombre}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Frente</span>
            <select className={styles.control} value={filtroFrente} onChange={cambiar(setFiltroFrente)} disabled={frentesFiltrados.length === 0}>
              <option value="">Todos</option>
              {frentesFiltrados.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Fecha desde</span>
            <input type="date" className={styles.control} value={filtroFechaDesde} onChange={cambiar(setFiltroFechaDesde)} />
          </label>
          <label className={styles.filterField}>
            <span>Fecha hasta</span>
            <input type="date" className={styles.control} value={filtroFechaHasta} min={filtroFechaDesde || undefined} onChange={cambiar(setFiltroFechaHasta)} />
          </label>
          {/* Dinero: nunca type="number" (ver CuadroComparativoBuilder.jsx#"Valor unitario") -- texto + soloDigitos/formatearMiles. */}
          <label className={styles.filterField}>
            <span>Valor mínimo</span>
            <input type="text" inputMode="numeric" className={styles.control} placeholder="0" value={formatearMiles(filtroValorMin)} onChange={(e) => { setFiltroValorMin(soloDigitos(e.target.value)); setPage(1); }} />
          </label>
          <label className={styles.filterField}>
            <span>Valor máximo</span>
            <input type="text" inputMode="numeric" className={styles.control} placeholder="Sin límite" value={formatearMiles(filtroValorMax)} onChange={(e) => { setFiltroValorMax(soloDigitos(e.target.value)); setPage(1); }} />
          </label>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th aria-sort={ariaSort(sort, 'consecutivo')}><SortHeader label="Solicitud" sortKey="consecutivo" sort={sort} onSort={toggleSort} /></th>
              <th aria-sort={ariaSort(sort, 'tercero')}><SortHeader label="Contratista" sortKey="tercero" sort={sort} onSort={toggleSort} /></th>
              <th aria-sort={ariaSort(sort, 'valorFinal')}><SortHeader label="Valor" sortKey="valorFinal" sort={sort} onSort={toggleSort} /></th>
              <th aria-sort={ariaSort(sort, 'etapa')}><SortHeader label="Etapa" sortKey="etapa" sort={sort} onSort={toggleSort} /></th>
              <th aria-sort={ariaSort(sort, 'dias')}><SortHeader label="En poder de" sortKey="dias" sort={sort} onSort={toggleSort} /></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={5} className={styles.emptyState}>Cargando...</td></tr>
            ) : pagina.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  {vistaActual.key === 'mias' ? 'No tienes solicitudes pendientes de tu acción. ' : 'Sin solicitudes en esta vista. '}
                  {conteos.todas > 0 && vistaActual.key !== 'todas' && (
                    <button type="button" className={styles.clearBtn} onClick={() => setVista('todas')}>Ver todas</button>
                  )}
                </td>
              </tr>
            ) : (
              pagina.map((s) => {
                const av = avance(s);
                const g = gravedad(s.diasEnPaso);
                const enFlujo = ESTADOS_EN_TRAMITE.includes(s.estado);
                return (
                  <tr
                    key={s.id}
                    className={`${styles.clickableRow} ${s.requiereMiAccion ? b.filaTocaTi : ''} ${enFlujo && g === 'critico' ? b.filaCritica : enFlujo && g === 'atencion' ? b.filaAtencion : ''}`}
                    onClick={() => navigate(`/solicitudes/${s.id}`)}
                  >
                    <td>
                      <div className={b.solicitudCell}>
                        <span>
                          <span className={b.consecutivo}>{s.consecutivo}</span>
                          {s.requiereMiAccion && <span className={b.tocaTi}>Te toca</span>}
                        </span>
                        <span className={b.subLine}>
                          {TIPO_SOLICITUD_LABELS[s.tipo] ?? s.tipo} · {s.solicitante?.nombre ?? '—'} · {new Date(s.fechaSolicitud).toLocaleDateString('es-CO')}
                        </span>
                      </div>
                    </td>
                    <td>
                      {s.tercero ? (
                        <div className={b.solicitudCell}>
                          <span className={styles.personaNombre}>{s.tercero.razonSocial}</span>
                          <span className={b.subLine}>{s.tercero.nit}</span>
                        </div>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td>{s.valorFinal ? formatCurrency(s.valorFinal) : <span className={styles.muted}>—</span>}</td>
                    <td>
                      <div className={b.etapaCell}>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <SolicitudBadge estado={s.estado} />
                          {s.importadoHistorico && <HistoricoBadge numeroOtrosi={s.numeroOtrosi} />}
                        </span>
                        {av && (
                          <>
                            <div className={b.progress} aria-hidden="true">
                              <div className={`${b.progressFill} ${s.estado === 'COMPLETADA' ? b.progressDone : ''}`} style={{ width: `${av.pct}%` }} />
                            </div>
                            <span className={b.paso}>Paso {av.actual} de {av.total}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      {enFlujo ? (
                        <div className={b.poderCell}>
                          <span>{s.enPoderDe?.nombre ?? <span className={styles.muted}>Según el frente</span>}</span>
                          <span className={`${b.dias} ${g === 'critico' ? b.diasCritico : g === 'atencion' ? b.diasAtencion : b.diasOk}`}>
                            {s.diasEnPaso === 0 ? 'Hoy' : `${s.diasEnPaso} día${s.diasEnPaso === 1 ? '' : 's'} en este paso`}
                          </span>
                        </div>
                      ) : ESTADOS_POR_CORREGIR.includes(s.estado) ? (
                        <span className={styles.muted}>{s.solicitante?.nombre ?? 'Solicitante'}</span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!cargando && <Pagination page={page} pageSize={PAGE_SIZE} total={ordenadas.length} onPageChange={setPage} />}
      </div>
      {!cargando && ordenadas.length > 0 && (
        <p className={b.resultCount}>
          {ordenadas.length} solicitud{ordenadas.length === 1 ? '' : 'es'} en esta vista
          {ordenadas.some((s) => s.valorFinal) && <> · valor total <span className={b.valorTotal}>{formatCurrency(ordenadas.reduce((sum, s) => sum + Number(s.valorFinal ?? 0), 0))}</span></>}
        </p>
      )}
    </div>
  );
}
