// Autorización del motor de aprobación de Solicitud -- fuente ÚNICA
// compartida entre solicitud.estado.js#cambiarEstado (la puerta real) y
// solicitud.service.js#getById/list (el hint `accionesDisponibles` que lee
// el frontend, ver SolicitudActions.jsx). Desde que se eliminaron los
// permisos de rol para aprobar (2026-09-02, "eliminar permisos de rol para
// solicitudes"), la autorización de cada acción de APROBACIÓN depende pura
// y exclusivamente de AprobadorFrente (personas específicas O roles
// específicos, por frente+categoría) -- ENVIAR/REENVIAR son la excepción:
// crear/enviar una solicitud no tiene un frente todavía resuelto de la
// misma forma, así que siguen gateados por un permiso de Rol -- desde el
// "desglose ver/crear" del mismo día, `crear_solicitudes_directas`/
// `_indirectas` (separado de `ver_solicitudes_directas`/`_indirectas`, que
// solo gatea listar/navegar la sección -- ver tieneVerSolicitudes abajo).
//
// La SECUENCIA de estados (quién puede ir a dónde) sigue fija acá, a
// propósito -- eso nunca fue lo que se pidió hacer configurable.
const { tienePermiso } = require('../../utils/permisos');
const AprobadorFrente = require('../aprobadorFrente/aprobadorFrente.model');

// ANULAR (2026-09-09, pedido del usuario: "no quiero eliminarlas
// directamente... que la persona de Controles que registra el N° Adpro
// tenga ese botón") -- cancela por completo una solicitud YA ENVIADA, sin
// borrar nada de la base (mismo espíritu que DEVOLVER/REVISAR: un cambio de
// estado más, con nota e historial, nunca un DELETE real). Puede dispararse
// desde CUALQUIER estado no-terminal -- se decidió explícitamente con el
// usuario que NO incluya COMPLETADA (deshacer un contrato ya cerrado sería
// un caso aparte, más delicado) ni, por supuesto, BORRADOR (ahí ya existe
// "eliminar" de verdad) ni ANULADA (ya es terminal). La lista de abajo es
// literalmente "todos los estados reales de ESTADOS_ORIGEN menos BORRADOR",
// para no tener que mantenerla sincronizada a mano si se agrega un estado
// nuevo más adelante.
// APROBAR_PROYECCION (2026-09-18, flujo propio de Directa/Orden de
// Servicio -- "Controles realiza proyección, debe dar su aprobado con
// fecha de aprobación") -- el estado EN_PROYECCION_CONTROLES solo lo
// alcanza una solicitud DIRECTA (vía el desvío sembrado de APROBAR_DIRECTOR,
// ver la migración de esta fecha), así que esta acción nunca aplica a una
// Indirecta en la práctica, sin necesitar ningún `if (categoria === ...)`
// acá.
// COMENTAR (2026-09-21, flujo propio de Directa -- la encargada de
// Controles — Proyección necesita dejar un comentario, ej. motivo de
// retraso, SIN cambiar el estado de la solicitud) -- acción de solo-nota:
// el destino es el MISMO estado (no mueve nada, ver ESTADO_DESTINO) y el
// comentario queda en el Historial de Seguimiento vía `nota`. Origen
// acotado a EN_PROYECCION_CONTROLES a propósito -- un comentario es
// contexto de la etapa en curso, no un mecanismo generalizable (mismo
// criterio de alcance que el resto de la sección).
// APROBAR_RESIDENTE_ADMINISTRATIVO (2026-09-21, "doble paso del Residente
// Administrativo" en Directa) -- entre la aprobación del Director de Obra y
// la proyección de Controles entra un paso nuevo: la solicitud pasa a
// PENDIENTE_RESIDENTE_ADMINISTRATIVO y la aprueba el Residente
// Administrativo (la MISMA persona/rol que al final registra el N° Adpro --
// participa dos veces en el flujo Directa, una ahora y otra en el paso
// REGISTRAR_ADPRO). El estado nuevo es de solo-transición: existe para
// acotar QUIÉN puede aprobar (ver ACCION_SLOT_FIJO abajo) y para reflejar la
// etapa en el dashboard/estadoDiligencia, nada más.
const ESTADOS_ORIGEN_SIN_ANULAR = {
  ENVIAR: ['BORRADOR'],
  APROBAR_DIRECTOR_TECNICO: ['PENDIENTE_DIRECTOR_TECNICO'],
  APROBAR_DIRECTOR: ['ENVIADA'],
  APROBAR_PROYECCION: ['EN_PROYECCION_CONTROLES'],
  COMENTAR: ['EN_PROYECCION_CONTROLES'],
  APROBAR_RESIDENTE_ADMINISTRATIVO: ['PENDIENTE_RESIDENTE_ADMINISTRATIVO'],
  // DEVOLVER incluye PENDIENTE_RESIDENTE_ADMINISTRATIVO desde 2026-09-22
  // ("devolver en Directa"): el Residente Administrativo puede devolver
  // desde SU PROPIO paso -- era un gap real, ni siquiera podía.
  DEVOLVER: ['PENDIENTE_DIRECTOR_TECNICO', 'ENVIADA', 'PENDIENTE_RESIDENTE_ADMINISTRATIVO', 'EN_PROYECCION_CONTROLES', 'EN_TRAMITE_CONTRATOS', 'PENDIENTE_GERENTE_COMPRAS'],
  REVISAR: ['APROBADA_DIRECTOR', 'EN_TRAMITE_CONTRATOS'],
  TRAMITAR_OK: ['EN_TRAMITE_CONTRATOS', 'APROBADA_DIRECTOR'],
  AVANZAR_CONTRATOS: ['CREACION_MINUTA'],
  PASAR_CONTROLES: ['ENVIO_CONTRATO_POLIZAS'],
  REGISTRAR_ADPRO: ['EN_CONTROLES'],
  APROBAR_FINAL: ['APROBACION_FINAL'],
  // APROBAR_GERENTE_COMPRAS (flujo propio de Directa; en la práctica es la FIRMA del Gerente de Compras) -- 2026-11-03
  // pasó a ir ANTES del Residente Administrativo — Adpro: al terminar la elaboración de la orden (AVANZAR_CONTRATOS),
  // un desvío condicional (sembrado por migración, ver solicitud.estado.js#desvios) redirige DIRECTA a
  // PENDIENTE_GERENTE_COMPRAS en vez de EN_CONTROLES. INDIRECTA no tiene ese desvío, así que este estado/acción nunca
  // se alcanza ahí -- igual que PENDIENTE_RESIDENTE_ADMINISTRATIVO.
  APROBAR_GERENTE_COMPRAS: ['PENDIENTE_GERENTE_COMPRAS'],
  REENVIAR: ['DEVUELTA', 'EN_REVISION'],
};

const ESTADOS_NO_TERMINALES = [...new Set(Object.values(ESTADOS_ORIGEN_SIN_ANULAR).flat())].filter((e) => e !== 'BORRADOR');

const ESTADOS_ORIGEN = {
  ...ESTADOS_ORIGEN_SIN_ANULAR,
  ANULAR: ESTADOS_NO_TERMINALES,
};

const ESTADO_DESTINO = {
  ENVIAR: 'ENVIADA',
  APROBAR_DIRECTOR_TECNICO: 'ENVIADA',
  APROBAR_DIRECTOR: 'EN_TRAMITE_CONTRATOS',
  // Para DIRECTA, un desvío condicional (sembrado por migración, sin tocar
  // código acá) redirige esto a EN_PROYECCION_CONTROLES en vez de
  // EN_TRAMITE_CONTRATOS -- ver solicitud.estado.js#desvios. INDIRECTA usa
  // este default sin cambios.
  APROBAR_PROYECCION: 'EN_TRAMITE_CONTRATOS',
  // COMENTAR no transiciona: el destino es el mismo estado de origen, para
  // que la solicitud quede exactamente donde estaba.
  COMENTAR: 'EN_PROYECCION_CONTROLES',
  // APROBAR_RESIDENTE_ADMINISTRATIVO (doble paso Directa 2026-09-21): el
  // Residente Administrativo aprueba su paso y la solicitud CONTINÚA el
  // flujo Directa normal hacia proyección de Controles.
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'EN_PROYECCION_CONTROLES',
  DEVOLVER: 'DEVUELTA',
  REVISAR: 'EN_REVISION',
  TRAMITAR_OK: 'CREACION_MINUTA',
  AVANZAR_CONTRATOS: 'EN_CONTROLES',
  PASAR_CONTROLES: 'EN_CONTROLES',
  REGISTRAR_ADPRO: 'APROBACION_FINAL',
  APROBAR_FINAL: 'COMPLETADA',
  // Firma del Gerente de Compras (solo Directa): continúa hacia el Residente Administrativo — Adpro (EN_CONTROLES).
  APROBAR_GERENTE_COMPRAS: 'EN_CONTROLES',
  REENVIAR: 'ENVIADA',
  ANULAR: 'ANULADA',
};

// Acciones cuyo slot de AprobadorFrente no depende del estado origen actual.
// ANULAR usa el mismo slot que REGISTRAR_ADPRO/PASAR_CONTROLES a propósito
// -- pedido explícito: "la persona de Controles que registra el N° Adpro"
// es literalmente quien está en (o calza por rol con) el slot
// `controles_adpro` de AprobadorFrente, sin importar en qué estado no-
// terminal esté la solicitud en este momento (a diferencia de
// REGISTRAR_ADPRO, que además exige estar en EN_CONTROLES -- ANULAR no
// tiene esa restricción de estado, solo la de quién puede ejecutarla).
const ACCION_SLOT_FIJO = {
  APROBAR_DIRECTOR_TECNICO: 'director_tecnico',
  APROBAR_DIRECTOR: 'director_proyecto',
  APROBAR_PROYECCION: 'controles_proyeccion',
  // COMENTAR usa el mismo slot que APROBAR_PROYECCION a propósito: quien
  // puede aprobar la proyección es quien puede dejar comentarios en la
  // etapa EN_PROYECCION_CONTROLES. El snapshot `responsable_controles_proyeccion_id`
  // ya existe en SNAPSHOT_POR_SLOT, así que puedeEjecutarAccion lo cubre
  // solo (un usuario asignado pasa directo, sin tocar AprobadorFrente).
  COMENTAR: 'controles_proyeccion',
  // APROBAR_RESIDENTE_ADMINISTRATIVO (doble paso Directa 2026-09-21) -- usa
  // el MISMO slot que REGISTRAR_ADPRO/ANULAR: el Residente Administrativo
  // participa dos veces en el flujo Directa (ahora al aprobar este paso y al
  // final registrando el N° Adpro), es literalmente el mismo rol/persona.
  // Deliberadamente NO va en ACCION_SLOT_FIJO_DIRECTA -- resolva el fallback
  // (ver comentario de esa constante más abajo) como APROBAR_PROYECCION, así
  // el Directa cae acá sin lógica especial. El snapshot
  // `responsable_residente_administrativo_id` ya existe en SNAPSHOT_POR_SLOT.
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'residente_administrativo',
  TRAMITAR_OK: 'contratos_tramite',
  AVANZAR_CONTRATOS: 'contratos_minuta',
  PASAR_CONTROLES: 'controles_adpro',
  REGISTRAR_ADPRO: 'controles_adpro',
  APROBAR_FINAL: 'director_controles',
  // Mismo slot para las dos categorías (a diferencia de APROBAR_FINAL, que
  // sí difiere por categoría vía ACCION_SLOT_FIJO_DIRECTA) -- no hace falta
  // una entrada en ese mapa porque esta acción solo es alcanzable en
  // DIRECTA (el desvío que lleva a PENDIENTE_GERENTE_COMPRAS es DIRECTA-
  // only), así que resolverSlot nunca necesita distinguir categoría acá.
  APROBAR_GERENTE_COMPRAS: 'gerente_compras',
  ANULAR: 'controles_adpro',
};

// Flujo propio de Directa (Orden de Servicio, 2026-09-18): "Director de
// Obra" reemplaza a Director de Proyecto como quien aprueba la solicitud
// (confirmado con el usuario: es un rol/slot DISTINTO, no una etiqueta);
// "Registrar Adpro" pasa de Controles a un rol nuevo, Residente
// Administrativo; la aprobación final pasa de Director de Controles a
// Controles (una responsabilidad DISTINTA de la de Controles-Proyección,
// también confirmado -- pueden ser personas diferentes por frente). ANULAR
// sigue el mismo criterio de siempre ("la persona que registra el N° Adpro
// puede anular"), ahora apuntando al slot que de verdad lo hace en Directa.
// INDIRECTA no tiene entrada acá -- sigue cayendo al ACCION_SLOT_FIJO de
// siempre sin ningún cambio.
const ACCION_SLOT_FIJO_DIRECTA = {
  APROBAR_DIRECTOR: 'director_obra',
  REGISTRAR_ADPRO: 'residente_administrativo',
  APROBAR_FINAL: 'controles_aprobacion_final',
  ANULAR: 'residente_administrativo',
};

// DEVOLVER/REVISAR pueden dispararse desde varios estados distintos -- el
// slot responsable es el de la etapa en la que la solicitud REALMENTE está
// en ese momento (ej. devolver desde PENDIENTE_DIRECTOR_TECNICO lo decide
// Director Técnico, devolver desde ENVIADA lo decide Director de Proyecto).
// PENDIENTE_RESIDENTE_ADMINISTRATIVO (2026-09-22): devolver desde SU paso lo
// decide el propio Residente Administrativo.
const SLOT_POR_ESTADO_ORIGEN = {
  PENDIENTE_DIRECTOR_TECNICO: 'director_tecnico',
  ENVIADA: 'director_proyecto',
  PENDIENTE_RESIDENTE_ADMINISTRATIVO: 'residente_administrativo',
  EN_PROYECCION_CONTROLES: 'controles_proyeccion',
  EN_TRAMITE_CONTRATOS: 'contratos_tramite',
  // Directa (2026-11-05): "Compras y Contrataciones" -- el Gerente de Compras puede devolver desde su propio paso.
  PENDIENTE_GERENTE_COMPRAS: 'gerente_compras',
};

// DEVOLVER en Directa volviendo al paso 3, no al paso 1 (2026-09-22): si la
// solicitud ya avanzó más allá de la aprobación del Residente Administrativo
// (Controles — Proyección, Trámite Contratos, o cualquier etapa posterior),
// DEVOLVER no debe reiniciar todo el flujo mandándola a DEVUELTA -- vuelve a
// PENDIENTE_RESIDENTE_ADMINISTRATIVO, donde el Residente Administrativo
// revisa/corrige y reencamina la solicitud (patrón de "devolver una etapa
// atrás" que ya usa el flujo Indirecta con PENDIENTE_DIRECTOR_TECNICO).
// Acotado a DIRECTA a propósito: INDIRECTA no tiene este paso y
// EN_TRAMITE_CONTRATOS es un origen de DEVOLVER que comparten ambas
// categorías, así que el guard de categoría es obligatorio -- INDIRECTA sigue
// yendo siempre a DEVUELTA. El ESTADO_DESTINO.DEVOLVER del mapa general queda
// intacto como fallback/default ('DEVUELTA') y es lo que resolverDestinoDevolver
// devuelve cuando no aplica el override.
const ESTADO_DESTINO_DEVOLVER_DIRECTA = {
  EN_PROYECCION_CONTROLES: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
  EN_TRAMITE_CONTRATOS: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
  PENDIENTE_GERENTE_COMPRAS: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
};

function resolverDestinoDevolver(estadoActual, categoria) {
  if (categoria === 'DIRECTA' && ESTADO_DESTINO_DEVOLVER_DIRECTA[estadoActual]) return ESTADO_DESTINO_DEVOLVER_DIRECTA[estadoActual];
  return 'DEVUELTA';
}

// Campo en la propia Solicitud que "recuerda" a quién se le asignó este
// paso al crearse (ver solicitud.service.js#resolverResponsablesFrente) --
// si sos esa persona, pasás directo sin volver a consultar AprobadorFrente
// (así alguien asignado sigue pudiendo actuar aunque después se lo saque
// del array, y viceversa un agregado nuevo igual puede actuar vía el slot
// en vivo). `director_tecnico` no tiene snapshot -- nunca se resuelve un
// responsable específico al crear, es responsabilidad de rol, siempre se
// evalúa en vivo contra el slot.
const SNAPSHOT_POR_SLOT = {
  director_proyecto: 'aprobador_id',
  contratos_tramite: 'responsable_contratos_tramite_id',
  contratos_minuta: 'responsable_contratos_minuta_id',
  director_controles: 'director_controles_id',
  controles_adpro: 'coordinador_controles_id',
  controles_proyeccion: 'responsable_controles_proyeccion_id',
  residente_administrativo: 'responsable_residente_administrativo_id',
  controles_aprobacion_final: 'responsable_controles_aprobacion_final_id',
  director_obra: 'responsable_director_obra_id',
  gerente_compras: 'responsable_gerente_compras_id',
};

function resolverSlot(accion, estadoActual, categoria) {
  if (accion === 'DEVOLVER' || accion === 'REVISAR') {
    // Devolver desde ENVIADA lo decide quien aprueba en ese punto -- para
    // Directa es Director de Obra (director_obra), no Director de Proyecto.
    if (categoria === 'DIRECTA' && estadoActual === 'ENVIADA') return 'director_obra';
    return SLOT_POR_ESTADO_ORIGEN[estadoActual] ?? null;
  }
  if (categoria === 'DIRECTA' && ACCION_SLOT_FIJO_DIRECTA[accion]) return ACCION_SLOT_FIJO_DIRECTA[accion];
  return ACCION_SLOT_FIJO[accion] ?? null;
}

async function usuarioAutorizadoParaSlot(frenteIds, usuario, campoSlot, categoria) {
  if (!frenteIds.length) return false;
  const config = await AprobadorFrente.findOne({ where: { frente_id: frenteIds, categoria } });
  const slot = config?.[campoSlot] ?? { usuarios: [], roles: [] };
  if ((slot.usuarios ?? []).includes(Number(usuario.id))) return true;
  const userRoles = usuario.roles ?? [];
  return (slot.roles ?? []).some((r) => userRoles.includes(r));
}

// 2026-09-02 "desglose ver/crear": tieneModuloSolicitudes (un solo permiso
// que cubría ver+crear) se separó en dos -- ver gatea el listado/sección,
// crear gatea el botón "Nueva solicitud" y las acciones ENVIAR/REENVIAR.
function tieneVerSolicitudes(usuario, categoria, funcionalidadesPorRol) {
  const sufijo = categoria === 'DIRECTA' ? 'directas' : 'indirectas';
  return tienePermiso(usuario.roles ?? [], usuario.funcionalidades_adicionales ?? [], `ver_solicitudes_${sufijo}`, funcionalidadesPorRol, usuario.esAdmin);
}

function tieneCrearSolicitudes(usuario, categoria, funcionalidadesPorRol) {
  const sufijo = categoria === 'DIRECTA' ? 'directas' : 'indirectas';
  return tienePermiso(usuario.roles ?? [], usuario.funcionalidades_adicionales ?? [], `crear_solicitudes_${sufijo}`, funcionalidadesPorRol, usuario.esAdmin);
}

// GET /solicitudes?categoria=X -- alguien puede LISTAR esa categoría si
// tiene ver O crear (quien solo tiene crear igual necesita listar para
// buscar el "contrato base" al armar un otrosí, ver OtrosiForm.jsx/
// ImportarHistoricoPage.jsx). El filtro de CUÁLES filas ve dentro de esa
// categoría (dueño/frente/alcance_solicitudes: PROPIAS/FRENTE/TODAS) es un
// mecanismo aparte, sin cambios -- ver solicitud.service.js#list.
function puedeListarSolicitudes(usuario, categoria, funcionalidadesPorRol) {
  if (usuario.esAdmin) return true;
  return tieneVerSolicitudes(usuario, categoria, funcionalidadesPorRol) || tieneCrearSolicitudes(usuario, categoria, funcionalidadesPorRol);
}

// Autorización real de una acción sobre una solicitud puntual. ADMIN sigue
// siendo bypass total, igual que siempre.
async function puedeEjecutarAccion(solicitud, usuario, accion, funcionalidadesPorRol) {
  if (usuario.esAdmin) return true;

  if (accion === 'ENVIAR' || accion === 'REENVIAR') {
    if (accion === 'REENVIAR' && solicitud.solicitante_id !== Number(usuario.id)) return false;
    return tieneCrearSolicitudes(usuario, solicitud.categoria, funcionalidadesPorRol);
  }

  const slot = resolverSlot(accion, solicitud.estado, solicitud.categoria);
  if (!slot) return false;

  const snapshotCampo = SNAPSHOT_POR_SLOT[slot];
  if (snapshotCampo && solicitud[snapshotCampo] && Number(solicitud[snapshotCampo]) === Number(usuario.id)) return true;

  const frenteIds = solicitud.frentes_ids ?? [];
  return usuarioAutorizadoParaSlot(frenteIds, usuario, slot, solicitud.categoria);
}

// Lista de acciones que ESTE usuario puede ejecutar AHORA sobre ESTA
// solicitud -- consumido por solicitud.service.js para exponer
// `accionesDisponibles`, que el frontend lee en vez de recalcular permisos
// (ver SolicitudActions.jsx).
async function getAccionesDisponibles(solicitud, usuario, funcionalidadesPorRol) {
  const disponibles = [];
  for (const [accion, estadosOrigen] of Object.entries(ESTADOS_ORIGEN)) {
    if (!estadosOrigen.includes(solicitud.estado)) continue;
    if (await puedeEjecutarAccion(solicitud, usuario, accion, funcionalidadesPorRol)) disponibles.push(accion);
  }
  return disponibles;
}

const TODOS_LOS_SLOTS = [
  'director_proyecto',
  'contratos_tramite',
  'contratos_minuta',
  'director_controles',
  'director_tecnico',
  'controles_adpro',
  'controles_proyeccion',
  'residente_administrativo',
  'controles_aprobacion_final',
  'director_obra',
  'gerente_compras',
];

// Reemplaza el viejo chequeo `revisar_contratos_${sufijo}` que usaban
// getById()/update() para decidir "¿este usuario puede ver/editar CUALQUIER
// solicitud, no solo las suyas o las de su frente?". Ese slug ya no existe
// -- el criterio equivalente ahora es "¿está autorizado para gestionar ESTA
// solicitud en cualquiera de sus 6 roles de responsabilidad posibles?"
// (mismo espíritu: alguien que tramita/aprueba contratos en general debía
// poder verlos todos, ahora acotado a los frentes donde realmente tiene esa
// responsabilidad asignada).
async function puedeGestionarSolicitud(solicitud, usuario) {
  if (usuario.esAdmin) return true;
  const frenteIds = solicitud.frentes_ids ?? [];
  for (const slot of TODOS_LOS_SLOTS) {
    if (await usuarioAutorizadoParaSlot(frenteIds, usuario, slot, solicitud.categoria)) return true;
  }
  return false;
}

// ¿Puede este usuario EDITAR la solicitud? (no aprobar: ver
// puedeEjecutarAccion). Factorización de la lógica que vivía inline en
// solicitud.service.js#update() (doble paso del Residente Administrativo en
// Directa, 2026-09-21): una solicitud se puede editar si está en un estado
// editable (BORRADOR/DEVUELTA/EN_REVISION) O el usuario es admin O la puede
// gestionar (puedeGestionarSolicitud, que ya recorre TODOS_LOS_SLOTS --
// incluye `residente_administrativo`, así el Residente Administrativo puede
// corregir la solicitud en PENDIENTE_RESIDENTE_ADMINISTRATIVO sin agregar ese
// estado a ninguna lista). Restricción: en los estados restringidos a su
// dueño (BORRADOR/DEVUELTA) solo el solicitante o un admin edita, aunque la
// pueda gestionar. Devuelve booleano: update() lo usa para rechazar con sus
// dos errores históricos y getById() lo expone como `puedeEditar` para que el
// frontend decida si mostrar el formulario en el detalle -- una sola fuente
// de verdad para el mismo concepto.
async function puedeEditarSolicitud(solicitud, usuario) {
  const esAdmin = usuario.esAdmin;
  const puedeRevisar = await puedeGestionarSolicitud(solicitud, usuario);
  const esOwner = solicitud.solicitante_id === Number(usuario.id);
  const esEstadoEditable = ['BORRADOR', 'DEVUELTA', 'EN_REVISION'].includes(solicitud.estado);

  if (!esEstadoEditable && !esAdmin && !puedeRevisar) return false;
  if (['BORRADOR', 'DEVUELTA'].includes(solicitud.estado) && !esOwner && !esAdmin) return false;
  return true;
}

// Estado -> la acción de APROBACIÓN que corresponde a ese paso (nunca
// DEVOLVER/REVISAR/ANULAR/REENVIAR -- esas son vías alternas, no "lo que
// este usuario debe aprobar ahora"). Usado por contarPendientesMiAprobacion
// para saber, por cada solicitud candidata, contra qué acción preguntarle
// a puedeEjecutarAccion.
const ACCION_PRINCIPAL_POR_ESTADO = {
  PENDIENTE_DIRECTOR_TECNICO: 'APROBAR_DIRECTOR_TECNICO',
  ENVIADA: 'APROBAR_DIRECTOR',
  // Doble paso del Residente Administrativo en Directa (2026-09-21): entre la
  // aprobación del Director de Obra y la proyección de Controles, la
  // solicitud queda acá y quien debe actuar es el Residente Administrativo
  // (mismo slot que REGISTRAR_ADPRO). No entra a ESTADOS_ACTIVOS a propósito
  // -- es un paso intermedio del flujo Directa, igual que
  // PENDIENTE_DIRECTOR_TECNICO para las aprobaciones previas. El contador
  // "pendientes por mi aprobación" del Residente Administrativo se arma con
  // Object.keys(ACCION_PRINCIPAL_POR_ESTADO) + CAMPOS_PENDIENTES (que ya
  // incluye responsable_residente_administrativo_id), así cae gratis.
  PENDIENTE_RESIDENTE_ADMINISTRATIVO: 'APROBAR_RESIDENTE_ADMINISTRATIVO',
  EN_PROYECCION_CONTROLES: 'APROBAR_PROYECCION',
  APROBADA_DIRECTOR: 'TRAMITAR_OK',
  EN_TRAMITE_CONTRATOS: 'TRAMITAR_OK',
  CREACION_MINUTA: 'AVANZAR_CONTRATOS',
  EN_CONTROLES: 'REGISTRAR_ADPRO',
  APROBACION_FINAL: 'APROBAR_FINAL',
  // Firma del Gerente de Compras en Directa (antes de Adpro desde 2026-11-03) -- mismo criterio
  // que PENDIENTE_RESIDENTE_ADMINISTRATIVO: cae gratis vía
  // Object.keys(ACCION_PRINCIPAL_POR_ESTADO) + CAMPOS_PENDIENTES (que ya
  // incluye responsable_gerente_compras_id).
  PENDIENTE_GERENTE_COMPRAS: 'APROBAR_GERENTE_COMPRAS',
};

module.exports = {
  ACCION_PRINCIPAL_POR_ESTADO,
  SNAPSHOT_POR_SLOT,
  ESTADOS_ORIGEN,
  ESTADO_DESTINO,
  resolverSlot,
  resolverDestinoDevolver,
  usuarioAutorizadoParaSlot,
  tieneVerSolicitudes,
  tieneCrearSolicitudes,
  puedeListarSolicitudes,
  puedeEjecutarAccion,
  getAccionesDisponibles,
  puedeGestionarSolicitud,
  puedeEditarSolicitud,
};
