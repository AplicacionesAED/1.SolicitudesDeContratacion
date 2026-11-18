// Inicio de Solicitudes (ruta "/", a donde redirige el login). Reforma completa (2026-10-09) con el
// mismo lenguaje que el Dashboard del HRMS y el Inicio de Cartera: no solo cifras, sino la SITUACION
// (KPIs con contexto, solicitudes por etapa, completadas por mes, tipos) y lo que REQUIERE ATENCION
// (las solicitudes concretas donde este usuario puede actuar y las suyas por corregir). Todo viene de
// `GET /dashboard/resumen`, filtrable por categoria (Todas / Directas / Indirectas).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronRight, Clock, FileText, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { usuarioTienePermiso } from '../../utils/permisos.js';
import { getDashboardResumen } from '../../api/dashboard.js';
import { ACCION_NOMBRES_CORTOS, ESTADO_LABELS, TIPO_SOLICITUD_LABELS } from '../../utils/solicitudes.js';
import { SolicitudBadge } from '../solicitudes/SolicitudBadge.jsx';
import { CategoryBarChart } from './charts/CategoryBarChart.jsx';
import { CompletadasMesChart } from './charts/CompletadasMesChart.jsx';
import { DonutChart } from './charts/DonutChart.jsx';
import styles from './Dashboard.module.css';

const FILTROS = [
  { clave: null, label: 'Todas' },
  { clave: 'DIRECTA', label: 'Directas' },
  { clave: 'INDIRECTA', label: 'Indirectas' },
];

// Nombres cortos de las etapas para el grafico (los de ESTADO_LABELS son largos y se truncaban).
const ETAPA_CORTA = {
  ENVIADA: 'Enviada',
  PENDIENTE_DIRECTOR_TECNICO: 'Director Técnico',
  APROBADA_DIRECTOR: 'Aprobada por Director',
  PENDIENTE_RESIDENTE_ADMINISTRATIVO: 'Residente Administrativo',
  EN_PROYECCION_CONTROLES: 'Proyección de Controles',
  EN_TRAMITE_CONTRATOS: 'Trámite de Contratos',
  CREACION_MINUTA: 'Creación de Minuta',
  ENVIO_CONTRATO_POLIZAS: 'Contrato y Pólizas',
  EN_CONTROLES: 'Controles',
  APROBACION_FINAL: 'Aprobación Final',
  PENDIENTE_GERENTE_COMPRAS: 'Compras y Contrataciones',
  EN_REVISION: 'En revisión',
  DEVUELTA: 'Devuelta',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
}

// "$12,3 M" / "$1.250 M" -- millones de pesos, que es la escala en la que se piensa un contrato.
function formatoMillones(valor) {
  if (!valor) return '$0';
  if (valor < 1_000_000) return `$${Math.round(valor).toLocaleString('es-CO')}`;
  const millones = valor / 1_000_000;
  return `$${millones.toLocaleString('es-CO', { maximumFractionDigits: millones < 100 ? 1 : 0 })} M`;
}

function haceCuanto(dias) {
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Hace 1 día';
  return `Hace ${dias} días`;
}

// Cuanto lleva esperando una solicitud decide el color: >=5 dias es urgente, >=2 conviene mirarla.
function severidad(dias) {
  if (dias >= 5) return 'danger';
  if (dias >= 2) return 'warning';
  return 'info';
}

function formatFecha(dateStr) {
  // "09 oct 2026" (sin los "de" del formato es-CO): la columna de la tabla es angosta.
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ de /g, ' ');
}

function ItemAtencion({ item, porCorregir = false }) {
  const sev = porCorregir ? 'danger' : severidad(item.diasEsperando);
  const Icono = porCorregir ? RotateCcw : Clock;
  return (
    <li>
      <Link to={`/solicitudes/${item.id}`} className={styles.item}>
        <span className={`${styles.itemIcono} ${styles[`sev_${sev}`]}`}>
          <Icono size={18} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className={styles.itemTexto}>
          <span className={styles.itemTitulo}>
            {item.consecutivo}
            {porCorregir && <SolicitudBadge estado={item.estado} />}
          </span>
          <span className={styles.itemDetalle}>
            {TIPO_SOLICITUD_LABELS[item.tipo] ?? item.tipo}
            {item.contratista ? ` · ${item.contratista}` : ''}
          </span>
          {porCorregir ? (
            item.nota && <span className={`${styles.itemDetalle} ${styles.itemNota}`}>“{item.nota}”</span>
          ) : (
            <span className={styles.itemAccion}>Esperando tu acción: {ACCION_NOMBRES_CORTOS[item.accion] ?? item.accion}</span>
          )}
        </span>
        <span className={styles.itemLado}>
          <span className={`${styles.itemTiempo} ${styles[`sev_${sev}`]}`}>{haceCuanto(item.diasEsperando)}</span>
          {item.valorFinal != null && <span className={styles.itemValor}>{formatoMillones(item.valorFinal)}</span>}
        </span>
        <ChevronRight size={16} className={styles.itemChevron} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [categoria, setCategoria] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    getDashboardResumen(categoria)
      .then((res) => {
        if (!vigente) return;
        setDatos(res.data);
        setError(null);
      })
      .catch((err) => {
        if (vigente) setError(err.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [categoria]);

  // Los enlaces respetan el permiso REAL del usuario (2026-09-02): alguien sin acceso a ninguna
  // categoria veia las tarjetas clickeables y, al hacer clic, `ProtectedRoute` lo rebotaba en
  // silencio a "/". Con el filtro activo, el enlace va a ESA categoria; sin filtro se prefiere
  // Indirecta (el default historico). Sin permiso el enlace es `null` y la tarjeta/boton no es clickeable.
  const puede = (slug) => usuarioTienePermiso(usuario, slug);
  const verDirectas = puede('ver_solicitudes_directas');
  const verIndirectas = puede('ver_solicitudes_indirectas');
  const linkVerTodas =
    categoria === 'DIRECTA' ? (verDirectas ? '/solicitudes-directas' : null)
      : categoria === 'INDIRECTA' ? (verIndirectas ? '/solicitudes-indirectas' : null)
        : verIndirectas ? '/solicitudes-indirectas' : verDirectas ? '/solicitudes-directas' : null;
  const crearDirectas = puede('crear_solicitudes_directas');
  const crearIndirectas = puede('crear_solicitudes_indirectas');
  const linkNueva =
    categoria === 'DIRECTA' ? (crearDirectas ? '/solicitudes-directas/nueva' : null)
      : categoria === 'INDIRECTA' ? (crearIndirectas ? '/solicitudes-indirectas/nueva' : null)
        : crearIndirectas ? '/solicitudes-indirectas/nueva' : crearDirectas ? '/solicitudes-directas/nueva' : null;

  // El selector solo tiene sentido si el usuario puede ver las dos categorias.
  const mostrarFiltro = verDirectas && verIndirectas;

  const primerNombre = (usuario?.nombre ?? '').split(' ')[0];
  const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const kpis = datos?.kpis;
  const deltaMes = kpis ? kpis.completadasMes - kpis.completadasMesAnterior : 0;
  const masAntigua = datos?.atencion.items[0]?.diasEsperando;

  const datosEtapas = useMemo(() => (datos?.porEtapa ?? []).map((e) => ({ etapa: ETAPA_CORTA[e.estado] ?? ESTADO_LABELS[e.estado] ?? e.estado, total: e.total })), [datos]);
  const datosMeses = useMemo(() => (datos?.porMes ?? []).map((m) => ({ label: etiquetaMes(m.mes), total: m.total })), [datos]);
  const datosTipos = useMemo(() => (datos?.porTipo ?? []).map((t) => ({ tipoLabel: TIPO_SOLICITUD_LABELS[t.tipo] ?? t.tipo, total: t.total })), [datos]);
  const sinCompletadas = datosMeses.every((m) => m.total === 0);

  const nAtencion = datos?.atencion.total ?? 0;
  const nCorregir = datos?.porCorregir.total ?? 0;
  const frase =
    nAtencion > 0
      ? `Tienes ${nAtencion} ${nAtencion === 1 ? 'solicitud esperando' : 'solicitudes esperando'} tu acción${nCorregir > 0 ? ` y ${nCorregir} por corregir` : ''}.`
      : nCorregir > 0
        ? `Tienes ${nCorregir} ${nCorregir === 1 ? 'solicitud' : 'solicitudes'} por corregir.`
        : 'Estás al día: nada espera tu acción.';
  const hayGraficos = datosEtapas.some((e) => e.total > 0) || datosTipos.some((t) => t.total > 0) || !sinCompletadas;

  // Cifras del encabezado: un cero se apaga para que lo que tiene valor se lea primero.
  const cifras = kpis
    ? [
        { clave: 'activas', label: 'En el flujo', valor: kpis.activas, sub: categoria ? null : `${kpis.activasPorCategoria.DIRECTA} directas · ${kpis.activasPorCategoria.INDIRECTA} indirectas`, ayuda: 'Solicitudes que ya salieron de borrador y todavía no se completan ni se anulan; incluye las que están en revisión.' },
        { clave: 'mia', label: 'Pendientes de mi aprobación', valor: kpis.pendientesMiAprobacion, sub: kpis.pendientesMiAprobacion > 0 && masAntigua != null ? `La más antigua lleva ${masAntigua} ${masAntigua === 1 ? 'día' : 'días'}` : null, alerta: kpis.pendientesMiAprobacion > 0 && masAntigua >= 5, ayuda: 'Solicitudes en las que tienes un botón de aprobar o gestionar ahora mismo.' },
        { clave: 'corregir', label: 'Por corregir', valor: kpis.requierenCorreccion, sub: 'Devueltas o en revisión', ayuda: 'Solicitudes devueltas al solicitante o marcadas En revisión por Contratos.' },
        { clave: 'mes', label: 'Completadas este mes', valor: kpis.completadasMes, sub: deltaMes === 0 ? 'Igual que el mes anterior' : `${deltaMes > 0 ? '+' : '−'}${Math.abs(deltaMes)} vs. mes anterior` },
        { clave: 'valor', label: 'Valor en trámite', valor: formatoMillones(kpis.valorEnTramite), sinLink: true, ayuda: 'Suma del valor final de las solicitudes que están en el flujo de aprobación.' },
      ]
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroTexto}>
            <h1 className={styles.title}>Hola, {primerNombre || 'bienvenido'}</h1>
            <p className={styles.heroFrase}>{datos ? frase : 'Cargando tu bandeja…'}</p>
            <p className={styles.heroFecha}>{hoy}</p>
          </div>
          <div className={styles.headerAcciones}>
            {mostrarFiltro && (
              <div className={styles.heroToggle} role="tablist" aria-label="Categoría de solicitudes">
                {FILTROS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    role="tab"
                    aria-selected={categoria === f.clave}
                    className={`${styles.heroToggleBtn} ${categoria === f.clave ? styles.heroToggleBtnActivo : ''}`}
                    onClick={() => setCategoria(f.clave)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            {linkNueva && (
              <button type="button" className={styles.heroCta} onClick={() => navigate(linkNueva)}>
                <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
                Nueva solicitud
              </button>
            )}
          </div>
        </div>

        {datos && (
          <div className={styles.cifras}>
            {cifras.map((c) => {
              const cuerpo = (
                <>
                  <span className={`${styles.cifraValor} ${c.valor === 0 ? styles.cifraCero : ''} ${c.alerta ? styles.cifraAlerta : ''}`}>{c.valor}</span>
                  <span className={styles.cifraLabel}>{c.label}</span>
                  {c.sub && <span className={styles.cifraSub}>{c.sub}</span>}
                </>
              );
              return linkVerTodas && !c.sinLink ? (
                <Link key={c.clave} to={linkVerTodas} className={styles.cifra} title={c.ayuda}>
                  {cuerpo}
                </Link>
              ) : (
                <div key={c.clave} className={styles.cifra} title={c.ayuda}>
                  {cuerpo}
                </div>
              );
            })}
          </div>
        )}
      </header>

      {error && <div className={styles.formError}>{error}</div>}

      {!datos && !error && (
        <div className={styles.esqueleto} aria-busy="true" aria-label="Cargando inicio">
          <span className={styles.esqueletoPanel} />
        </div>
      )}

      {datos && (
        <div className={`${styles.page} ${cargando ? styles.cargando : ''}`}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div className={styles.panelTituloFila}>
                <h2 className={styles.panelTitulo}>Requiere tu atención</h2>
                {nAtencion + nCorregir > 0 && <span className={styles.contador}>{nAtencion + nCorregir}</span>}
              </div>
              {linkVerTodas && (
                <Link to={linkVerTodas} className={styles.verTodas}>
                  Ver todas
                  <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              )}
            </header>

            {nAtencion === 0 && nCorregir === 0 ? (
              <div className={styles.alDia}>
                <span className={styles.alDiaIcono}>
                  <CheckCircle2 size={20} aria-hidden="true" />
                </span>
                <div className={styles.alDiaCuerpo}>
                  <p className={styles.alDiaTitulo}>Estás al día</p>
                  <p className={styles.alDiaTexto}>No tienes solicitudes esperando tu acción ni solicitudes tuyas por corregir.</p>
                </div>
                {linkNueva && (
                  <Link to={linkNueva} className={styles.alDiaAccion}>
                    Nueva solicitud
                    <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                )}
              </div>
            ) : (
              <>
                {datos.atencion.items.length > 0 && (
                  <>
                    <h3 className={styles.grupoTitulo}>
                      Esperan tu acción{datos.atencion.total > datos.atencion.items.length ? ` · mostrando ${datos.atencion.items.length} de ${datos.atencion.total}` : ''}
                    </h3>
                    <ul className={styles.lista}>
                      {datos.atencion.items.map((item) => (
                        <ItemAtencion key={item.id} item={item} />
                      ))}
                    </ul>
                  </>
                )}
                {datos.porCorregir.items.length > 0 && (
                  <>
                    <h3 className={styles.grupoTitulo}>Tus solicitudes por corregir</h3>
                    <ul className={styles.lista}>
                      {datos.porCorregir.items.map((item) => (
                        <ItemAtencion key={item.id} item={item} porCorregir />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <section className={styles.panorama} aria-labelledby="panorama-titulo">
            <h2 id="panorama-titulo" className={styles.panelTitulo}>
              Panorama del flujo
            </h2>
            {hayGraficos ? (
              <div className={styles.chartsGrid}>
                {datosEtapas.some((e) => e.total > 0) && (
                  <CategoryBarChart
                    title="Solicitudes por etapa"
                    hint="Dónde está cada solicitud del flujo"
                    description="Cuántas solicitudes hay en cada paso del flujo de aprobación; las devueltas y en revisión van al final."
                    data={datosEtapas}
                    labelKey="etapa"
                  />
                )}
                {datosTipos.some((t) => t.total > 0) && (
                  <DonutChart
                    title="En el flujo, por tipo"
                    hint="Qué tipo de solicitudes hay en curso"
                    description="Distribución por tipo de las solicitudes que están en el flujo de aprobación."
                    data={datosTipos}
                    labelKey="tipoLabel"
                  />
                )}
                {!sinCompletadas && (
                  <CompletadasMesChart title="Completadas por mes" hint={`Últimos ${datosMeses.length} meses`} description="Solicitudes que terminaron su flujo, por mes." data={datosMeses} />
                )}
              </div>
            ) : (
              <p className={styles.panoramaVacio}>Cuando haya solicitudes en el flujo, aquí verás en qué etapa está cada una, de qué tipo son y cuántas se completan cada mes.</p>
            )}
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <h2 className={styles.panelTitulo}>Solicitudes recientes</h2>
              {linkVerTodas && (
                <Link to={linkVerTodas} className={styles.verTodas}>
                  Ver todas
                  <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              )}
            </header>

            {datos.recientes.length === 0 ? (
              <div className={styles.vacio}>
                <span className={styles.vacioIcono}>
                  <FileText size={22} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <p className={styles.vacioTitulo}>Todavía no hay solicitudes</p>
                <p>Crea la primera para comenzar el flujo de aprobación.</p>
              </div>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Consecutivo</th>
                      <th>Tipo</th>
                      <th>Frente</th>
                      <th>Contratista</th>
                      <th>N° ADPRO</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.recientes.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link to={`/solicitudes/${s.id}`} className={styles.consecutivoLink}>
                            {s.consecutivo}
                          </Link>
                        </td>
                        <td>{TIPO_SOLICITUD_LABELS[s.tipo] ?? s.tipo}</td>
                        <td className={styles.nowrap}>
                          {s.frentesNombres.length > 0 ? (
                            <>
                              {s.frentesNombres[0]}
                              {s.frentesNombres.length > 1 && <span className={styles.masFrentes}>+{s.frentesNombres.length - 1}</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{s.terceroRazonSocial ?? '—'}</td>
                        <td className={styles.nowrap}>{s.numeroContratoAdpro ? <span className={styles.mono}>{s.numeroContratoAdpro}</span> : <span className={styles.muted}>—</span>}</td>
                        <td className={styles.nowrap}>
                          <SolicitudBadge estado={s.estado} />
                        </td>
                        <td className={styles.nowrap}>{formatFecha(s.fechaSolicitud)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
