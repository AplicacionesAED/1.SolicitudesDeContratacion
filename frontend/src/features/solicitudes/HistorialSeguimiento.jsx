// Puerto de la sección "Historial de Seguimiento" de (app)/solicitudes/[id]/page.tsx
// (recuperada de git history, commit 5d82ee9, junto con el stepper de
// EstadoTimeline.jsx -- ver el comentario ahí). Es una lista vertical con
// TODAS las entradas del historial (a diferencia del stepper, que solo
// marca los 8 hitos principales), con el estado resultante de cada acción y
// la nota si la tiene. No incluye el rol del usuario que actuó (el original
// sí lo mostraba, `usuario.rol` era un string único en Prisma) -- este
// backend usa `Usuario.roles` como array (Fase 1), y `getById` no trae ese
// campo en el include del historial; se omite en vez de adivinar cuál rol
// mostrar.
import { ACCION_LABELS, ACCION_ESTADO_DESTINO, ACCION_COLOR_VARIANT, ESTADO_LABELS } from '../../utils/solicitudes.js';
import styles from './Solicitudes.module.css';

function formatDateTime(date) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

// ACCION_LABELS.DEVOLVER es fijo ('Devuelta al solicitante') y acá se usa
// como título de la fila. Desde 2026-09-22 el backend puede redirigir el
// destino de un DEVOLVER a PENDIENTE_RESIDENTE_ADMINISTRATIVO (Directa:
// devolver desde Controles-Proyección o Trámite Contratos) -- titular esa
// fila 'Devuelta al solicitante' contradiría el 'Estado resultante' de la
// misma fila. Mismo criterio que `estadoDestino` de abajo: leer el valor
// real `estadoResultante` (que ya sabe qué pasó) en vez del mapa estático.
function accionLabel(entry) {
  if (entry.accion === 'DEVOLVER' && entry.estadoResultante === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO') {
    return 'Devuelta al Residente Administrativo';
  }
  return ACCION_LABELS[entry.accion] ?? entry.accion;
}

export function HistorialSeguimiento({ historial = [] }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Historial de seguimiento</h2>
      {historial.length === 0 ? (
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 'var(--text-data-size)', fontStyle: 'italic', margin: 0 }}>Sin registros en el historial.</p>
      ) : (
        <ol className={styles.seguimientoList}>
          {historial.map((entry) => {
            const label = accionLabel(entry);
            // Preferir el estado REAL ya persistido (con cualquier desvío
            // condicional de workflow_desvios ya aplicado) -- el mapa
            // estático solo queda como fallback para filas de historial
            // creadas antes de que este campo existiera. Ver el comentario
            // de la migración `20260918160000-add-estado-resultante-historial.js`.
            const estadoDestino = entry.estadoResultante ?? ACCION_ESTADO_DESTINO[entry.accion];
            const isNegative = entry.accion === 'DEVOLVER' || entry.accion === 'REVISAR';
            const colorVariant = ACCION_COLOR_VARIANT[entry.accion] ?? 'neutral';
            return (
              <li key={entry.id} className={styles.seguimientoItem}>
                <span className={`${styles.seguimientoDot} ${styles[`seguimientoDot${colorVariant.charAt(0).toUpperCase()}${colorVariant.slice(1)}`]}`} aria-hidden="true" />
                <div className={styles.seguimientoContent}>
                  <p className={styles.seguimientoFecha}>{formatDateTime(entry.fecha)}</p>
                  <p className={isNegative ? styles.seguimientoAccionNegativa : styles.seguimientoAccion}>{label}</p>
                  {entry.usuario?.nombre && <p className={styles.seguimientoUsuario}>{entry.usuario.nombre}</p>}
                  {estadoDestino && (
                    <p className={styles.seguimientoEstado}>
                      Estado resultante: <span>{ESTADO_LABELS[estadoDestino] ?? estadoDestino}</span>
                    </p>
                  )}
                  {entry.nota && <p className={isNegative ? styles.seguimientoNotaNegativa : styles.seguimientoNota}>{entry.nota}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
