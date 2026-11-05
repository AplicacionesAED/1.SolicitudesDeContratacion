// Puerto literal de src/lib/notifications.ts (helpers notificar*) + la lógica
// de api/notificaciones/route.ts (listar/marcar leída). API en camelCase
// sobre columnas snake_case, mismo criterio que tercero.service.js.
const ApiError = require('../../utils/ApiError');
const Notificacion = require('./notificacion.model');

function _enrich(n) {
  const d = n.toJSON ? n.toJSON() : n;
  return { id: d.id, titulo: d.titulo, mensaje: d.mensaje, leida: d.leida, url: d.url, creadoEn: d.creado_en };
}

async function crearNotificacion(usuarioId, titulo, mensaje, url) {
  await Notificacion.create({ usuario_id: usuarioId, titulo, mensaje, url: url ?? null });
}

async function notificarNuevaSolicitud(solicitudId, solicitanteNombre, consecutivo, aprobadorId) {
  await crearNotificacion(
    aprobadorId,
    'Nueva solicitud pendiente de aprobación',
    `${solicitanteNombre} envió la solicitud ${consecutivo} para su aprobación.`,
    `/solicitudes/${solicitudId}`
  );
}

async function notificarAprobadaDirector(solicitudId, consecutivo, solicitanteId, contratosUserId) {
  const tareas = [
    crearNotificacion(solicitanteId, 'Solicitud aprobada por Director', `Tu solicitud ${consecutivo} fue aprobada por el Director de Proyecto.`, `/solicitudes/${solicitudId}`),
  ];
  if (contratosUserId) {
    tareas.push(crearNotificacion(contratosUserId, 'Nueva solicitud en trámite', `La solicitud ${consecutivo} está lista para tramitar en contratación.`, `/solicitudes/${solicitudId}`));
  }
  await Promise.all(tareas);
}

async function notificarDevuelta(solicitudId, consecutivo, solicitanteId, nota) {
  await crearNotificacion(solicitanteId, 'Solicitud devuelta para correcciones', `Tu solicitud ${consecutivo} fue devuelta. Nota: ${nota}`, `/solicitudes/${solicitudId}`);
}

// DEVOLVER en Directa que vuelve al paso 3 (2026-09-22, "devolver en
// Directa"): cuando la solicitud ya pasó la aprobación del Residente
// Administrativo y se devuelve desde Controles — Proyección o Trámite
// Contratos, el destino es PENDIENTE_RESIDENTE_ADMINISTRATIVO y quien debe
// actuar es el Residente Administrativo (revisar/corregir y reencaminar), NO
// el solicitante -- por eso no se reusa notificarDevuelta, cuyo texto está
// escrito para el solicitante que recibe para correcciones. Mismo criterio
// que notificarPendienteResidenteAdministrativo vs notificarAprobadaDirector.
async function notificarDevueltaAResidenteAdministrativo(solicitudId, consecutivo, residenteAdministrativoUserId, nota) {
  await crearNotificacion(residenteAdministrativoUserId, 'Solicitud devuelta a tu revisión', `La solicitud ${consecutivo} fue devuelta; debes revisarla y reencaminarla como Residente Administrativo. Nota: ${nota}`, `/solicitudes/${solicitudId}`);
}

async function notificarEnRevision(solicitudId, consecutivo, solicitanteId, nota) {
  await crearNotificacion(solicitanteId, 'Solicitud requiere revisión', `Tu solicitud ${consecutivo} debe revisarse. Nota: ${nota}`, `/solicitudes/${solicitudId}`);
}

async function notificarAnulada(solicitudId, consecutivo, solicitanteId, nota) {
  await crearNotificacion(solicitanteId, 'Solicitud anulada', `Tu solicitud ${consecutivo} fue anulada. Motivo: ${nota}`, `/solicitudes/${solicitudId}`);
}

async function notificarControles(solicitudId, consecutivo, controlesUserId) {
  await crearNotificacion(controlesUserId, 'Solicitud lista para registro en Adpro', `La solicitud ${consecutivo} completó el trámite de contratos y debe registrarse en Adpro.`, `/solicitudes/${solicitudId}`);
}

// Flujo propio de Directa (2026-09-18) -- tras la aprobación de Controles-
// Proyección, Contratos-Trámite es el siguiente responsable. Sin
// notificarAprobadaDirector reusado a propósito -- ese además le manda al
// solicitante "aprobada por Director", que ya recibió antes y sería
// confuso repetir acá.
async function notificarAprobadaProyeccion(solicitudId, consecutivo, contratosUserId) {
  await crearNotificacion(contratosUserId, 'Nueva solicitud en trámite', `La solicitud ${consecutivo} está lista para tramitar en contratación.`, `/solicitudes/${solicitudId}`);
}

// Doble paso del Residente Administrativo en Directa (2026-09-21) -- el
// Director de Obra aprobó y la solicitud queda en
// PENDIENTE_RESIDENTE_ADMINISTRATIVO; quien debe actuar ahora es el
// Residente Administrativo, que tiene que APROBAR su propio paso, NO
// tramitar en contratación (por eso no se reusa notificarAprobadaDirector,
// cuyo texto hardcodeado habla de "Nueva solicitud en trámite"). Mismo
// patrón de firma que notificarAprobadaDirector: avisa al solicitante que
// su solicitud fue aprobada y al responsable del paso siguiente con texto
// propio.
async function notificarPendienteResidenteAdministrativo(solicitudId, consecutivo, solicitanteId, residenteAdministrativoUserId) {
  const tareas = [
    crearNotificacion(solicitanteId, 'Solicitud aprobada por Director de Obra', `Tu solicitud ${consecutivo} fue aprobada por el Director de Obra.`, `/solicitudes/${solicitudId}`),
  ];
  if (residenteAdministrativoUserId) {
    tareas.push(crearNotificacion(residenteAdministrativoUserId, 'Solicitud pendiente de tu aprobación', `El Director de Obra aprobó la solicitud ${consecutivo}; debes revisarla y aprobarla como Residente Administrativo.`, `/solicitudes/${solicitudId}`));
  }
  await Promise.all(tareas);
}

// Doble paso del Residente Administrativo en Directa (2026-09-21) -- tras su
// aprobación, la solicitud aterriza en EN_PROYECCION_CONTROLES y el siguiente
// responsable es Controles-Proyección (misma relación que la del bloque
// APROBAR_PROYECCION pero con DISTINTO emisor, así que no se reusa esa
// función: el texto dice quién aprobó).
async function notificarAprobadaResidenteAdministrativo(solicitudId, consecutivo, controlesProyeccionUserId) {
  await crearNotificacion(controlesProyeccionUserId, 'Solicitud aprobada por Residente Administrativo', `La solicitud ${consecutivo} fue aprobada por el Residente Administrativo y continúa hacia la proyección de Controles.`, `/solicitudes/${solicitudId}`);
}

async function notificarAdproRegistrado(solicitudId, consecutivo, directorControlesId) {
  await crearNotificacion(directorControlesId, 'Solicitud lista para aprobación final', `La solicitud ${consecutivo} tiene número Adpro registrado y requiere su aprobación final.`, `/solicitudes/${solicitudId}`);
}

// Firma del Gerente de Compras en Directa -- desde 2026-11-03 va ANTES de Adpro: al terminar la elaboración de la
// orden (AVANZAR_CONTRATOS) un desvío redirige DIRECTA a PENDIENTE_GERENTE_COMPRAS (ver
// solicitud.estado.js). Guard interno por si el frente todavía no tiene un
// Gerente de Compras asignado -- mismo criterio que
// notificarPendienteResidenteAdministrativo.
async function notificarPendienteGerenteCompras(solicitudId, consecutivo, gerenteComprasUserId) {
  if (!gerenteComprasUserId) return;
  await crearNotificacion(gerenteComprasUserId, 'Solicitud pendiente de tu firma', `La solicitud ${consecutivo} está en Compras y Contrataciones; debes revisarla y firmarla como Gerente de Compras.`, `/solicitudes/${solicitudId}`);
}

async function notificarCompletada(solicitudId, consecutivo, involucrados) {
  await Promise.all(
    involucrados.filter(Boolean).map((usuarioId) =>
      crearNotificacion(usuarioId, 'Solicitud completada', `La solicitud ${consecutivo} fue aprobada definitivamente y está completada.`, `/solicitudes/${solicitudId}`)
    )
  );
}

// ── Consumo desde el frontend (NotificacionesBell) ──────────────────────────

async function listar(usuarioId) {
  const [notificaciones, totalNoLeidas] = await Promise.all([
    Notificacion.findAll({ where: { usuario_id: usuarioId }, order: [['leida', 'ASC'], ['creado_en', 'DESC']], limit: 20 }),
    Notificacion.count({ where: { usuario_id: usuarioId, leida: false } }),
  ]);
  return { notificaciones: notificaciones.map(_enrich), totalNoLeidas };
}

async function contarNoLeidas(usuarioId) {
  return Notificacion.count({ where: { usuario_id: usuarioId, leida: false } });
}

async function marcarLeida(usuarioId, id) {
  const notif = await Notificacion.findByPk(id);
  if (!notif) throw new ApiError(404, 'Notificación no encontrada');
  if (notif.usuario_id !== Number(usuarioId)) throw new ApiError(403, 'Sin acceso a esta notificación');
  await notif.update({ leida: true });
  return _enrich(notif);
}

async function marcarTodasLeidas(usuarioId) {
  await Notificacion.update({ leida: true }, { where: { usuario_id: usuarioId, leida: false } });
}

// COMENTAR (2026-09-21, flujo propio de Directa) -- un comentario de
// Controles — Proyección sin cambio de estado (ej. motivo de retraso); se
// le avisa al solicitante igual que con las notas de
// DEVOLVER/REVISAR/ANULAR.
async function notificarComentario(solicitudId, consecutivo, solicitanteId, nota) {
  await crearNotificacion(solicitanteId, 'Nuevo comentario en la solicitud', `La solicitud ${consecutivo} tiene un comentario nuevo. Comentario: ${nota}`, `/solicitudes/${solicitudId}`);
}

module.exports = {
  crearNotificacion,
  notificarNuevaSolicitud,
  notificarAprobadaDirector,
  notificarAprobadaProyeccion,
  notificarAprobadaResidenteAdministrativo,
  notificarPendienteResidenteAdministrativo,
  notificarDevuelta,
  notificarDevueltaAResidenteAdministrativo,
  notificarEnRevision,
  notificarAnulada,
  notificarControles,
  notificarAdproRegistrado,
  notificarPendienteGerenteCompras,
  notificarCompletada,
  notificarComentario,
  listar,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
};
