// Puerto literal de api/solicitudes/[id]/estado/route.ts (app Next.js
// original, 454 líneas) -- la máquina de estados completa: 11 transiciones,
// las validaciones por acción, la propagación de valorFinal al padre en un
// OTROSI_TIEMPO_CANTIDAD completado. Todo dentro de un
// sequelize.transaction() (reemplaza prisma.$transaction).
//
// 2026-09-02 "eliminar permisos de rol para solicitudes": la autorización
// de cada acción (quién puede ejecutarla) se movió por completo a
// solicitud.autorizacion.js#puedeEjecutarAccion -- este archivo ya NO
// chequea permisos de rol ni arrays de AprobadorFrente directamente, solo
// llama a ese helper (la misma función que usa solicitud.service.js para
// calcular `accionesDisponibles`, que el frontend lee en SolicitudActions.jsx
// en vez de recalcular reglas de autorización por su cuenta).
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const sequelize = require('../../config/db');
const { getRolesFuncionalidades, getRolesPorCodigo } = require('../../utils/permisos');
const workflowService = require('../workflow/workflow.service');
const { ESTADOS_ORIGEN, ESTADO_DESTINO, puedeEjecutarAccion, resolverDestinoDevolver, esDirectorObraDeSolicitud, idsUsuariosDelPaso } = require('./solicitud.autorizacion');
const Solicitud = require('./solicitud.model');
const HistorialSolicitud = require('./historialSolicitud.model');
const solicitudService = require('./solicitud.service');
const Usuario = require('../usuario/usuario.model');
const notificacionService = require('../notificacion/notificacion.service');
const Tercero = require('../tercero/tercero.model');
const CuadroComparativo = require('./cuadroComparativo.model');
const CuadroComparativoProveedor = require('./cuadroComparativoProveedor.model');
const CuadroComparativoItem = require('./cuadroComparativoItem.model');

// 2026-09-09 "eso de OBRA no es necesario" -- reemplaza al viejo valor único
// 'OBRA' (con etiqueta distinta según categoría): ahora el valor guardado ya
// es distinto por categoría. Mismo mapa (sin la parte de etiquetas, que es
// puramente de frontend) que frontend/src/utils/solicitudes.js#tipoContratoLabel/
// SolicitudForm.jsx#tiposContratoDisponibles -- el backend no puede importar
// código del frontend, se repite acá.
// 2026-10-20 "Orden de Servicio en Directa solo para < $50.000.000, por
// encima amerita licitación" -- mismo criterio que
// frontend/src/utils/solicitudes.js#LIMITE_ORDEN_SERVICIO_DIRECTA (el
// backend no puede importar código del frontend, se repite acá).
const LIMITE_ORDEN_SERVICIO_DIRECTA = 50000000;
// Mínimo de caracteres del motivo al devolver (espejo en frontend: SolicitudActions.jsx).
const MIN_NOTA_DEVOLVER = 30;
function formatearPesos(valor) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
}

const TIPOS_CONTRATO_VALIDOS_POR_CATEGORIA = {
  // 2026-09-21 "agregar 5 tipos de contrato nuevos para DIRECTA" -- Suministro
  // de Materiales, Mano de Obra, Servicios, Transporte y Alquiler, con los
  // códigos exactos acordados con Dwight/Oscar. INDIRECTA no cambia.
  DIRECTA: ['TODO_COSTO', 'SUMINISTRO_MATERIALES', 'MANO_OBRA', 'SERVICIOS', 'TRANSPORTE', 'ALQUILER'],
  INDIRECTA: ['OTROS_SERVICIOS', 'DISENO'],
};

const cambiarEstado = asyncHandler(async (req, res) => {
  const numId = Number(req.params.id);
  if (!Number.isInteger(numId)) throw new ApiError(400, 'ID inválido');

  const { accion, nota, estadoContratacion, numeroContratoAdpro } = req.body;
  if (!accion) throw new ApiError(400, 'accion es requerida');

  const estadosOrigen = ESTADOS_ORIGEN[accion];
  if (!estadosOrigen) throw new ApiError(400, `Acción desconocida: ${accion}`);

  const userId = req.usuario.id;

  const solicitud = await Solicitud.findByPk(numId, {
    include: [
      { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'roles'] },
      { model: Usuario, as: 'aprobador', attributes: ['id', 'nombre'] },
    ],
  });
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  const funcionalidadesPorRol = await getRolesFuncionalidades();
  if (!(await puedeEjecutarAccion(solicitud, req.usuario, accion, funcionalidadesPorRol))) {
    throw new ApiError(403, `No tienes permiso para ejecutar la acción ${accion}`);
  }

  if (!estadosOrigen.includes(solicitud.estado)) {
    throw new ApiError(409, `La solicitud está en estado ${solicitud.estado} y no puede ejecutar ${accion}`);
  }

  const frenteIds = solicitud.frentes_ids ?? [];

  // ── Validaciones de negocio por acción (la autorización ya se resolvió
  //    arriba con puedeEjecutarAccion -- acá solo quedan reglas de datos) ──

  if (accion === 'ENVIAR') {
    // Etiquetas en español para el mensaje de error -- antes se mostraba el
    // nombre crudo de la columna (snake_case, ej. "tercero_id"), confuso
    // para quien no conoce el modelo de datos. Pedido explícito del usuario
    // (2026-09-21): mensajes más explícitos, sin nombres de variable.
    const CAMPO_LABEL = {
      tipo: 'Tipo de solicitud',
      tercero_id: 'Contratista',
      descripcion_actividad: 'Objeto',
      plazo_ejecucion: 'Plazo de ejecución',
      forma_pago: 'Forma de pago',
      valor_final: 'Valor total',
    };
    const requiredFields = ['tipo', 'tercero_id', 'descripcion_actividad', 'plazo_ejecucion', 'forma_pago', 'valor_final'];
    for (const field of requiredFields) {
      if (!solicitud[field]) throw new ApiError(400, `Falta completar "${CAMPO_LABEL[field] ?? field}" antes de poder enviar la solicitud.`);
    }
    // Los datos del contratista deben estar completos (los usa el documento generado) -- el frontend lo valida en espejo.
    const DATOS_CONTRATISTA = {
      razon_social: 'Razón social',
      nit: 'NIT',
      representante_legal: 'Representante legal',
      cedula_representante: 'Cédula representante',
      correo_firma: 'Correo de firma',
      direccion_representante: 'Dirección representante',
      telefono_representante: 'Teléfono representante',
    };
    // TEMPORAL (pruebas, 2026-11-10): validación de datos del contratista desactivada. Volver a true para reactivarla.
    const VALIDAR_DATOS_CONTRATISTA = false;
    const contratista = VALIDAR_DATOS_CONTRATISTA ? await Tercero.findByPk(solicitud.tercero_id) : null;
    const faltantesContratista = !VALIDAR_DATOS_CONTRATISTA ? [] : Object.entries(DATOS_CONTRATISTA).filter(([campo]) => !String(contratista?.[campo] ?? '').trim()).map(([, label]) => label);
    if (faltantesContratista.length > 0) {
      throw new ApiError(400, `Faltan datos del contratista antes de poder enviar la solicitud: ${faltantesContratista.join(', ')}.`);
    }
    // 2026-09-09 "en directos, Orden de Servicio debe tener el mismo
    // formato que Contrato... de momento debe ser exactamente igual" --
    // antes tipoContrato solo era obligatorio para CONTRATO (una Orden de
    // Servicio siempre llegaba con un valor ya forzado por el frontend, sin
    // selector visible). Ahora que SolicitudForm.jsx muestra el mismo radio
    // "Tipo de contrato" para Orden de Servicio en DIRECTA (y ya no lo
    // fuerza solo), el backend tiene que exigirlo ahí también -- si no,
    // alguien saltándose el formulario podría enviar una Orden de Servicio
    // directa sin tipoContrato. Acotado a CONTRATO/ORDEN_SERVICIO a
    // propósito -- un Otrosí nunca tuvo este campo, y `categoria ===
    // 'DIRECTA'` solo no alcanzaría a distinguirlo. INDIRECTA no cambia: su
    // Orden de Servicio sigue sin mostrar el selector y sigue llegando con
    // el valor forzado de siempre.
    const exigeTipoContrato = solicitud.tipo === 'CONTRATO' || (solicitud.tipo === 'ORDEN_SERVICIO' && solicitud.categoria === 'DIRECTA');
    if (exigeTipoContrato && !solicitud.tipo_contrato) {
      throw new ApiError(400, 'Falta completar "Tipo de contrato" antes de poder enviar la solicitud.');
    }
    // "En los contratos directos no existen los contratos de tipo Diseño...
    // eso de OBRA no es necesario, en directos Todo Costo y en indirectos
    // Otros Servicios" -- pedido explícito del usuario, 2 vueltas: primero
    // solo la etiqueta cambiaba según categoría sobre un mismo valor 'OBRA',
    // después se pidió que el valor GUARDADO también fuera distinto por
    // categoría (ver TIPOS_CONTRATO_VALIDOS_POR_CATEGORIA). Frontend ya no
    // ofrece las combinaciones inválidas
    // (SolicitudForm.jsx#tiposContratoDisponibles), esto cierra el hueco de
    // alguien mandando el POST/PATCH a mano.
    if (solicitud.tipo_contrato && !TIPOS_CONTRATO_VALIDOS_POR_CATEGORIA[solicitud.categoria]?.includes(solicitud.tipo_contrato)) {
      throw new ApiError(400, `El tipo de contrato '${solicitud.tipo_contrato}' no es válido para la categoría ${solicitud.categoria}`);
    }
    if (frenteIds.length === 0) throw new ApiError(400, 'Debe seleccionar al menos un frente');

    // 2026-09-09 "cuadro comparativo estructurado": reemplaza al viejo
    // `archivoCuadroComparativo` (un archivo adjunto) -- ese campo NUNCA se
    // validó acá (solo en el frontend, SolicitudForm.jsx), hueco real que se
    // corrige de una. Solo aplica a Contrato/Orden de Servicio -- un Otrosí
    // nunca tuvo este requisito.
    if (solicitud.tipo === 'CONTRATO' || solicitud.tipo === 'ORDEN_SERVICIO') {
      const cuadro = await CuadroComparativo.findOne({
        where: { solicitud_id: solicitud.id },
        include: [
          { model: CuadroComparativoProveedor, as: 'proveedores' },
          { model: CuadroComparativoItem, as: 'items' },
        ],
      });
      if (!cuadro || !cuadro.proveedores?.length || !cuadro.items?.length) {
        throw new ApiError(400, 'El cuadro comparativo (al menos un proveedor y un ítem) es obligatorio para enviar');
      }
    }

    // "Orden de Servicio en Directa solo para valores < $50.000.000" --
    // pedido explícito del usuario (2026-10-20): por encima del tope, el
    // negocio exige un proceso de licitación en vez de una Orden de
    // Servicio simple. Acotado a DIRECTA+ORDEN_SERVICIO (confirmado con el
    // usuario) -- Indirecta no tiene este tope. Se compara contra
    // `valor_final` CON IVA (sobre utilidad) -- el mismo valor que ya
    // calcula el Cuadro Comparativo y que el frontend valida en espejo
    // (SolicitudForm.jsx), esto es la defensa en profundidad del lado del
    // servidor por si alguien se salta el formulario.
    if (solicitud.tipo === 'ORDEN_SERVICIO' && solicitud.categoria === 'DIRECTA' && Number(solicitud.valor_final) >= LIMITE_ORDEN_SERVICIO_DIRECTA) {
      throw new ApiError(400, `El valor de esta Orden de Servicio supera el tope de ${formatearPesos(LIMITE_ORDEN_SERVICIO_DIRECTA)} permitido para este tipo de solicitud. Un valor igual o superior requiere adelantar un proceso de licitación; no es posible enviarla como Orden de Servicio.`);
    }
  }

  if (accion === 'DEVOLVER' || accion === 'REVISAR') {
    if (!nota || nota.trim() === '') throw new ApiError(400, 'Se requiere una nota para esta acción');
  }
  // Devolver (Directa e Indirecta, cualquier estado de origen) exige un motivo
  // de al menos 30 caracteres para que el solicitante sepa qué corregir.
  if (accion === 'DEVOLVER' && nota.trim().length < MIN_NOTA_DEVOLVER) {
    throw new ApiError(400, `El motivo de la devolución debe tener al menos ${MIN_NOTA_DEVOLVER} caracteres`);
  }

  // "no quiero eliminarlas directamente" -- ANULAR es un cambio de estado
  // más, nunca un DELETE; pedido explícito del usuario que el motivo sea
  // obligatorio (mismo criterio que DEVOLVER/REVISAR), queda en el
  // historial y en `notaContratacion` del detalle.
  if (accion === 'ANULAR') {
    if (!nota || nota.trim() === '') throw new ApiError(400, 'Se requiere un motivo para anular la solicitud');
  }

  // COMENTAR (2026-09-21, flujo propio de Directa) -- la encargada de
  // Controles — Proyección deja un comentario (ej. motivo de retraso) sin
  // mover el estado: el destino ES el mismo estado (ESTADO_DESTINO.arriba)
  // y el comentario queda en el historial vía `nota` (el
  // HistorialSolicitud.create de más abajo corre para todas las acciones, sin
  // condicionar por acción). A diferencia de DEVOLVER/REVISAR/ANULAR NO se
  // escribe `nota_contratacion` -- ese campo se renderiza como banner de
  // error en el detalle, y un comentario de seguimiento no señala un
  // problema, es contexto.
  if (accion === 'COMENTAR') {
    if (!nota || nota.trim() === '') throw new ApiError(400, 'Se requiere un comentario');
  }

  // "Contratos elaboración de orden debe ser un check" -- pedido explícito
  // del usuario, 2026-09-18: en Directa este paso deja de exigir un anexo
  // adjunto (solo Indirecta sigue exigiéndolo, comportamiento sin cambios).
  if (accion === 'AVANZAR_CONTRATOS' && solicitud.categoria === 'INDIRECTA') {
    const anexos = solicitud.archivos_anexos ?? [];
    if (anexos.length === 0) throw new ApiError(400, 'Debe adjuntar al menos un documento en Anexos de la solicitud antes de continuar');
  }

  if (accion === 'REGISTRAR_ADPRO') {
    if (!numeroContratoAdpro || numeroContratoAdpro.trim() === '') throw new ApiError(400, 'Se requiere el número de contrato Adpro');
  }

  // ── Construir el update ─────────────────────────────────────────────────────

  let estadoDestino = ESTADO_DESTINO[accion];

  // DEVOLVER en Directa volviendo al paso 3 (2026-09-22): cuando la
  // solicitud ya pasó la aprobación del Residente Administrativo (paso 4
  // Controles — Proyección o paso 5 Trámite Contratos en adelante), devolver
  // la manda a PENDIENTE_RESIDENTE_ADMINISTRATIVO y no a DEVUELTA -- no
  // reinicia el flujo. Desde paso 2 (ENVIADA) o el propio paso 3 sigue yendo
  // a DEVUELTA como siempre (resolverDestinoDevolver devuelve 'DEVUELTA' como
  // default para cualquier otro caso, incluida toda INDIRECTA). INDIRECTA no
  // cambia nada.
  if (accion === 'DEVOLVER') estadoDestino = resolverDestinoDevolver(solicitud.estado, solicitud.categoria);

  // Desvíos condicionales (configurables en /configuracion/workflows) -- hoy
  // hay uno solo sembrado (ENVIAR, rol TECNICA, categoría INDIRECTA ->
  // PENDIENTE_DIRECTOR_TECNICO), pero cualquier combinación rol/categoría
  // por acción se resuelve acá sin tocar código. condicion_rol/
  // condicion_categoria en NULL significa "aplica sin esa condición"; la
  // primera fila activa que matchee gana. Esto es independiente de
  // puedeEjecutarAccion -- decide A DÓNDE va la solicitud, no QUIÉN puede
  // moverla.
  const aplicarDesvios = (accionDesvio, destinoBase) => workflowService.resolverDestinoConDesvios(accionDesvio, destinoBase, solicitud.categoria, solicitud.solicitante?.roles);
  estadoDestino = await aplicarDesvios(accion, estadoDestino);

  // Directa (2026-11-24): si quien envía es el propio Director de Obra de la solicitud, su aprobación se da por hecha -- la
  // solicitud salta el paso ENVIADA y sigue a donde la llevaría APROBAR_DIRECTOR (con sus desvíos). En el historial quedan
  // las dos acciones (el envío y la aprobación automática), así el stepper marca el paso como completado.
  const estadoTrasEnvio = estadoDestino;
  const autoAprobadaDirectorObra = (accion === 'ENVIAR' || accion === 'REENVIAR') && estadoDestino === 'ENVIADA' && (await esDirectorObraDeSolicitud(solicitud, req.usuario));
  if (autoAprobadaDirectorObra) estadoDestino = await aplicarDesvios('APROBAR_DIRECTOR', ESTADO_DESTINO.APROBAR_DIRECTOR);

  const estadoOrigen = solicitud.estado;
  const updateData = { estado: estadoDestino };
  if (accion === 'APROBAR_DIRECTOR' || autoAprobadaDirectorObra) updateData.fecha_aprobacion_director = new Date();
  // Flujo propio de Directa -- "Controles realiza proyección, debe dar su
  // aprobado con fecha de aprobación" (2026-09-18). Mismo patrón que
  // fecha_aprobacion_director: se estampa sola, no es un campo manual.
  if (accion === 'APROBAR_PROYECCION') updateData.fecha_aprobacion_controles_proyeccion = new Date();
  // Doble paso del Residente Administrativo en Directa (2026-09-21) -- mismo
  // patrón de estampa automática; Dwight agrega la columna
  // fecha_aprobacion_residente_administrativo en paralelo (migración), no se
  // toca schema desde acá.
  if (accion === 'APROBAR_RESIDENTE_ADMINISTRATIVO') updateData.fecha_aprobacion_residente_administrativo = new Date();
  // Firma del Gerente de Compras (Directa) -- mismo patrón de estampa automática que los demás `fecha_aprobacion_*`.
  if (accion === 'APROBAR_GERENTE_COMPRAS') updateData.fecha_aprobacion_gerente_compras = new Date();
  // OK del revisor de Compras: solo informativo, queda en el historial. Se limpia al (re)entrar al paso.
  if (accion === 'CONCEPTO_COMPRAS_OK') {
    updateData.concepto_compras = 'OK';
    updateData.nota_concepto_compras = nota?.trim() || null;
    updateData.fecha_concepto_compras = new Date();
    updateData.concepto_compras_por = req.usuario.nombre ?? null;
  }
  // Al (re)entrar a Compras y Contrataciones el concepto anterior deja de valer.
  if (estadoDestino === 'PENDIENTE_GERENTE_COMPRAS' && estadoOrigen !== 'PENDIENTE_GERENTE_COMPRAS') {
    updateData.concepto_compras = null;
    updateData.nota_concepto_compras = null;
    updateData.fecha_concepto_compras = null;
    updateData.concepto_compras_por = null;
  }
  if (accion === 'REVISAR') {
    updateData.necesita_revision = true;
    updateData.nota_contratacion = nota;
  }
  if (accion === 'DEVOLVER') updateData.nota_contratacion = nota;
  if (accion === 'ANULAR') updateData.nota_contratacion = nota;
  if (accion === 'REGISTRAR_ADPRO') updateData.numero_contrato_adpro = numeroContratoAdpro;
  if (estadoContratacion) updateData.nota_contratacion = estadoContratacion;

  await sequelize.transaction(async (transaction) => {
    await solicitud.update(updateData, { transaction });

    if (autoAprobadaDirectorObra) {
      // Fechas explícitas con 1 ms de diferencia: el stepper ordena por fecha y necesita el envío ANTES de la aprobación.
      const ahora = Date.now();
      await HistorialSolicitud.create({ solicitud_id: numId, usuario_id: userId, accion, nota: nota ?? null, estado_resultante: estadoTrasEnvio, fecha: new Date(ahora) }, { transaction });
      await HistorialSolicitud.create(
        { solicitud_id: numId, usuario_id: userId, accion: 'APROBAR_DIRECTOR', nota: 'Aprobación automática: la solicitud la envió el propio Director de Obra.', estado_resultante: estadoDestino, fecha: new Date(ahora + 1) },
        { transaction }
      );
    } else {
      await HistorialSolicitud.create({ solicitud_id: numId, usuario_id: userId, accion, nota: nota ?? null, estado_resultante: estadoDestino }, { transaction });
    }

    // Si se completa un OTROSI_TIEMPO_CANTIDAD, actualizar valorFinal del padre.
    if (estadoDestino === 'COMPLETADA' && solicitud.tipo === 'OTROSI_TIEMPO_CANTIDAD' && solicitud.solicitud_padre_id != null && solicitud.valor_final != null) {
      await Solicitud.update({ valor_final: solicitud.valor_final }, { where: { id: solicitud.solicitud_padre_id }, transaction });
    }
  });

  // Notificaciones -- best-effort, FUERA de la transacción (igual que el
  // original): un error acá nunca debe tumbar la transición de estado ya
  // confirmada, por eso todo el bloque va en su propio try/catch sin await
  // bloqueante del response.
  try {
    // Avisos de "paso pendiente": a TODOS los que pueden aprobar ese paso (2026-11-24), no solo al primero del slot.
    const delPaso = (slot) => idsUsuariosDelPaso(solicitud, slot);
    const avisarPaso = async (slot, enviar) => {
      for (const id of await delPaso(slot)) await enviar(id);
    };

    if (accion === 'ENVIAR') {
      if (estadoDestino === 'PENDIENTE_DIRECTOR_TECNICO') {
        // Resuelto por código, no por el string 'DIRECTOR_TECNICO' a secas
        // (2026-09-18) -- si el admin renombra ese rol, esta notificación
        // no debe dejar de encontrar a nadie.
        const nombreDirectorTecnico = (await getRolesPorCodigo()).DIRECTOR_TECNICO;
        const directoresTecnicos = await Usuario.findAll({ where: { activo: true }, attributes: ['id', 'roles'] });
        for (const dt of directoresTecnicos) {
          if ((dt.roles ?? []).includes(nombreDirectorTecnico)) {
            await notificacionService.notificarNuevaSolicitud(numId, solicitud.solicitante.nombre, solicitud.consecutivo, dt.id);
          }
        }
      } else if (solicitud.categoria === 'INDIRECTA') {
        await avisarPaso('director_proyecto', (id) => notificacionService.notificarNuevaSolicitud(numId, solicitud.solicitante.nombre, solicitud.consecutivo, id));
      }
    }

    // Directa enviada o reenviada que queda esperando al Director de Obra (`aprobador_id` es null en Directa, el aviso de
    // arriba nunca le llega).
    if ((accion === 'ENVIAR' || accion === 'REENVIAR') && solicitud.categoria === 'DIRECTA' && estadoDestino === 'ENVIADA') {
      await avisarPaso('director_obra', (id) => notificacionService.notificarNuevaSolicitud(numId, solicitud.solicitante.nombre, solicitud.consecutivo, id));
    }

    // Envío del propio Director de Obra (Directa): no hay aprobación que pedir, se avisa al siguiente responsable.
    if (autoAprobadaDirectorObra && estadoDestino === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO') {
      await avisarPaso('residente_administrativo', (id) =>
        notificacionService.crearNotificacion(
          id,
          'Solicitud pendiente de tu aprobación',
          `El Director de Obra envió la solicitud ${solicitud.consecutivo}; debes revisarla y aprobarla como Residente Administrativo.`,
          `/solicitudes/${numId}`
        )
      );
    }

    if (accion === 'APROBAR_DIRECTOR_TECNICO') {
      await avisarPaso('director_proyecto', (id) => notificacionService.notificarNuevaSolicitud(numId, solicitud.solicitante.nombre, solicitud.consecutivo, id));
    }

    if (accion === 'APROBAR_DIRECTOR') {
      // Para Directa, el siguiente responsable ya no es Contratos-Trámite
      // sino el Residente Administrativo (doble paso 2026-09-21): el Director
      // de Obra aprueba y la solicitud queda en
      // PENDIENTE_RESIDENTE_ADMINISTRATIVO, donde él APROBARÁ su propio paso
      // (y puede editar antes de pasársela a Controles-Proyección). Se usa
      // una función con texto propio (notificarPendienteResidenteAdministrativo)
      // -- no se reusa notificarAprobadaDirector porque su texto dice "lista
      // para tramitar en contratación", que no aplica acá (ver notificacion.
      // service.js). INDIRECTA no cambia: sigue avisando a Contratos-Trámite.
      if (solicitud.categoria === 'DIRECTA') {
        await notificacionService.notificarPendienteResidenteAdministrativo(numId, solicitud.consecutivo, solicitud.solicitante_id, await delPaso('residente_administrativo'));
      } else {
        await notificacionService.notificarAprobadaDirector(numId, solicitud.consecutivo, solicitud.solicitante_id, await delPaso('contratos_tramite'));
      }
    }

    if (accion === 'APROBAR_RESIDENTE_ADMINISTRATIVO') {
      await avisarPaso('controles_proyeccion', (id) => notificacionService.notificarAprobadaResidenteAdministrativo(numId, solicitud.consecutivo, id));
    }

    // Solo si de verdad va a Trámite Contratos: en Directa el desvío la lleva a Compras y Contrataciones
    // (PENDIENTE_GERENTE_COMPRAS) y ese aviso se manda más abajo.
    if (accion === 'APROBAR_PROYECCION' && estadoDestino === 'EN_TRAMITE_CONTRATOS') {
      await avisarPaso('contratos_tramite', (id) => notificacionService.notificarAprobadaProyeccion(numId, solicitud.consecutivo, id));
    }

    if (accion === 'DEVOLVER' && nota) {
      // DEVOLVER con destino PENDIENTE_RESIDENTE_ADMINISTRATIVO (Directa
      // desde el paso 4/5, 2026-09-22): quien debe actuar ya no es el
      // solicitante sino el Residente Administrativo, que revisa/corrige y
      // reencamina la solicitud -- notificación con texto propio para él
      // (no se reusa notificarDevuelta, escrita para el solicitante). El
      // caso DEVUELTA (destino real de paso 2/3 y toda INDIRECTA) sigue
      // notificando al solicitante como siempre, sin cambios.
      if (estadoDestino === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO') {
        await avisarPaso('residente_administrativo', (id) => notificacionService.notificarDevueltaAResidenteAdministrativo(numId, solicitud.consecutivo, id, nota));
      } else {
        await notificacionService.notificarDevuelta(numId, solicitud.consecutivo, solicitud.solicitante_id, nota);
      }
    }

    if (accion === 'REVISAR' && nota) {
      await notificacionService.notificarEnRevision(numId, solicitud.consecutivo, solicitud.solicitante_id, nota);
    }

    if (accion === 'ANULAR' && nota) {
      await notificacionService.notificarAnulada(numId, solicitud.consecutivo, solicitud.solicitante_id, nota);
    }

    if (accion === 'COMENTAR' && nota) {
      await notificacionService.notificarComentario(numId, solicitud.consecutivo, solicitud.solicitante_id, nota);
    }

    // Directa (2026-11-05): tras Controles — Proyección la solicitud va directo a "Compras y Contrataciones" (desvío de
    // APROBAR_PROYECCION a PENDIENTE_GERENTE_COMPRAS) -- se avisa al Gerente de Compras asignado para su firma.
    if (accion === 'APROBAR_PROYECCION' && estadoDestino === 'PENDIENTE_GERENTE_COMPRAS') {
      await avisarPaso('gerente_compras', (id) => notificacionService.notificarPendienteGerenteCompras(numId, solicitud.consecutivo, id));
    }

    if (accion === 'AVANZAR_CONTRATOS' || accion === 'PASAR_CONTROLES') {
      // Directa: un desvío redirige AVANZAR_CONTRATOS a PENDIENTE_GERENTE_COMPRAS -- se avisa al Gerente de Compras
      // asignado para su firma en vez de a Controles.
      if (estadoDestino === 'PENDIENTE_GERENTE_COMPRAS') {
        await avisarPaso('gerente_compras', (id) => notificacionService.notificarPendienteGerenteCompras(numId, solicitud.consecutivo, id));
      } else {
        await avisarPaso('controles_adpro', (id) => notificacionService.notificarControles(numId, solicitud.consecutivo, id));
      }
    }

    // Al entrar a Compras y Contrataciones también se avisa al revisor para que dé su concepto (opcional).
    if (estadoDestino === 'PENDIENTE_GERENTE_COMPRAS' && estadoOrigen !== 'PENDIENTE_GERENTE_COMPRAS') {
      await avisarPaso('revisor_compras', (id) => notificacionService.notificarRevisionCompras(numId, solicitud.consecutivo, id));
    }

    // La aprobación final la da `director_controles` en Indirecta y `controles_aprobacion_final` en Directa (en Directa
    // `director_controles` siempre está vacío: ese slot no se configura ahí).
    if (accion === 'REGISTRAR_ADPRO') {
      const slotAprobacionFinal = solicitud.categoria === 'DIRECTA' ? 'controles_aprobacion_final' : 'director_controles';
      await avisarPaso(slotAprobacionFinal, (id) => notificacionService.notificarAdproRegistrado(numId, solicitud.consecutivo, id));
    }

    if (accion === 'APROBAR_FINAL') {
      await notificacionService.notificarCompletada(numId, solicitud.consecutivo, [solicitud.solicitante_id, solicitud.aprobador_id]);
    }

    // Firma del Gerente de Compras (Directa): la solicitud continúa a Adpro con el Residente Administrativo.
    if (accion === 'APROBAR_GERENTE_COMPRAS') {
      await avisarPaso('residente_administrativo', (id) => notificacionService.notificarControles(numId, solicitud.consecutivo, id));
    }
  } catch (notifError) {
    console.error('Error al enviar notificaciones:', notifError);
  }

  // Respuesta en camelCase (mismo shape que list()/getById()) -- nunca
  // devolver el `.toJSON()` snake_case crudo de la instancia acá.
  ok(res, await solicitudService.getById(numId, req.usuario));
});

module.exports = { cambiarEstado, ESTADOS_ORIGEN, ESTADO_DESTINO };
