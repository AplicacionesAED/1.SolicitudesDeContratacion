// Puerto de (app)/solicitudes/[id]/page.tsx -- el detalle completo, no solo
// un resumen. Cubre todo lo que mostraba el original: banner de otrosí-hijo,
// info del solicitante (cargo/correo/fecha aprobación/director aprobador),
// proyecto+frentes+etapas, datos completos de la solicitud (tercero,
// tipo de contrato, alcance, condiciones especiales), y la sección de
// Documentos Adjuntos (los 6 archivos subidos + los anexos externos) --
// esta última no existía en el puerto original de la Fase 4 y es la que el
// usuario reportó como faltante.
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Paperclip, Link2, ExternalLink, GitMerge, Clock, CheckCircle2, UserRound, Ban } from 'lucide-react';
import { getSolicitud, descargarDocumento, descargarOrdenServicio, descargarCronogramaExport } from '../../api/solicitudes.js';
import { API_BASE_URL } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { TIPO_SOLICITUD_LABELS, ESTADO_LABELS, CATEGORIA_LABELS, CATEGORIA_BADGE_VARIANT, formatCurrency, numeroALetras, categoriaSlug, tipoContratoLabel } from '../../utils/solicitudes.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { SolicitudBadge } from './SolicitudBadge.jsx';
import { HistoricoBadge } from './HistoricoBadge.jsx';
import { EstadoTimeline } from './EstadoTimeline.jsx';
import { HistorialSeguimiento } from './HistorialSeguimiento.jsx';
import { SolicitudActions } from './SolicitudActions.jsx';
import {
  calcularValorTotalItem,
  calcularTotalesProveedor,
  calcularValorTotalPendiente,
  calcularValorTotalSegunPpto,
  calcularTotalCantidadPendiente,
  calcularTotalValorPendiente,
  calcularTotalCantidadReal,
  calcularTotalValorSegunPpto,
  CAMPOS_AIU,
  normalizarCuadroComparativo,
} from './CuadroComparativoBuilder.jsx';
import { CuadroComparativoGrid } from './CuadroComparativoGrid.jsx';
import { calcularValorCalculada, calcularTotalColumna, ImagenAutenticada, normalizarMemoria } from './MemoriaBuilder.jsx';
import { MemoriaTablaVista } from './MemoriaTablaEditor.jsx';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import styles from './Solicitudes.module.css';
import b from './Bandeja.module.css';
import d from './Detalle.module.css';

// Mismos 6 campos de archivo que el original mostraba en "Documentos
// Adjuntos" -- archivoGeneradorGastos/archivoEvaluacionInicial nunca se
// llenan desde ningún formulario (ni acá ni en el original, ver
// SolicitudForm.jsx), pero si algún día tienen valor (import histórico,
// dato legado) igual se muestran.
const ARCHIVOS_LABELS = [
  ['archivoCuadroComparativo', 'Cuadro Comparativo'],
  ['archivoCotizacion', 'Cotización'],
  ['archivoGeneradorGastos', 'Generador de Gastos'],
  ['archivoEvaluacionInicial', 'Evaluación Inicial'],
  ['archivoFormatoSolicitud', 'Formato de Solicitud'],
  ['archivoPreBEP', 'PreBEP'],
];

function detectarPlataforma(url) {
  if (/sharepoint\.com|1drv\.ms|onedrive\.live\.com/i.test(url)) return 'SharePoint';
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return 'Google Drive';
  if (/dropbox\.com/i.test(url)) return 'Dropbox';
  return 'Enlace';
}

// Un archivo subido por esta app guarda una ruta relativa ("/files/...");
// un anexo externo ya es una URL absoluta -- solo el primero necesita el
// prefijo del backend para poder abrirse desde el origen del frontend.
function urlArchivo(path) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}

export function SolicitudDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [solicitud, setSolicitud] = useState(null);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(null);
  // Pestaña activa de la sección "Cuadro Comparativo" (id de proveedor,
  // como string -- mismo `clientId` que usa calcularValorTotalItem/
  // calcularTotalesProveedor) -- null hasta que el usuario elige una,
  // entonces cae al primer proveedor.
  const [ccTab, setCcTab] = useState(null);
  const [seccion, setSeccion] = useState('resumen');

  // "Generar Documento" produce cosas distintas según categoría -- pedido
  // explícito del usuario ("de momento solo aplícalo en directos"):
  // Directa genera el PDF "Orden de Compra/Servicios" (ordenServicio.js,
  // fiel a la plantilla real de la empresa); Indirecta sigue con el .docx
  // de siempre (documento.js), sin cambios.
  async function handleDescargarDocumento() {
    setDescargando('documento');
    try {
      if (solicitud.categoria === 'DIRECTA') await descargarOrdenServicio(id);
      else await descargarDocumento(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(null);
    }
  }

  async function handleExportarCronograma() {
    if (!solicitud.cronograma) return;
    setDescargando('cronograma');
    try {
      await descargarCronogramaExport(solicitud.cronograma);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(null);
    }
  }

  function cargar() {
    getSolicitud(id)
      .then((res) => setSolicitud(res.data))
      .catch((err) => {
        // No sabemos la categoría de una solicitud que no pudimos cargar --
        // vuelve al inicio en vez de a un listado que podría no ser el suyo.
        if (err.status === 403 || err.status === 404) navigate('/');
        else setError(err.message);
      });
  }

  useEffect(cargar, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className={styles.errorBanner}>{error}</p>;
  if (!solicitud) return null;

  // Misma regla que EditarSolicitudPage.jsx para elegir el formulario: Directa no histórica = formulario V2 (cuadrícula).
  const usaCuadroGrid = solicitud.categoria === 'DIRECTA' && !solicitud.importadoHistorico;

  const SECCIONES = [
    { key: 'resumen', label: 'Resumen', visible: true },
    { key: 'cuadro', label: 'Cuadro comparativo', visible: solicitud.cuadroComparativo?.items?.length > 0 },
    { key: 'memoria', label: 'Memoria', visible: solicitud.categoria === 'DIRECTA' && (!!solicitud.memoria?.contenidoHtml || solicitud.memoria?.imagenes?.length > 0 || solicitud.memoria?.filas?.length > 0) },
    { key: 'cronograma', label: 'Cronograma', visible: Boolean(solicitud.cronograma) },
    { key: 'documentos', label: 'Documentos', visible: (ARCHIVOS_LABELS.filter(([c]) => solicitud[c]).length + (solicitud.archivosAnexos?.length ?? 0)) > 0, cuenta: ARCHIVOS_LABELS.filter(([c]) => solicitud[c]).length + (solicitud.archivosAnexos?.length ?? 0) },
    { key: 'historial', label: 'Historial de seguimiento', visible: true, cuenta: solicitud.historial?.length ?? 0 },
  ].filter((x) => x.visible);
  const seccionActual = SECCIONES.some((x) => x.key === seccion) ? seccion : 'resumen';

  const archivos = ARCHIVOS_LABELS.filter(([campo]) => solicitud[campo]);
  const anexos = solicitud.archivosAnexos ?? [];

  // `notaContratacion` es un SOLO campo compartido entre DEVOLVER/REVISAR/
  // ANULAR ("el último valor gana", sin saber qué acción lo escribió) -- por
  // eso no se puede decidir si ocultarlo mirando solo el campo. El Jefe
  // Gabriel pidió ocultar el banner SOLO cuando la última de esas 3 fue
  // DEVOLVER y la solicitud ya no está en DEVUELTA (se reenvió). Ojo: NO
  // generalizar a REVISAR/ANULAR -- esas dos deben seguir mostrándose
  // siempre (caso ya documentado en CLAUDE.md, una nota real de Revisar no
  // debe esconderse en solicitudes Completadas). `solicitud.historial`
  // viene ordenado descendente (getById), por eso `.find()` devuelve directo
  // la más reciente de las 3.
  const ultimaAccionNota = solicitud.historial?.find((h) => ['DEVOLVER', 'REVISAR', 'ANULAR'].includes(h.accion))?.accion;
  const ocultarNotaPorReenvio = ultimaAccionNota === 'DEVOLVER' && solicitud.estado !== 'DEVUELTA';

  // ---- "Que sigue": una frase que dice donde esta la solicitud, quien debe moverla y hace cuanto ----
  const dias = solicitud.diasEnPaso;
  const gravedad = dias == null ? null : dias >= 8 ? 'critico' : dias >= 4 ? 'atencion' : 'ok';
  const estadoTexto = ESTADO_LABELS[solicitud.estado] ?? solicitud.estado;
  const enFlujo = solicitud.diasEnPaso != null;
  const porCorregir = ['BORRADOR', 'DEVUELTA', 'EN_REVISION'].includes(solicitud.estado);
  let sigue;
  if (solicitud.estado === 'COMPLETADA') sigue = { tono: 'ok', icono: 'check', titulo: 'Solicitud completada', texto: 'Terminó todo el flujo de aprobación.' };
  else if (solicitud.estado === 'ANULADA') sigue = { tono: 'neutro', icono: 'ban', titulo: 'Solicitud anulada', texto: 'Ya no sigue en el flujo.' };
  else if (porCorregir) sigue = { tono: 'atencion', icono: 'user', titulo: solicitud.estado === 'BORRADOR' ? 'Pendiente de enviar' : 'Pendiente de corrección', texto: `${solicitud.solicitante?.nombre ?? 'El solicitante'} ${solicitud.estado === 'BORRADOR' ? 'todavía no la ha enviado.' : 'debe corregirla y reenviarla.'}` };
  else if (enFlujo) sigue = { tono: gravedad, icono: 'clock', titulo: `Esperando: ${estadoTexto}`, texto: solicitud.enPoderDe?.nombre ? `En poder de ${solicitud.enPoderDe.nombre}` : 'La resuelve quien esté asignado en el frente' };
  else sigue = null;

  return (
    <div className={d.page}>
      <BackLink to={`/solicitudes-${categoriaSlug(solicitud.categoria)}`}>Solicitudes</BackLink>

      {solicitud.solicitudPadre && (
        <p className={styles.infoBanner} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitMerge size={15} style={{ flexShrink: 0 }} />
          Este otrosí pertenece al contrato base{' '}
          <Link to={`/solicitudes/${solicitud.solicitudPadre.id}`} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {solicitud.solicitudPadre.consecutivo}
          </Link>
          .
        </p>
      )}

      <section className={d.hero}>
        <div className={d.heroTop}>
          <div className={d.heroInfo}>
            <div className={d.heroBadges}>
              <Badge variant={CATEGORIA_BADGE_VARIANT[solicitud.categoria]}>{CATEGORIA_LABELS[solicitud.categoria]}</Badge>
              <SolicitudBadge estado={solicitud.estado} />
              {solicitud.importadoHistorico && <HistoricoBadge numeroOtrosi={solicitud.numeroOtrosi} />}
            </div>
            <h1 className={d.consecutivo}>{solicitud.consecutivo}</h1>
            <p className={d.heroLinea}>
              {TIPO_SOLICITUD_LABELS[solicitud.tipo] ?? solicitud.tipo}
              {solicitud.tercero && (
                <>
                  {' · '}
                  <Link to={`/terceros/${solicitud.tercero.id}`}>{solicitud.tercero.razonSocial}</Link>
                </>
              )}
            </p>
          </div>
          <div className={d.heroDerecha}>
            {solicitud.valorFinal != null && (
              <div className={d.valor}>
                <span className={d.valorEtiqueta}>Valor</span>
                <span className={d.valorNumero}>{formatCurrency(solicitud.valorFinal)}</span>
              </div>
            )}
            <Button type="button" variant="secondary" onClick={handleDescargarDocumento} disabled={descargando != null}>
              {descargando === 'documento' ? 'Generando…' : solicitud.categoria === 'DIRECTA' ? 'Generar orden de servicio' : 'Generar documento'}
            </Button>
          </div>
        </div>

        {sigue && (
          <div className={`${d.sigue} ${d[`sigue_${sigue.tono}`] ?? ''}`}>
            <span className={d.sigueIcono}>{sigue.icono === 'check' ? <CheckCircle2 size={20} aria-hidden="true" /> : sigue.icono === 'ban' ? <Ban size={20} aria-hidden="true" /> : sigue.icono === 'user' ? <UserRound size={20} aria-hidden="true" /> : <Clock size={20} aria-hidden="true" />}</span>
            <div className={d.sigueTexto}>
              <p className={d.sigueTitulo}>
                {sigue.titulo}
                {solicitud.requiereMiAccion && <span className={b.tocaTi}>Te toca</span>}
              </p>
              <p className={d.sigueDetalle}>
                {sigue.texto}
                {enFlujo && <> · {dias === 0 ? 'se movió hoy' : `${dias} día${dias === 1 ? '' : 's'} en este paso`}</>}
              </p>
            </div>
          </div>
        )}

        {solicitud.notaContratacion && !ocultarNotaPorReenvio && (
          <div className={d.nota}>
            <span className={d.notaEtiqueta}>Observación</span>
            <p>{solicitud.notaContratacion}</p>
          </div>
        )}

        {solicitud.conceptoCompras && (
          <div className={`${d.concepto} ${d.conceptoOk}`}>
            <CheckCircle2 size={20} aria-hidden="true" />
            <div className={d.conceptoCuerpo}>
              <p className={d.conceptoTitulo}>OK de Compras</p>
              {solicitud.notaConceptoCompras && <p className={d.conceptoNota}>{solicitud.notaConceptoCompras}</p>}
              <p className={d.conceptoMeta}>{[solicitud.conceptoComprasPor, solicitud.fechaConceptoCompras && new Date(solicitud.fechaConceptoCompras).toLocaleDateString('es-CO')].filter(Boolean).join(' · ')} · Es un visto bueno: la decisión de firmar o devolver es del Gerente de Compras.</p>
            </div>
          </div>
        )}

        <SolicitudActions solicitud={solicitud} usuario={usuario} onChange={cargar} />
      </section>

      <EstadoTimeline estadoActual={solicitud.estado} historial={solicitud.historial} importadoHistorico={solicitud.importadoHistorico} numeroOtrosi={solicitud.numeroOtrosi} categoria={solicitud.categoria} concepto={{ valor: solicitud.conceptoCompras, por: solicitud.conceptoComprasPor, nota: solicitud.notaConceptoCompras }} />

      <div className={d.tabs} role="tablist" aria-label="Secciones de la solicitud">
        {SECCIONES.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={seccionActual === x.key} className={`${d.tab} ${seccionActual === x.key ? d.tabActive : ''}`} onClick={() => setSeccion(x.key)}>
            {x.label}
            {x.cuenta != null && <span className={d.tabCuenta}>{x.cuenta}</span>}
          </button>
        ))}
      </div>

      {seccionActual === 'resumen' && (
        <>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos de la solicitud</h2>
        <div className={styles.infoGrid}>
          {solicitud.tercero && (
            <div className={`${styles.infoItem} ${d.dato}`}>
              <span className={styles.infoLabel}>Tercero</span>
              <span className={styles.infoValue}><Link to={`/terceros/${solicitud.tercero.id}`}>{solicitud.tercero.razonSocial} — {solicitud.tercero.nit}</Link></span>
            </div>
          )}
          {solicitud.tipoContrato && (
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Tipo de contrato</span><span className={styles.infoValue}>{tipoContratoLabel(solicitud.tipoContrato)}</span></div>
          )}
          {solicitud.plazoEjecucion && (
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Plazo de ejecución</span><span className={styles.infoValue}>{solicitud.plazoEjecucion}</span></div>
          )}
          {solicitud.valorFinal != null && (
            <div className={`${styles.infoItem} ${d.dato}`}>
              <span className={styles.infoLabel}>Valor final</span>
              <span className={styles.infoValue}>{formatCurrency(solicitud.valorFinal)}<br /><em style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)', fontStyle: 'italic' }}>{solicitud.valorEnLetras ?? numeroALetras(Number(solicitud.valorFinal))}</em></span>
            </div>
          )}
          {solicitud.formaPago && (
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Forma de pago</span><span className={styles.infoValue}>{solicitud.formaPago}</span></div>
          )}
          {solicitud.asunto && (
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Asunto</span><span className={styles.infoValue}>{solicitud.asunto}</span></div>
          )}
        </div>

        {solicitud.descripcionActividad && (
          <div className={`${styles.infoItem} ${d.dato}`} style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
            <span className={styles.infoLabel}>Objeto</span>
            <span className={styles.infoValue}>{solicitud.descripcionActividad}</span>
          </div>
        )}
        {solicitud.alcance && (
          <div className={`${styles.infoItem} ${d.dato}`} style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
            <span className={styles.infoLabel}>Alcance</span>
            <span className={styles.infoValue}>{solicitud.alcance}</span>
          </div>
        )}
        {solicitud.terminosReferencia && (
          <div className={`${styles.infoItem} ${d.dato}`} style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
            <span className={styles.infoLabel}>Términos de referencia</span>
            <span className={styles.infoValue}>{solicitud.terminosReferencia}</span>
          </div>
        )}
        {solicitud.condicionesEspeciales && (
          <div className={`${styles.infoItem} ${d.dato}`} style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border)' }}>
            <span className={styles.infoLabel}>Condiciones especiales</span>
            <span className={styles.infoValue}>{solicitud.condicionesEspeciales}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Información del solicitante</h2>
          <div className={styles.infoGrid}>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Solicitante</span><span className={styles.infoValue}>{solicitud.solicitante?.nombre ?? '—'}</span></div>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Cargo</span><span className={styles.infoValue}>{solicitud.solicitante?.cargo ?? '—'}</span></div>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Correo</span><span className={styles.infoValue}>{solicitud.solicitante?.email ?? '—'}</span></div>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha de solicitud</span><span className={styles.infoValue}>{new Date(solicitud.fechaSolicitud).toLocaleDateString('es-CO')}</span></div>
            {solicitud.fechaAprobacionDirector && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha aprobación director</span><span className={styles.infoValue}>{new Date(solicitud.fechaAprobacionDirector).toLocaleDateString('es-CO')}</span></div>
            )}
            {solicitud.fechaAprobacionControlesProyeccion && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha aprobación Controles (Proyección)</span><span className={styles.infoValue}>{new Date(solicitud.fechaAprobacionControlesProyeccion).toLocaleDateString('es-CO')}</span></div>
            )}
            {solicitud.fechaAprobacionResidenteAdministrativo && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha aprobación Residente Administrativo</span><span className={styles.infoValue}>{new Date(solicitud.fechaAprobacionResidenteAdministrativo).toLocaleDateString('es-CO')}</span></div>
            )}
            {solicitud.fechaAprobacionGerenteCompras && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha de firma Gerente de Compras</span><span className={styles.infoValue}>{new Date(solicitud.fechaAprobacionGerenteCompras).toLocaleDateString('es-CO')}</span></div>
            )}
            {solicitud.aprobador && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Director aprobador</span><span className={styles.infoValue}>{solicitud.aprobador.nombre}</span></div>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Proyecto y frentes</h2>
          <div className={styles.infoGrid}>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Proyecto</span><span className={styles.infoValue}>{solicitud.proyectoNombre ?? '—'}</span></div>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Frentes</span><span className={styles.infoValue}>{solicitud.frentesNombres?.length > 0 ? solicitud.frentesNombres.join(', ') : '—'}</span></div>
            {solicitud.etapasUnicas?.length > 0 && (
              <div className={`${styles.infoItem} ${d.dato}`}>
                <span className={styles.infoLabel}>Etapa</span>
                <span className={styles.infoValue} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {solicitud.etapasUnicas.map((e) => (
                    <span key={e} style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', fontSize: 'var(--text-label-size)' }}>Etapa {e}</span>
                  ))}
                </span>
              </div>
            )}
            {solicitud.numeroContratoAdpro && (
              <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Número Adpro</span><span className={styles.infoValue}>{solicitud.numeroContratoAdpro}</span></div>
            )}
          </div>
        </div>
      </div>

      {solicitud.otrosis?.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Otrosís</h2>
          {solicitud.otrosis.map((o) => (
            <div key={o.id} className={`${styles.infoItem} ${d.dato}`} style={{ cursor: 'pointer' }} onClick={() => navigate(`/solicitudes/${o.id}`)}>
              <span className={styles.infoValue} style={{ fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {o.consecutivo} — <SolicitudBadge estado={o.estado} />
                {o.importadoHistorico && <HistoricoBadge numeroOtrosi={o.numeroOtrosi} />}
              </span>
            </div>
          ))}
        </div>
      )}

        </>
      )}

      {seccionActual === 'cuadro' && (
        <>
      {/* Directa (formulario V2): el MISMO cuadro del formulario (CuadroComparativoGrid) en solo lectura, para que se vea
          exactamente igual. Indirecta y las históricas se llenan con SolicitudForm/CuadroComparativoBuilder: abajo su vista. */}
      {usaCuadroGrid && solicitud.cuadroComparativo?.items?.length > 0 && (
        <div className={styles.section}>
          <CuadroComparativoGrid
            soloLectura
            value={normalizarCuadroComparativo(solicitud.cuadroComparativo)}
            onChange={() => {}}
            nombreProveedor={solicitud.cuadroComparativo.proveedores?.[0]?.nombre ?? solicitud.tercero?.razonSocial ?? ''}
            nitProveedor={solicitud.tercero?.nit ?? ''}
            contexto={{
              proyecto: solicitud.proyectoNombre ?? '',
              objeto: solicitud.descripcionActividad ?? '',
              tipoContrato: solicitud.tipoContrato ? tipoContratoLabel(solicitud.tipoContrato) : '',
            }}
            cotizacion={solicitud.archivoCotizacion}
            urlCotizacion={solicitud.archivoCotizacion ? urlArchivo(solicitud.archivoCotizacion) : undefined}
            sinAiu={solicitud.tipoContrato === 'TRANSPORTE'}
          />
        </div>
      )}
      {!usaCuadroGrid && solicitud.cuadroComparativo?.items?.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Cuadro Comparativo</h2>

          {/* Mismo diseño que el formulario (CuadroComparativoBuilder.jsx, 2026-11-26: "como el formulario"), en solo
              lectura: mismas tablas, columnas, anchos y orden; las celdas que allá se escriben acá son texto, y las
              calculadas conservan el sombreado de "calculado" (`celdaCalc`). Sin leyenda: aquí nada es editable. */}
          <div className={styles.cuadro}>
            {/* 1. Ítems -- "Pendiente por consumir" (`cantidad`) y "Cantidades reales" (`cantidadReal`) son 2 campos
                INDEPENDIENTES (ver CuadroComparativoBuilder.jsx#calcularValorTotalItem), en 2 tablas igual que el editor. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <p style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, margin: 0 }}>Ítems a comparar</p>
              <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
                <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ width: '9%' }}>Código ítem</th>
                      <th rowSpan={2} style={{ width: '8%' }}>Código insumo</th>
                      <th colSpan={2}>Descripción de ítem</th>
                      <th colSpan={4}>Pendiente por consumir</th>
                      <th rowSpan={2} style={{ width: '29%' }}>Observaciones</th>
                    </tr>
                    <tr>
                      <th style={{ width: '13%' }}>Actividad o insumo</th>
                      <th style={{ width: '11%' }}>Alcance</th>
                      <th style={{ width: '6%' }}>Unidad</th>
                      <th style={{ width: '6%' }}>Cantidad</th>
                      <th style={{ width: '9%' }}>VR. Unit</th>
                      <th style={{ width: '9%' }}>V. Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitud.cuadroComparativo.items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.codigoItem}</td>
                        <td>{it.codigoInsumo}</td>
                        <td>{it.actividad}</td>
                        <td>{it.alcance}</td>
                        <td>{it.unidad}</td>
                        <td className={styles.celdaNum}>{it.cantidad}</td>
                        <td className={styles.celdaNum}>{formatCurrency(it.valorUnitarioPendiente)}</td>
                        <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalPendiente(it))}</td>
                        <td>{it.observaciones}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: 'var(--color-surface-sunken)' }}>
                      <td colSpan={5}>TOTAL</td>
                      <td className={styles.celdaNum}>{calcularTotalCantidadPendiente(solicitud.cuadroComparativo.items)}</td>
                      <td></td>
                      <td className={styles.celdaNum}>{formatCurrency(calcularTotalValorPendiente(solicitud.cuadroComparativo.items))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Misma tabla con "Cantidades reales" -- la que alimenta el Valor Total de cada proveedor. "V. Total según
                  PPTO" reutiliza el VR. Unit de Pendiente por consumir (calcularValorTotalSegunPpto). */}
              <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
                <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ width: '10%' }}>Código ítem</th>
                      <th rowSpan={2} style={{ width: '9%' }}>Código insumo</th>
                      <th colSpan={2}>Descripción de ítem</th>
                      <th colSpan={3}>Cantidades reales</th>
                      <th rowSpan={2} style={{ width: '31%' }}>Observaciones</th>
                    </tr>
                    <tr>
                      <th style={{ width: '14%' }}>Actividad o insumo</th>
                      <th style={{ width: '12%' }}>Alcance</th>
                      <th style={{ width: '7%' }}>Unidad</th>
                      <th style={{ width: '7%' }}>Cantidad</th>
                      <th style={{ width: '10%' }}>V. Total según PPTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitud.cuadroComparativo.items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.codigoItem}</td>
                        <td>{it.codigoInsumo}</td>
                        <td>{it.actividad}</td>
                        <td>{it.alcance}</td>
                        <td>{it.unidad}</td>
                        <td className={styles.celdaNum}>{it.cantidadReal}</td>
                        <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalSegunPpto(it))}</td>
                        <td>{it.observaciones}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: 'var(--color-surface-sunken)' }}>
                      <td colSpan={5}>TOTAL</td>
                      <td className={styles.celdaNum}>{calcularTotalCantidadReal(solicitud.cuadroComparativo.items)}</td>
                      <td className={styles.celdaNum}>{formatCurrency(calcularTotalValorSegunPpto(solicitud.cuadroComparativo.items))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Comparación -- una tarjeta por proveedor con el Costo Total; clic abre su pestaña. En Directa es una
                sola tarjeta (único proveedor = el contratista), misma pieza visual. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <p style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, margin: 0 }}>Comparación</p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                {solicitud.cuadroComparativo.proveedores.map((p) => {
                  const totales = calcularTotalesProveedor(solicitud.cuadroComparativo.items, { ...p, clientId: String(p.id) });
                  const activa = String(p.id) === (ccTab ?? String(solicitud.cuadroComparativo.proveedores[0]?.id));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCcTab(String(p.id))}
                      style={{
                        flex: '1 1 200px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: p.seleccionado ? '2px solid var(--color-success-ink)' : activa ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-sm) var(--space-md)',
                        background: p.seleccionado ? 'var(--color-success-surface)' : 'var(--color-surface)',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <strong style={{ fontSize: 'var(--text-body-size)' }}>{p.nombre}</strong>
                        {p.seleccionado && <Badge variant="success">Seleccionado</Badge>}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: 'var(--text-title-size)', fontWeight: 700, color: 'var(--color-ink)' }}>{formatCurrency(totales.costoTotal)}</p>
                      <p style={{ margin: 0, fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)' }}>Subtotal {formatCurrency(totales.subtotal)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Pestañas por proveedor -- precio por ítem + AIU/IVA del proveedor activo, en el mismo orden que el editor. */}
            {(() => {
              const proveedores = solicitud.cuadroComparativo.proveedores;
              const idActivo = ccTab ?? String(proveedores[0]?.id);
              const proveedorActivo = proveedores.find((p) => String(p.id) === idActivo);
              // TRANSPORTE no lleva IVA ni AIU (2026-11-10): se ocultan Administración/Imprevisto/Utilidad/IVA sobre utilidad.
              const camposAiu = solicitud.tipoContrato === 'TRANSPORTE' ? [] : CAMPOS_AIU;
              if (!proveedorActivo) return null;
              const clientIdActivo = String(proveedorActivo.id);
              // Mismo cálculo que el editor -- calcularTotalesProveedor lee proveedor.clientId (acá el id real, como
              // string) para buscar los precios en item.precios (keyed por id real también).
              const totales = calcularTotalesProveedor(solicitud.cuadroComparativo.items, { ...proveedorActivo, clientId: clientIdActivo });
              const tabStyle = (activo) => ({
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 4px',
                fontSize: 'var(--text-body-size)',
                fontWeight: activo ? 600 : 400,
                color: activo ? 'var(--color-primary)' : 'var(--color-ink-muted)',
                borderBottom: activo ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              });
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-md)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    {proveedores.map((p) => (
                      <button key={p.id} type="button" onClick={() => setCcTab(String(p.id))} style={tabStyle(String(p.id) === idActivo)}>
                        {p.nombre}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {/* Nombre y "seleccionado" -- en el editor son un campo y un radio; aquí, texto. */}
                    <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Nombre del proveedor</span>
                        <span className={styles.infoValue}>{proveedorActivo.nombre}</span>
                      </div>
                      {proveedorActivo.seleccionado && <Badge variant="success">Proveedor seleccionado</Badge>}
                    </div>

                    <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
                      <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '40%' }}>Ítem</th>
                            <th style={{ width: '18%' }}>Cantidad</th>
                            <th style={{ width: '21%' }}>Valor unitario</th>
                            <th style={{ width: '21%' }}>Valor total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {solicitud.cuadroComparativo.items.map((it) => (
                            <tr key={it.id}>
                              <td>
                                {it.actividad || <em style={{ color: 'var(--color-ink-muted)' }}>Sin actividad</em>}
                                {it.alcance && <><br /><span style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)' }}>{it.alcance}</span></>}
                              </td>
                              {/* Cantidad Real (la que se compra/contrata), no Pendiente por consumir -- coherente con
                                  calcularValorTotalItem (cantidadReal). */}
                              <td className={styles.celdaNum}>{it.cantidadReal || 0} {it.unidad}</td>
                              <td className={styles.celdaNum}>{formatCurrency(it.precios?.[clientIdActivo])}</td>
                              <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalItem(it, clientIdActivo))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* % de AIU/IVA de ESTE proveedor -- mismos campos (CAMPOS_AIU) y lugar que en el editor. */}
                    {camposAiu.length > 0 && (
                      <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                        {camposAiu.map(([campoPct, , label]) => (
                          <div key={campoPct} className={styles.infoItem}>
                            <span className={styles.infoLabel}>{label} (%)</span>
                            <span className={styles.infoValue}>{proveedorActivo[campoPct] ?? 0}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md) var(--space-xl)', padding: 'var(--space-md)', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-data-size)' }}>
                      <span>Subtotal: <strong>{formatCurrency(totales.subtotal)}</strong></span>
                      {camposAiu.map(([campoPct, campoValor, label]) => (
                        <span key={campoPct}>{label}: <strong>{formatCurrency(totales[campoValor])}</strong></span>
                      ))}
                      <span>Costo total: <strong>{formatCurrency(totales.costoTotal)}</strong></span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

        </>
      )}

      {seccionActual === 'memoria' && (
        <>
      {/* Solo para Directas por ahora (mismo alcance que
          SolicitudForm.jsx#categoriaEfectiva) -- normalizarMemoria() le da
          a columnas/filas el mismo `clientId` que ya usan
          calcularValorCalculada/calcularTotalColumna/ImagenAutenticada
          (importados tal cual de MemoriaBuilder.jsx, misma fuente de
          verdad que la vista de edición). */}
      {/* Memoria nueva: tabla pegada desde Excel (HTML ya limpio por el
          backend). Abajo queda el render de las memorias viejas
          (columnas/filas), que ya no se pueden crear. */}
      {solicitud.categoria === 'DIRECTA' && (solicitud.memoria?.contenidoHtml || solicitud.memoria?.imagenes?.length > 0) && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Memoria</h2>
          <MemoriaTablaVista html={solicitud.memoria.contenidoHtml} imagenes={solicitud.memoria.imagenes} />
        </div>
      )}
      {solicitud.categoria === 'DIRECTA' && !solicitud.memoria?.contenidoHtml && !(solicitud.memoria?.imagenes?.length > 0) && solicitud.memoria?.filas?.length > 0 && (() => {
        const { titulo, columnas, filas } = normalizarMemoria(solicitud.memoria);
        const columnasConTotal = columnas.filter((c) => ['ENTERO', 'FLOAT', 'CALCULADA'].includes(c.tipo) && c.mostrarTotal);
        return (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Memoria</h2>
            {titulo && <p style={{ margin: 0, fontWeight: 600 }}>{titulo}</p>}
            <div className={styles.card} style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {columnas.map((c) => (
                      <th key={c.clientId}>{c.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clientId}>
                      {columnas.map((c) => (
                        <td key={c.clientId}>
                          {c.tipo === 'IMAGEN' ? (
                            f.valores[c.clientId] ? <ImagenAutenticada url={f.valores[c.clientId]} alt={c.nombre} /> : '—'
                          ) : c.tipo === 'RANGO_FECHAS' ? (
                            `${f.valores[c.clientId]?.inicio || '—'} – ${f.valores[c.clientId]?.fin || '—'}`
                          ) : c.tipo === 'CALCULADA' ? (
                            calcularValorCalculada(f.valores, c)
                          ) : (
                            f.valores[c.clientId] ?? '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {columnasConTotal.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 600, background: 'var(--color-surface-sunken)' }}>
                      {columnas.map((c, idx) => (
                        <td key={c.clientId}>{columnasConTotal.includes(c) ? calcularTotalColumna(filas, c) : idx === 0 ? 'TOTAL' : ''}</td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })()}

        </>
      )}

      {seccionActual === 'cronograma' && (
        <>
      {solicitud.cronograma && (
        <div className={styles.section}>
          <div className={styles.header}>
            <h2 className={styles.sectionTitle}>Cronograma</h2>
            <Button type="button" variant="secondary" onClick={handleExportarCronograma} disabled={descargando != null}>
              {descargando === 'cronograma' ? 'Generando…' : 'Exportar a Excel'}
            </Button>
          </div>
          <div className={styles.infoGrid}>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha de inicio</span><span className={styles.infoValue}>{new Date(solicitud.cronograma.fechaInicio).toLocaleDateString('es-CO')}</span></div>
            <div className={`${styles.infoItem} ${d.dato}`}><span className={styles.infoLabel}>Fecha de fin</span><span className={styles.infoValue}>{new Date(solicitud.cronograma.fechaFin).toLocaleDateString('es-CO')}</span></div>
          </div>
          <div className={styles.card}>
            <table className={styles.table}>
              <thead>
                <tr><th>Actividad</th><th>Fecha inicio</th><th>Fecha fin</th></tr>
              </thead>
              <tbody>
                {(solicitud.cronograma.tieneFases ? solicitud.cronograma.fases.flatMap((f) => f.actividades.map((a) => ({ ...a, fase: f.nombreFase }))) : solicitud.cronograma.actividades).map((a) => (
                  <tr key={a.id}>
                    <td>{a.fase ? `${a.fase} — ` : ''}{a.descripcion}</td>
                    <td>{new Date(a.fechaInicio).toLocaleDateString('es-CO')}</td>
                    <td>{new Date(a.fechaFin).toLocaleDateString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

        </>
      )}

      {seccionActual === 'documentos' && (
        <>
      {(archivos.length > 0 || anexos.length > 0) && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Documentos adjuntos</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {archivos.map(([campo, label]) => (
              <div key={campo} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Paperclip size={14} style={{ color: 'var(--color-ink-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 500 }}>{label}</span>
                <a href={urlArchivo(solicitud[campo])} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 'var(--text-label-size)', color: 'var(--color-primary)' }}>
                  Descargar
                </a>
              </div>
            ))}

            {anexos.length > 0 && (
              <>
                {archivos.length > 0 && (
                  <p style={{ margin: 'var(--space-sm) 0 0', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase' }}>
                    Anexos de la solicitud
                  </p>
                )}
                {anexos.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', textDecoration: 'none', color: 'inherit' }}
                  >
                    <Link2 size={14} style={{ flexShrink: 0, color: 'var(--color-ink-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--text-body-size)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
                      <span style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)' }}>{detectarPlataforma(a.url)}</span>
                    </span>
                    <ExternalLink size={13} style={{ flexShrink: 0, color: 'var(--color-ink-muted)' }} />
                  </a>
                ))}
              </>
            )}
          </div>
        </div>
      )}

        </>
      )}


      {seccionActual === 'historial' && <HistorialSeguimiento historial={solicitud.historial} />}
    </div>
  );
}
