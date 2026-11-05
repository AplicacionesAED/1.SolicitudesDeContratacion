// Puerto LITERAL de estadoTimeline.tsx (recuperado de git history, commit
// 5d82ee9 -- el puerto original de la Fase 4 lo simplificó por error a una
// lista vertical de historial, con el comentario "acá no había un stepper
// visual que reemplazar", que era falso: el original SÍ tenía este stepper
// horizontal con iconos, fechas y responsable por paso. Gap real reportado
// por el usuario, corregido acá restaurando el componente real.
import { Send, CheckCircle, FileText, PenLine, ClipboardCheck, ThumbsUp, Star, RotateCcw, Eye, UserCheck, Minus, History } from 'lucide-react';
import { ESTADO_LABELS } from '../../utils/solicitudes.js';
import styles from './Solicitudes.module.css';

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}

// Cada paso: qué acción del historial lo marca completado (null = se deriva
// del estado actual, como "Completada"), en qué estados está "en curso", y
// si es `optional` (Director Técnico, solo aplica cuando el solicitante es
// TECNICA -- si nunca se ejecutó, se muestra apagado con un guion en vez de
// marcarlo como pendiente) o `resettable` (un DEVOLVER/REENVIAR reinicia el
// ciclo -- ver lastCycleStartIdx más abajo, para no mostrar como
// "completado" un paso de un ciclo de aprobación anterior).
const WORKFLOW_STEPS = [
  { label: 'Solicitud Enviada', icon: Send, completionAction: 'ENVIAR', activeStates: [] },
  { label: 'Director Técnico', icon: UserCheck, optional: true, completionAction: 'APROBAR_DIRECTOR_TECNICO', activeStates: ['PENDIENTE_DIRECTOR_TECNICO'] },
  { label: 'Director de Proyecto', icon: CheckCircle, completionAction: 'APROBAR_DIRECTOR', activeStates: ['ENVIADA'], resettable: true },
  { label: 'Trámite Contratos', icon: FileText, completionAction: 'TRAMITAR_OK', activeStates: ['EN_TRAMITE_CONTRATOS', 'APROBADA_DIRECTOR'], resettable: true },
  { label: 'Creación de Minuta', icon: PenLine, completionAction: 'AVANZAR_CONTRATOS', activeStates: ['CREACION_MINUTA'], resettable: true },
  { label: 'N° Adpro / Controles', icon: ClipboardCheck, completionAction: 'REGISTRAR_ADPRO', activeStates: ['EN_CONTROLES'], resettable: true },
  { label: 'Aprobación Final', icon: ThumbsUp, completionAction: 'APROBAR_FINAL', activeStates: ['APROBACION_FINAL'], resettable: true },
  { label: 'Completada', icon: Star, completionAction: null, activeStates: ['COMPLETADA'] },
];

// Flujo propio de Directa (Orden de Servicio, 2026-09-18) -- la secuencia
// real ahora difiere de la de Indirecta (no es solo "un paso de menos"),
// así que es un array propio en vez de filtrar el de arriba: agrega
// "Controles — Proyección" (nuevo, no existe en Indirecta), reordena
// Trámite Contratos después de ese paso, y renombra "Creación de Minuta"/
// "N° Adpro / Controles"/"Aprobación Final" con los nombres/roles reales de
// este flujo (Elaboración de Orden / Residente Administrativo / Controles).
// 2026-09-21: se insertó "Residente Administrativo — Revisión" entre
// Director de Obra y Controles — Proyección (misma persona que el paso
// "Residente Administrativo — Adpro" más abajo, por eso comparte el ícono
// `UserCheck` -- 2 participaciones del mismo rol en este flujo).
// 2026-10-09: pedido explícito del usuario -- la aprobación final pasa a
// llamarse Aprobación Director/a de Controles, que es quien aprueba en
// estos momentos. El estado técnico sigue siendo APROBACION_FINAL/
// APROBAR_FINAL (sin cambios en el motor, ver solicitud.autorizacion.js) --
// acá SOLO se renombra la etiqueta visible para Directa (Indirecta se queda
// con "Aprobación Final" en WORKFLOW_STEPS de arriba, sin tocar).
// 2026-11-03: el paso del Gerente de Compras deja de ser el último y pasa a
// ser una FIRMA que va entre Elaboración de Orden y Residente Administrativo
// — Adpro (el estado técnico sigue siendo PENDIENTE_GERENTE_COMPRAS/
// APROBAR_GERENTE_COMPRAS; `Star` queda reservado para "Completada").
// 2026-11-05: Trámite Contratos, Elaboración de Orden y la firma se unifican en un solo paso, "Compras y
// Contrataciones" (la orden se genera con un botón, los otros dos eran solo un OK).
const WORKFLOW_STEPS_DIRECTA = [
  { label: 'Solicitud Enviada', icon: Send, completionAction: 'ENVIAR', activeStates: [] },
  { label: 'Director de Obra', icon: CheckCircle, completionAction: 'APROBAR_DIRECTOR', activeStates: ['ENVIADA'], resettable: true },
  { label: 'Residente Administrativo — Revisión', icon: UserCheck, completionAction: 'APROBAR_RESIDENTE_ADMINISTRATIVO', activeStates: ['PENDIENTE_RESIDENTE_ADMINISTRATIVO'], resettable: true },
  { label: 'Controles — Proyección', icon: ClipboardCheck, completionAction: 'APROBAR_PROYECCION', activeStates: ['EN_PROYECCION_CONTROLES'], resettable: true },
  { label: 'Compras y Contrataciones', icon: FileText, completionAction: 'APROBAR_GERENTE_COMPRAS', activeStates: ['PENDIENTE_GERENTE_COMPRAS'], resettable: true },
  { label: 'Residente Administrativo — Adpro', icon: UserCheck, completionAction: 'REGISTRAR_ADPRO', activeStates: ['EN_CONTROLES'], resettable: true },
  { label: 'Aprobación Director/a de Controles', icon: ThumbsUp, completionAction: 'APROBAR_FINAL', activeStates: ['APROBACION_FINAL'], resettable: true },
  { label: 'Completada', icon: Star, completionAction: null, activeStates: ['COMPLETADA'] },
];

const SIDE_STATES = ['DEVUELTA', 'EN_REVISION', 'BORRADOR'];

export function EstadoTimeline({ estadoActual, historial = [], importadoHistorico = false, numeroOtrosi, categoria }) {
  if (importadoHistorico) {
    return (
      <div className={styles.stepperCard}>
        <h3 className={styles.stepperTitle}>Progreso del flujo</h3>
        <div className={`${styles.stepperBanner} ${styles.stepperBannerWarning}`}>
          <History size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>{numeroOtrosi ? `Otrosí histórico #${numeroOtrosi} — importado sin flujo de aprobación.` : 'Contrato histórico — importado sin flujo de aprobación.'}</span>
        </div>
      </div>
    );
  }

  const isSideState = SIDE_STATES.includes(estadoActual);

  // El historial llega ordenado DESCENDENTE (más reciente primero, mismo
  // criterio que la lista de "Historial" de la página) -- el cálculo de
  // ciclo de abajo necesita orden ASCENDENTE (como el original), así que se
  // ordena una copia local acá en vez de asumir el orden del caller.
  const historialAsc = [...historial].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  // Índice del último ENVIAR/REENVIAR -- inicio del ciclo de aprobación
  // vigente. Los pasos `resettable` solo buscan su acción de completado
  // DESPUÉS de ese punto, para no arrastrar un "completado" de un ciclo
  // anterior (ej. una solicitud DEVUELTA y reenviada).
  const lastCycleStartIdx = historialAsc.reduce((best, h, i) => (h.accion === 'ENVIAR' || h.accion === 'REENVIAR' ? i : best), -1);

  // Segundo corte, SOLO para la Directa (2026-09-22): el backend ya redirige
  // el destino de DEVOLVER a PENDIENTE_RESIDENTE_ADMINISTRATIVO (en vez de
  // DEVUELTA) cuando se devuelve desde EN_PROYECCION_CONTROLES o
  // EN_TRAMITE_CONTRATOS. Sin este corte, los pasos desde "Residente
  // Administrativo — Revisión" seguirían mostrando su check de la vuelta
  // anterior: su acción de completado (APROBAR_RESIDENTE_ADMINISTRATIVO /
  // APROBAR_PROYECCION / ...) sigue en el historial del MISMO ciclo (más
  // reciente que el ENVIAR/REENVIAR), así que el corte de abajo no los
  // recorta. Índice del último DEVOLVER cuyo estado resultante fue ese.
  const RESIDENTE_ADMIN_REVISION_IDX = 2; // índice en WORKFLOW_STEPS_DIRECTA
  const lastDevolverResidenteIdx = historialAsc.reduce(
    (best, h, i) => (h.accion === 'DEVOLVER' && h.estadoResultante === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO' ? i : best),
    -1
  );

  // Directa tiene su propia secuencia de pasos desde el 2026-09-18 (ver
  // WORKFLOW_STEPS_DIRECTA más arriba) -- ya no alcanza con filtrar
  // "Director Técnico" del de Indirecta, la secuencia real difiere.
  const pasos = categoria === 'DIRECTA' ? WORKFLOW_STEPS_DIRECTA : WORKFLOW_STEPS;

  return (
    <div className={styles.stepperCard}>
      <h3 className={styles.stepperTitle}>Progreso del flujo</h3>

      {isSideState && (
        <div
          className={`${styles.stepperBanner} ${
            estadoActual === 'DEVUELTA' ? styles.stepperBannerDanger : estadoActual === 'EN_REVISION' ? styles.stepperBannerWarning : styles.stepperBannerNeutral
          }`}
        >
          {estadoActual === 'DEVUELTA' && <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />}
          {estadoActual === 'EN_REVISION' && <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
          <span>
            Estado actual: <strong>{ESTADO_LABELS[estadoActual] ?? estadoActual}</strong>
          </span>
        </div>
      )}

      <div className={styles.stepperWrap}>
        <div className={styles.stepperConnector} aria-hidden="true" />
        <ol className={styles.stepperList}>
          {pasos.map((step, idx) => {
            const Icon = step.icon;
            // Corte efectivo del ciclo para este paso: SOLO en Directa, desde
            // el paso "Residente Administrativo — Revisión" (idx 2) en adelante
            // entra también el corte del último DEVOLVER que regresó a ese
            // estado; se toma el corte más reciente entre ese y el del
            // ENVIAR/REENVIAR. Indirecta (WORKFLOW_STEPS) no se toca.
            const cutIdx =
              categoria === 'DIRECTA' && idx >= RESIDENTE_ADMIN_REVISION_IDX
                ? Math.max(lastCycleStartIdx, lastDevolverResidenteIdx)
                : lastCycleStartIdx;
            const searchSlice = step.resettable && cutIdx >= 0 ? historialAsc.slice(cutIdx + 1) : historialAsc;
            const histEntry = step.completionAction ? searchSlice.find((h) => h.accion === step.completionAction) : null;
            const isCompleted = step.completionAction === null ? step.activeStates.includes(estadoActual) : Boolean(histEntry);
            const isCurrent = !isCompleted && step.activeStates.includes(estadoActual);
            const isSkipped = Boolean(step.optional) && !isCompleted && !isCurrent;
            const isCompletadaStep = step.activeStates.includes('COMPLETADA');

            const circleClass = isSkipped
              ? styles.stepperCircleSkipped
              : isCompleted
              ? isCompletadaStep
                ? styles.stepperCircleDone
                : styles.stepperCircleCompleted
              : isCurrent
              ? styles.stepperCircleCurrent
              : styles.stepperCirclePending;

            const labelClass = isSkipped
              ? styles.stepperLabelSkipped
              : isCurrent
              ? styles.stepperLabelCurrent
              : isCompleted
              ? isCompletadaStep
                ? styles.stepperLabelDone
                : styles.stepperLabelCompleted
              : styles.stepperLabelPending;

            const date = histEntry ? formatDate(histEntry.fecha) : null;
            const userName = histEntry?.usuario?.nombre ?? null;

            return (
              <li key={step.label} className={styles.stepperItem}>
                <div className={`${styles.stepperCircle} ${circleClass}`} aria-current={isCurrent ? 'step' : undefined}>
                  {isSkipped ? <Minus size={14} strokeWidth={1.75} aria-hidden="true" /> : <Icon size={16} strokeWidth={1.75} aria-hidden="true" />}
                </div>
                <span className={`${styles.stepperLabel} ${labelClass}`}>{step.label}</span>
                {date && <span className={styles.stepperDate}>{date}</span>}
                {userName && <span className={styles.stepperUser}>{userName}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
