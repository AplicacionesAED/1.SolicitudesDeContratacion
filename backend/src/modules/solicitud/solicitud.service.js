// API en camelCase (mismo vocabulario que la app Next.js original) sobre
// columnas snake_case -- mismo patrón que tercero.service.js. Este archivo
// concentra: el mapeo de campos, la visibilidad de listado/detalle, y las dos
// ramas de creación (solicitud normal vs. otrosí).
const { organizarArchivos } = require('./solicitud.archivos');
const { Op } = require('sequelize');
const ApiError = require('../../utils/ApiError');
const sequelize = require('../../config/db');
const Solicitud = require('./solicitud.model');
const HistorialSolicitud = require('./historialSolicitud.model');
const Usuario = require('../usuario/usuario.model');
const Tercero = require('../tercero/tercero.model');
const Proyecto = require('../proyecto/proyecto.model');
const Frente = require('../frente/frente.model');
const AprobadorFrente = require('../aprobadorFrente/aprobadorFrente.model');
const FrenteUsuario = require('../frente/frenteUsuario.model');
const CronogramaContrato = require('./cronogramaContrato.model');
const FaseCronograma = require('./faseCronograma.model');
const ActividadCronograma = require('./actividadCronograma.model');
const CuadroComparativo = require('./cuadroComparativo.model');
const CuadroComparativoProveedor = require('./cuadroComparativoProveedor.model');
const CuadroComparativoItem = require('./cuadroComparativoItem.model');
const Memoria = require('./memoria.model');
const { sanitizarTablaHtml } = require('../../utils/sanitizarTablaHtml');
const MemoriaColumna = require('./memoriaColumna.model');
const MemoriaFila = require('./memoriaFila.model');
const { getRolesAlcanceSolicitudes, resolverAlcanceSolicitudes, getRolesFuncionalidades, getRolesPorCodigo } = require('../../utils/permisos');
const { generarConsecutivo } = require('./solicitud.consecutivo');
const { nextNumeroOtrosi, pickMostRecentOtrosi } = require('./solicitud.otrosi');
const { puedeGestionarSolicitud, getAccionesDisponibles, puedeEditarSolicitud, puedeEjecutarAccion, resolverSlot, ACCION_PRINCIPAL_POR_ESTADO, SNAPSHOT_POR_SLOT } = require('./solicitud.autorizacion');

const CAMPO_DB = {
  proyectoId: 'proyecto_id',
  frentesIds: 'frentes_ids',
  terceroId: 'tercero_id',
  descripcionActividad: 'descripcion_actividad',
  plazoEjecucion: 'plazo_ejecucion',
  formaPago: 'forma_pago',
  valorFinal: 'valor_final',
  tipoContrato: 'tipo_contrato',
  asunto: 'asunto',
  creacionTercero: 'creacion_tercero',
  alcance: 'alcance',
  terminosReferencia: 'terminos_referencia',
  condicionesEspeciales: 'condiciones_especiales',
  valorEnLetras: 'valor_en_letras',
  contratanteNombre: 'contratante_nombre',
  contratanteNit: 'contratante_nit',
  // 2026-09-09 "cuadro comparativo estructurado": `archivoCuadroComparativo`
  // se sacó de acá a propósito -- el campo queda CONGELADO (nunca más
  // escribible por PATCH) para no perder el dato real de las 3 solicitudes
  // migradas en la Fase 9 que lo tienen poblado, pero ya no es la forma de
  // capturar esto -- ver cuadroComparativo.js/CuadroComparativo.model.js.
  archivoCotizacion: 'archivo_cotizacion',
  archivoGeneradorGastos: 'archivo_generador_gastos',
  archivoEvaluacionInicial: 'archivo_evaluacion_inicial',
  archivoPreBEP: 'archivo_pre_bep',
  archivosAnexos: 'archivos_anexos',
  docTerminosReferencia: 'doc_terminos_referencia',
  docCamaraComercio: 'doc_camara_comercio',
  docEstadosFinancieros: 'doc_estados_financieros',
  docEstadoResultados: 'doc_estado_resultados',
  docSagrilaft: 'doc_sagrilaft',
  docComposicionAccionaria: 'doc_composicion_accionaria',
  docRut: 'doc_rut',
  docCedulaRepresentante: 'doc_cedula_representante',
  docCertificacionBancaria: 'doc_certificacion_bancaria',
  docCotizacion: 'doc_cotizacion',
  archivoFormatoSolicitud: 'archivo_formato_solicitud',
};

function aCamposDb(body) {
  const values = {};
  for (const [campoApi, campoDb] of Object.entries(CAMPO_DB)) {
    if (body[campoApi] !== undefined) values[campoDb] = body[campoApi];
  }
  return values;
}

const SOLICITANTE_ATTRS = ['id', 'nombre', 'cargo', 'email', 'telefono'];
const APROBADOR_ATTRS = ['id', 'nombre', 'cargo', 'email'];
const TERCERO_ATTRS = ['id', 'razon_social', 'nit'];

function _enrichBase(s) {
  const d = s.toJSON();
  return {
    id: d.id,
    consecutivo: d.consecutivo,
    tipo: d.tipo,
    categoria: d.categoria,
    fechaSolicitud: d.fecha_solicitud,
    solicitanteId: d.solicitante_id,
    proyectoId: d.proyecto_id,
    frentesIds: d.frentes_ids ?? [],
    terceroId: d.tercero_id,
    descripcionActividad: d.descripcion_actividad,
    plazoEjecucion: d.plazo_ejecucion,
    formaPago: d.forma_pago,
    valorFinal: d.valor_final,
    tipoContrato: d.tipo_contrato,
    asunto: d.asunto,
    creacionTercero: d.creacion_tercero,
    contratanteNombre: d.contratante_nombre,
    contratanteNit: d.contratante_nit,
    alcance: d.alcance,
    terminosReferencia: d.terminos_referencia,
    condicionesEspeciales: d.condiciones_especiales,
    valorEnLetras: d.valor_en_letras,
    archivoCuadroComparativo: d.archivo_cuadro_comparativo,
    archivoCotizacion: d.archivo_cotizacion,
    archivoFormatoSolicitud: d.archivo_formato_solicitud,
    archivoPreBEP: d.archivo_pre_bep,
    archivoGeneradorGastos: d.archivo_generador_gastos,
    archivoEvaluacionInicial: d.archivo_evaluacion_inicial,
    archivosAnexos: d.archivos_anexos ?? [],
    aprobadorId: d.aprobador_id,
    fechaAprobacionDirector: d.fecha_aprobacion_director,
    fechaAprobacionControlesProyeccion: d.fecha_aprobacion_controles_proyeccion,
    fechaAprobacionResidenteAdministrativo: d.fecha_aprobacion_residente_administrativo,
    fechaAprobacionGerenteCompras: d.fecha_aprobacion_gerente_compras,
    responsableContratosTramiteId: d.responsable_contratos_tramite_id,
    responsableContratosMinutaId: d.responsable_contratos_minuta_id,
    coordinadorControlesId: d.coordinador_controles_id,
    directorControlesId: d.director_controles_id,
    responsableControlesProyeccionId: d.responsable_controles_proyeccion_id,
    responsableResidenteAdministrativoId: d.responsable_residente_administrativo_id,
    responsableControlesAprobacionFinalId: d.responsable_controles_aprobacion_final_id,
    responsableDirectorObraId: d.responsable_director_obra_id,
    responsableGerenteComprasId: d.responsable_gerente_compras_id,
    responsableRevisorComprasId: d.responsable_revisor_compras_id,
    conceptoCompras: d.concepto_compras,
    notaConceptoCompras: d.nota_concepto_compras,
    fechaConceptoCompras: d.fecha_concepto_compras,
    conceptoComprasPor: d.concepto_compras_por,
    notaContratacion: d.nota_contratacion,
    necesitaRevision: d.necesita_revision,
    numeroContratoAdpro: d.numero_contrato_adpro,
    importadoHistorico: d.importado_historico,
    numeroOtrosi: d.numero_otrosi,
    estado: d.estado,
    solicitudPadreId: d.solicitud_padre_id,
    creadoEn: d.creado_en,
    actualizadoEn: d.actualizado_en,
    solicitante: d.solicitante ? { id: d.solicitante.id, nombre: d.solicitante.nombre, cargo: d.solicitante.cargo, email: d.solicitante.email, telefono: d.solicitante.telefono } : undefined,
    aprobador: d.aprobador ? { id: d.aprobador.id, nombre: d.aprobador.nombre, cargo: d.aprobador.cargo } : undefined,
    tercero: d.tercero ? { id: d.tercero.id, razonSocial: d.tercero.razon_social, nit: d.tercero.nit } : undefined,
  };
}

// `categoria` (2026-11-20): las personas de cada frente son independientes entre Directa e Indirecta; sin categoria, todas.
async function usuarioTieneAlgunFrente(usuarioId, categoria) {
  const asignaciones = await FrenteUsuario.findAll({ where: { usuario_id: usuarioId, ...(categoria ? { categoria } : {}) }, attributes: ['frente_id'] });
  return asignaciones.map((a) => a.frente_id);
}

// GET /solicitudes -- mismo criterio documentado en CLAUDE.md: alcance
// 'TODAS' ve todo; 'FRENTE' ve lo que creó, es responsable de, o pertenece
// a uno de sus frentes asignados; 'PROPIAS' ve solo lo que creó (ver
// utils/permisos.js#resolverAlcanceSolicitudes, "alcance de solicitudes en
// 3 niveles").
//
// Corregido respecto al original: el POST /api/solicitudes de la app Next.js
// restringía la query SQL a un `where.OR` de "soy responsable de esto"
// ANTES del filtro en memoria por frente -- eso hacía que el chequeo de
// pertenencia a frente en memoria nunca pudiera aportar nada (ya estaba
// filtrado fuera a nivel SQL), contradiciendo la regla documentada. Acá se
// trae el conjunto candidato sin esa restricción y el filtro en memoria
// aplica las dos condiciones de verdad (responsable OR frente).
async function list(filtros, usuario) {
  const { estado, tipo, categoria, frenteId, proyectoId, solicitanteId, terceroId, fechaDesde, fechaHasta, solicitudPadreId } = filtros;
  const userRoles = usuario.roles ?? [];
  const userId = usuario.id;

  const where = {};
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;
  if (categoria) where.categoria = categoria;
  if (solicitanteId) where.solicitante_id = solicitanteId;
  if (terceroId) where.tercero_id = Number(terceroId);
  if (proyectoId) where.proyecto_id = Number(proyectoId);
  if (solicitudPadreId) where.solicitud_padre_id = Number(solicitudPadreId);
  else where.solicitud_padre_id = null; // excluye otrosís hijos del listado principal

  if (fechaDesde || fechaHasta) {
    where.fecha_solicitud = {};
    if (fechaDesde) where.fecha_solicitud[Op.gte] = new Date(fechaDesde);
    if (fechaHasta) where.fecha_solicitud[Op.lte] = new Date(fechaHasta);
  }

  const alcancePorRol = await getRolesAlcanceSolicitudes();
  const alcance = resolverAlcanceSolicitudes(userRoles, alcancePorRol);

  let solicitudes = await Solicitud.findAll({
    where,
    include: [
      { model: Usuario, as: 'solicitante', attributes: SOLICITANTE_ATTRS },
      { model: Tercero, as: 'tercero', attributes: TERCERO_ATTRS },
      { model: Usuario, as: 'aprobador', attributes: APROBADOR_ATTRS },
      { model: Solicitud, as: 'otrosis', attributes: ['id'] },
    ],
    order: [['creado_en', 'DESC']],
  });

  if (alcance === 'PROPIAS') {
    solicitudes = solicitudes.filter((s) => s.solicitante_id === Number(userId));
  } else if (alcance === 'FRENTE') {
    const frentesPorCategoria = { DIRECTA: await usuarioTieneAlgunFrente(userId, 'DIRECTA'), INDIRECTA: await usuarioTieneAlgunFrente(userId, 'INDIRECTA') };
    solicitudes = solicitudes.filter((s) => {
      if (
        s.solicitante_id === Number(userId) ||
        s.aprobador_id === Number(userId) ||
        s.responsable_contratos_tramite_id === Number(userId) ||
        s.responsable_contratos_minuta_id === Number(userId) ||
        s.coordinador_controles_id === Number(userId) ||
        s.director_controles_id === Number(userId)
      ) {
        return true;
      }
      return (s.frentes_ids ?? []).some((id) => (frentesPorCategoria[s.categoria] ?? []).includes(id));
    });
  }
  // alcance === 'TODAS' -- sin filtro adicional.

  if (frenteId) {
    const fId = Number(frenteId);
    solicitudes = solicitudes.filter((s) => (s.frentes_ids ?? []).includes(fId));
  }

  const parentIds = solicitudes.map((s) => s.id);
  const activeOtrosis = await Solicitud.findAll({
    where: { solicitud_padre_id: { [Op.in]: parentIds }, estado: { [Op.ne]: 'COMPLETADA' } },
    attributes: ['solicitud_padre_id', 'consecutivo'],
  });

  // Seguimiento de la bandeja (rediseno 2026-10-09): en poder de quien esta cada solicitud, hace cuantos dias
  // se movio por ultima vez y si ESTE usuario puede actuar ahora. Todo en lote (una query de historial y una de
  // nombres) para no multiplicar consultas por fila.
  const ultimoMovimiento = new Map();
  if (parentIds.length > 0) {
    const movimientos = await HistorialSolicitud.findAll({
      where: { solicitud_id: { [Op.in]: parentIds } },
      attributes: ['solicitud_id', [sequelize.fn('MAX', sequelize.col('fecha')), 'ultima']],
      group: ['solicitud_id'],
      raw: true,
    });
    for (const m of movimientos) ultimoMovimiento.set(m.solicitud_id, m.ultima);
  }
  const idsResponsables = new Set();
  const enPoder = new Map();
  for (const s of solicitudes) {
    const accion = ACCION_PRINCIPAL_POR_ESTADO[s.estado];
    if (!accion) continue;
    const slot = resolverSlot(accion, s.estado, s.categoria);
    const campo = slot ? SNAPSHOT_POR_SLOT[slot] : null;
    const usuarioId = campo ? s[campo] : null;
    enPoder.set(s.id, usuarioId ?? null);
    if (usuarioId) idsResponsables.add(usuarioId);
  }
  const nombres = new Map();
  if (idsResponsables.size > 0) {
    const usuariosResp = await Usuario.findAll({ where: { id: { [Op.in]: [...idsResponsables] } }, attributes: ['id', 'nombre'] });
    for (const u of usuariosResp) nombres.set(u.id, u.nombre);
  }
  const ahora = Date.now();
  const funcionalidadesPorRol = await getRolesFuncionalidades();

  const resultado = [];
  for (const s of solicitudes) {
    const enriched = _enrichBase(s);
    const activo = activeOtrosis.find((ao) => ao.solicitud_padre_id === s.id);
    enriched.activeOtrosi = activo ? { consecutivo: activo.consecutivo } : null;
    enriched.tieneOtrosis = (s.otrosis ?? []).length > 0;
    const accion = ACCION_PRINCIPAL_POR_ESTADO[s.estado];
    if (accion) {
      const desde = ultimoMovimiento.get(s.id) ?? s.actualizado_en ?? s.creado_en;
      enriched.diasEnPaso = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 86400000));
      const usuarioId = enPoder.get(s.id);
      enriched.enPoderDe = usuarioId ? { id: usuarioId, nombre: nombres.get(usuarioId) ?? null } : null;
      enriched.requiereMiAccion = await puedeEjecutarAccion(s, usuario, accion, funcionalidadesPorRol);
    } else {
      enriched.diasEnPaso = null;
      enriched.enPoderDe = null;
      enriched.requiereMiAccion = false;
    }
    resultado.push(enriched);
  }
  return resultado;
}

// Cronograma con fases (ordenadas) + sus actividades, y las actividades
// sueltas (fase_id null) -- misma forma anidada en todos lados que lo
// consumen: la solicitud principal, cada uno de sus otrosis (para que
// OtrosiForm pueda leer el cronograma vigente al elegir un padre).
function cronogramaInclude() {
  return {
    model: CronogramaContrato,
    as: 'cronograma',
    include: [
      { model: FaseCronograma, as: 'fases', separate: true, order: [['numero_fase', 'ASC']], include: [{ model: ActividadCronograma, as: 'actividades', separate: true, order: [['id', 'ASC']] }] },
      { model: ActividadCronograma, as: 'actividades', separate: true, where: { fase_id: null }, required: false, order: [['fecha_inicio', 'ASC']] },
    ],
  };
}

function _enrichCronograma(c) {
  if (!c) return null;
  return {
    id: c.id,
    tieneFases: c.tiene_fases,
    fechaInicio: c.fecha_inicio,
    fechaFin: c.fecha_fin,
    fases: (c.fases ?? []).map((f) => ({
      id: f.id,
      numeroFase: f.numero_fase,
      nombreFase: f.nombre_fase,
      fechaInicio: f.fecha_inicio,
      fechaFin: f.fecha_fin,
      actividades: (f.actividades ?? []).map((a) => ({ id: a.id, descripcion: a.descripcion, fechaInicio: a.fecha_inicio, fechaFin: a.fecha_fin, responsable: a.responsable })),
    })),
    actividades: (c.actividades ?? []).map((a) => ({ id: a.id, descripcion: a.descripcion, fechaInicio: a.fecha_inicio, fechaFin: a.fecha_fin, responsable: a.responsable })),
  };
}

// Mismo patrón que cronogramaInclude()/_enrichCronograma() -- a diferencia
// del cronograma, acá NO se calcula ningún total (valorTotal por ítem,
// subtotal/AIU/IVA/costo total por proveedor): eso lo hace el frontend en
// cada render (mismo criterio que valorEnLetras), este service solo aplana
// los datos crudos a camelCase. `precios` (JSONB `{idProveedor: valor}`) se
// devuelve tal cual -- las keys quedan como string (así las serializa
// Postgres/JS), el frontend las castea a number donde haga falta.
function cuadroComparativoInclude() {
  return {
    model: CuadroComparativo,
    as: 'cuadroComparativo',
    include: [
      { model: CuadroComparativoProveedor, as: 'proveedores', separate: true, order: [['orden', 'ASC']] },
      { model: CuadroComparativoItem, as: 'items', separate: true, order: [['orden', 'ASC']] },
    ],
  };
}

function _enrichCuadroComparativo(c) {
  if (!c) return null;
  return {
    id: c.id,
    proveedores: (c.proveedores ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      seleccionado: p.seleccionado,
      administracionPct: p.administracion_pct,
      imprevistoPct: p.imprevisto_pct,
      utilidadPct: p.utilidad_pct,
      ivaUtilidadPct: p.iva_utilidad_pct,
    })),
    items: (c.items ?? []).map((it) => ({
      id: it.id,
      codigoItem: it.codigo_item,
      codigoInsumo: it.codigo_insumo,
      actividad: it.actividad,
      alcance: it.alcance,
      unidad: it.unidad,
      cantidad: it.cantidad,
      cantidadReal: it.cantidad_real,
      valorUnitarioPendiente: it.valor_unitario_pendiente,
      observaciones: it.observaciones,
      precios: it.precios ?? {},
    })),
  };
}

// Mismo patrón que cuadroComparativoInclude()/_enrichCuadroComparativo() --
// `valores` (JSONB `{idColumna: valor}`) se devuelve tal cual, sin calcular
// nada (ni el valor de las columnas CALCULADA ni los totales del pie) --
// eso lo hace el frontend en cada render
// (MemoriaBuilder.jsx#calcularValorCalculada/calcularTotalColumna).
function memoriaInclude() {
  return {
    model: Memoria,
    as: 'memoria',
    include: [
      { model: MemoriaColumna, as: 'columnas', separate: true, order: [['orden', 'ASC']] },
      { model: MemoriaFila, as: 'filas', separate: true, order: [['orden', 'ASC']] },
    ],
  };
}

function _enrichMemoria(m) {
  if (!m) return null;
  return {
    id: m.id,
    titulo: m.titulo,
    // Se vuelve a limpiar al salir: el frontend inserta este HTML tal cual en la página.
    contenidoHtml: m.contenido_html ? sanitizarTablaHtml(m.contenido_html) : null,
    imagenes: m.imagenes ?? [],
    columnas: (m.columnas ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      formulaColumnaAId: c.formula_columna_a_id,
      formulaOperador: c.formula_operador,
      formulaColumnaBId: c.formula_columna_b_id,
      mostrarTotal: c.mostrar_total,
    })),
    filas: (m.filas ?? []).map((f) => ({ id: f.id, valores: f.valores ?? {} })),
  };
}

async function getById(id, usuario) {
  const solicitud = await Solicitud.findByPk(id, {
    include: [
      { model: Usuario, as: 'solicitante', attributes: SOLICITANTE_ATTRS },
      { model: Tercero, as: 'tercero' },
      { model: Usuario, as: 'aprobador', attributes: APROBADOR_ATTRS },
      { model: HistorialSolicitud, as: 'historial', include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }] },
      { model: Solicitud, as: 'solicitudPadre', attributes: ['id', 'consecutivo', 'tipo'] },
      { model: Solicitud, as: 'otrosis', attributes: ['id', 'consecutivo', 'tipo', 'estado', 'creado_en', 'valor_final', 'numero_otrosi'], include: [cronogramaInclude()] },
      cronogramaInclude(),
      cuadroComparativoInclude(),
      memoriaInclude(),
    ],
  });
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  const userId = usuario.id;
  // Reemplaza el viejo chequeo `revisar_contratos_${sufijo}` -- ver el
  // comentario de puedeGestionarSolicitud en solicitud.autorizacion.js.
  const puedeVerTodo = await puedeGestionarSolicitud(solicitud, usuario);

  if (!puedeVerTodo && solicitud.solicitante_id !== Number(userId)) {
    const userFrenteIds = await usuarioTieneAlgunFrente(userId, solicitud.categoria);
    const tieneAcceso = (solicitud.frentes_ids ?? []).some((fId) => userFrenteIds.includes(fId));
    if (!tieneAcceso) throw new ApiError(403, 'Sin acceso a esta solicitud');
  }

  const enriched = _enrichBase(solicitud);
  const d = solicitud.toJSON();
  enriched.tercero = d.tercero
    ? {
        id: d.tercero.id,
        razonSocial: d.tercero.razon_social,
        nit: d.tercero.nit,
        representanteLegal: d.tercero.representante_legal,
        cedulaRepresentante: d.tercero.cedula_representante,
        correoFirma: d.tercero.correo_firma,
        direccionRepresentante: d.tercero.direccion_representante,
        telefonoRepresentante: d.tercero.telefono_representante,
      }
    : null;
  enriched.historial = (d.historial ?? [])
    .map((h) => ({ id: h.id, accion: h.accion, nota: h.nota, fecha: h.fecha, estadoResultante: h.estado_resultante, usuario: h.usuario ? { id: h.usuario.id, nombre: h.usuario.nombre } : null }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  enriched.solicitudPadre = d.solicitudPadre ? { id: d.solicitudPadre.id, consecutivo: d.solicitudPadre.consecutivo, tipo: d.solicitudPadre.tipo } : null;
  enriched.otrosis = (d.otrosis ?? []).map((o) => ({
    id: o.id,
    consecutivo: o.consecutivo,
    tipo: o.tipo,
    estado: o.estado,
    creadoEn: o.creado_en,
    valorFinal: o.valor_final,
    numeroOtrosi: o.numero_otrosi,
    cronograma: _enrichCronograma(o.cronograma),
  }));
  enriched.cronograma = _enrichCronograma(d.cronograma);
  enriched.cuadroComparativo = _enrichCuadroComparativo(d.cuadroComparativo);
  enriched.memoria = _enrichMemoria(d.memoria);
  enriched.tieneOtrosis = enriched.otrosis.length > 0;

  // Nombre de proyecto/frentes + etapas -- el original los resolvía con dos
  // queries extra en la propia página de detalle (Server Component); acá se
  // resuelven de una vez en el service para que el detalle no tenga que
  // hacer llamadas aparte a /proyectos y /frentes.
  const [proyecto, frentesRows] = await Promise.all([
    Proyecto.findByPk(d.proyecto_id, { attributes: ['nombre'] }),
    (d.frentes_ids ?? []).length > 0 ? Frente.findAll({ where: { id: d.frentes_ids }, attributes: ['id', 'nombre', 'etapa'] }) : Promise.resolve([]),
  ]);
  enriched.proyectoNombre = proyecto?.nombre ?? null;
  enriched.frentesNombres = frentesRows.map((f) => f.nombre);
  enriched.etapasUnicas = [...new Set(frentesRows.map((f) => f.etapa).filter((e) => e != null))].sort((a, b) => a - b);

  // Qué acciones puede ejecutar ESTE usuario AHORA sobre esta solicitud --
  // el frontend (SolicitudActions.jsx) lee esto en vez de recalcular reglas
  // de autorización por su cuenta (ver solicitud.autorizacion.js).
  const funcionalidadesPorRol = await getRolesFuncionalidades();
  enriched.accionesDisponibles = await getAccionesDisponibles(solicitud, usuario, funcionalidadesPorRol);

  // Flag booleano para el frontend (doble paso del Residente Administrativo
  // en Directa, 2026-09-21): puede editar la solicitud COMPLETA en este
  // momento (estado editable o el usuario la gestiona/admin, salvo estados
  // restringidos a su dueño). Misma fuente de verdad que usa update(), ver
  // solicitud.autorizacion.js#puedeEditarSolicitud.
  enriched.puedeEditar = await puedeEditarSolicitud(solicitud, usuario);

  // Seguimiento (rediseno 2026-10-09): en poder de quien esta ahora y hace cuantos dias se movio -- misma logica
  // que la bandeja (list()), para que el detalle diga "que sigue y quien lo hace" sin que el usuario lo deduzca.
  const accionPrincipal = ACCION_PRINCIPAL_POR_ESTADO[solicitud.estado];
  if (accionPrincipal) {
    const slot = resolverSlot(accionPrincipal, solicitud.estado, solicitud.categoria);
    const campo = slot ? SNAPSHOT_POR_SLOT[slot] : null;
    const responsableId = campo ? solicitud[campo] : null;
    const responsable = responsableId ? await Usuario.findByPk(responsableId, { attributes: ['id', 'nombre'] }) : null;
    const ultimo = enriched.historial[0]?.fecha ?? solicitud.actualizado_en ?? solicitud.creado_en;
    enriched.enPoderDe = responsable ? { id: responsable.id, nombre: responsable.nombre } : null;
    enriched.diasEnPaso = Math.max(0, Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000));
    enriched.requiereMiAccion = enriched.accionesDisponibles.includes(accionPrincipal);
  } else {
    enriched.enPoderDe = null;
    enriched.diasEnPaso = null;
    enriched.requiereMiAccion = false;
  }

  return enriched;
}

// ── Creación: rama otrosí ────────────────────────────────────────────────────

async function crearOtrosi(body, usuario) {
  const { tipo, categoria, solicitudPadreId, valorFinal, valorEnLetras } = body;
  if (!['OTROSI_TIEMPO', 'OTROSI_TIEMPO_CANTIDAD'].includes(tipo)) throw new ApiError(400, 'Tipo inválido para otrosí');

  const parent = await Solicitud.findByPk(solicitudPadreId, {
    include: [
      { model: CronogramaContrato, as: 'cronograma', attributes: ['fecha_fin'] },
      {
        model: Solicitud,
        as: 'otrosis',
        attributes: ['id', 'estado', 'consecutivo', 'numero_otrosi', 'creado_en'],
        include: [{ model: CronogramaContrato, as: 'cronograma', attributes: ['fecha_fin'] }],
      },
    ],
  });
  if (!parent) throw new ApiError(404, 'Solicitud padre no encontrada');
  if (parent.estado !== 'COMPLETADA') throw new ApiError(400, 'Solo se pueden crear otrosís de solicitudes en estado COMPLETADA');
  // Un otrosí SIEMPRE hereda la categoría del padre -- el cliente la manda
  // solo para que el controller resuelva el slug de permiso antes de llegar
  // acá (ver solicitud.controller.js#create); si no coincide con la real del
  // padre, es una inconsistencia real, no un valor que se pueda ignorar.
  if (categoria && categoria !== parent.categoria) {
    throw new ApiError(400, 'La categoría no coincide con la del contrato padre');
  }

  // ANULADA cuenta como "ya no está activo" -- un otrosí anulado (ver
  // solicitud.autorizacion.js#ANULAR) es un caso muerto, igual que uno
  // completado, y no debe bloquear crear uno nuevo sobre el mismo contrato.
  const activo = (parent.otrosis ?? []).find((o) => !['COMPLETADA', 'ANULADA'].includes(o.estado));
  if (activo) throw new ApiError(400, `Ya existe un otrosí activo para este contrato (${activo.consecutivo}). Debe completarse antes de crear uno nuevo.`);

  // Fecha efectiva de fin: la del otrosí COMPLETADO vigente (mayor
  // numeroOtrosi), o el cronograma del padre si todavía no hay otrosís. Un
  // otrosí ANULADA nunca puede ser la línea base -- antes de que existiera
  // ANULADA, todo lo que llegaba hasta acá ya era COMPLETADA (el candado de
  // arriba lo garantizaba); ahora hay que filtrar explícito.
  const baselineOtrosi = pickMostRecentOtrosi((parent.otrosis ?? []).filter((o) => o.estado === 'COMPLETADA'));
  const fechaFinEfectiva = baselineOtrosi?.cronograma?.fecha_fin ?? parent.cronograma?.fecha_fin;
  if (fechaFinEfectiva) {
    // Mismo criterio que el original: comparar como fecha de calendario en
    // America/Bogota, no como instante UTC (evita que un servidor en otra
    // zona horaria corra el día de vencimiento).
    const hoyBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    hoyBogota.setHours(0, 0, 0, 0);
    const fechaFinBogota = new Date(new Date(fechaFinEfectiva).toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    fechaFinBogota.setHours(0, 0, 0, 0);
    if (hoyBogota >= fechaFinBogota) {
      const fechaStr = fechaFinBogota.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
      throw new ApiError(400, `No se puede crear el otrosí. El contrato venció el ${fechaStr}.`);
    }
  }

  const frentesIds = parent.frentes_ids ?? [];
  const numeroOtrosi = nextNumeroOtrosi((parent.otrosis ?? []).map((o) => o.numero_otrosi));

  const finalValorFinal = tipo === 'OTROSI_TIEMPO_CANTIDAD' && valorFinal != null ? valorFinal : parent.valor_final;
  const finalValorEnLetras = tipo === 'OTROSI_TIEMPO_CANTIDAD' && valorFinal != null ? (valorEnLetras ?? null) : parent.valor_en_letras;

  const creada = await sequelize.transaction(async (transaction) => {
    const consecutivo = await generarConsecutivo(tipo, parent.categoria, parent.proyecto_id, frentesIds[0], transaction);

    const nueva = await Solicitud.create(
      {
        consecutivo,
        tipo,
        categoria: parent.categoria,
        solicitud_padre_id: parent.id,
        numero_otrosi: numeroOtrosi,
        proyecto_id: parent.proyecto_id,
        frentes_ids: frentesIds,
        solicitante_id: usuario.id,
        aprobador_id: parent.aprobador_id,
        responsable_contratos_tramite_id: parent.responsable_contratos_tramite_id,
        responsable_contratos_minuta_id: parent.responsable_contratos_minuta_id,
        coordinador_controles_id: parent.coordinador_controles_id,
        director_controles_id: parent.director_controles_id,
        estado: 'ENVIADA',
        tercero_id: parent.tercero_id,
        descripcion_actividad: parent.descripcion_actividad,
        plazo_ejecucion: parent.plazo_ejecucion,
        forma_pago: parent.forma_pago,
        valor_final: finalValorFinal,
        valor_en_letras: finalValorEnLetras,
        tipo_contrato: parent.tipo_contrato,
        asunto: parent.asunto,
        contratante_nombre: parent.contratante_nombre,
        contratante_nit: parent.contratante_nit,
      },
      { transaction }
    );

    await HistorialSolicitud.create({ solicitud_id: nueva.id, usuario_id: usuario.id, accion: 'ENVIAR', nota: null, estado_resultante: 'ENVIADA' }, { transaction });

    return nueva;
  });

  return getById(creada.id, usuario);
}

// ── Creación: rama normal (BORRADOR) ────────────────────────────────────────

// Resuelve los responsables copiados desde AprobadorFrente al crear una
// solicitud sobre un frente -- extraído de crearNormal para reusarse tal
// cual en la importación de históricos (Fase 8), que necesita exactamente
// la misma resolución para que los otrosís reales creados después sobre un
// contrato importado queden asignados y notifiquen a alguien.
async function resolverResponsablesFrente(firstFrenteId, categoria, usuario) {
  const config = await AprobadorFrente.findOne({ where: { frente_id: firstFrenteId, categoria } });

  // director_proyecto ya no es un array plano de IDs -- es
  // { usuarios: [ids], roles: [nombresDeRol] } (ver solicitud.autorizacion.js).
  // El fallback de "¿qué rol califica?" ya no está hardcodeado a
  // 'DIRECTOR_PROYECTO': usa los roles configurados en el propio slot, y
  // solo cae a 'DIRECTOR_PROYECTO' si el admin no configuró ninguno todavía
  // (para no cambiar el comportamiento de un frente recién creado).
  //
  // Solo aplica a INDIRECTA -- Directa ya no usa este slot para aprobar
  // (usa director_obra, ver más abajo, un rol/slot DISTINTO confirmado con
  // el usuario). Sin este chequeo, una Directa podría terminar con
  // `aprobador_id` apuntando a alguien random con rol DIRECTOR_PROYECTO
  // asignado al frente (por el fallback de abajo), mostrándose como
  // "Director aprobador" en el detalle aunque no tenga nada que ver con el
  // flujo real de esa solicitud.
  let aprobadorId = null;
  if (categoria === 'INDIRECTA') {
    const slotDirectorProyecto = config?.director_proyecto ?? { usuarios: [], roles: [] };
    aprobadorId = slotDirectorProyecto.usuarios?.[0] ?? null;
    if (!aprobadorId) {
      // Fallback a DIRECTOR_PROYECTO resuelto por código (2026-09-18) --
      // el nombre real de este rol puede haber cambiado si un admin lo
      // renombró; nunca hardcodear el string original acá.
      const rolesCalifican = slotDirectorProyecto.roles?.length > 0 ? slotDirectorProyecto.roles : [(await getRolesPorCodigo()).DIRECTOR_PROYECTO];
      const userRoles = usuario.roles ?? [];
      if (rolesCalifican.some((r) => userRoles.includes(r))) {
        aprobadorId = usuario.id;
      } else {
        const asignados = await FrenteUsuario.findAll({ where: { frente_id: firstFrenteId, categoria: 'INDIRECTA' }, include: [{ model: Usuario, attributes: ['id', 'roles', 'activo'] }] });
        const aprobadorUser = asignados.find((fu) => (fu.Usuario?.roles ?? []).some((r) => rolesCalifican.includes(r)) && fu.Usuario?.activo);
        aprobadorId = aprobadorUser?.Usuario?.id ?? null;
      }
    }
  }

  return {
    aprobador_id: aprobadorId,
    responsable_contratos_tramite_id: config?.contratos_tramite?.usuarios?.[0] ?? null,
    responsable_contratos_minuta_id: config?.contratos_minuta?.usuarios?.[0] ?? null,
    coordinador_controles_id: config?.controles_adpro?.usuarios?.[0] ?? null,
    director_controles_id: config?.director_controles?.usuarios?.[0] ?? null,
    // Flujo propio de Directa (Orden de Servicio), 2026-09-18 -- mismo
    // criterio simple que los de arriba, sin la lógica de fallback por rol
    // que sí tiene director_proyecto (evita hardcodear el nombre humano de
    // un rol creado por el negocio, ej. "Director de Obra", como disparador
    // de un fallback -- si lo renombran después, ese fallback dejaría de
    // funcionar en silencio).
    responsable_controles_proyeccion_id: config?.controles_proyeccion?.usuarios?.[0] ?? null,
    responsable_residente_administrativo_id: config?.residente_administrativo?.usuarios?.[0] ?? null,
    responsable_controles_aprobacion_final_id: config?.controles_aprobacion_final?.usuarios?.[0] ?? null,
    responsable_director_obra_id: config?.director_obra?.usuarios?.[0] ?? null,
    responsable_gerente_compras_id: config?.gerente_compras?.usuarios?.[0] ?? null,
    responsable_revisor_compras_id: config?.revisor_compras?.usuarios?.[0] ?? null,
  };
}

async function crearNormal(body, usuario) {
  const { tipo, categoria, proyectoId, frentesIds } = body;
  if (!tipo || !categoria || !proyectoId || !frentesIds || frentesIds.length === 0) {
    throw new ApiError(400, 'tipo, categoria, proyectoId y frentesIds son obligatorios');
  }
  // Pedido explícito del usuario (2026-09-17): en Directa ya no se crean
  // solicitudes de tipo Contrato, solo Orden de Servicio (con el mismo
  // formato de Contrato, ver la sección de esa fecha en CLAUDE.md) -- cierra
  // el hueco de un POST a mano saltándose el picker del frontend, que ya no
  // ofrece esta combinación. No aplica a otrosís (crearOtrosi, tipo distinto)
  // ni a las solicitudes DIRECTA+CONTRATO reales que ya existían antes de
  // esta regla, que se dejan tal cual.
  if (categoria === 'DIRECTA' && tipo === 'CONTRATO') {
    throw new ApiError(400, 'En Directa no se crean solicitudes de tipo Contrato, usa Orden de Servicio');
  }

  const firstFrenteId = frentesIds[0];
  const responsables = await resolverResponsablesFrente(firstFrenteId, categoria, usuario);

  const creada = await sequelize.transaction(async (transaction) => {
    const consecutivo = await generarConsecutivo(tipo, categoria, Number(proyectoId), Number(firstFrenteId), transaction);

    return Solicitud.create(
      {
        consecutivo,
        tipo,
        categoria,
        proyecto_id: proyectoId,
        frentes_ids: frentesIds,
        solicitante_id: usuario.id,
        ...responsables,
        estado: 'BORRADOR',
        // No viaja por aCamposDb/CAMPO_DB a propósito -- es un flag de
        // creación, nunca patcheable después vía PATCH /solicitudes/:id
        // (mismo criterio que tipo/categoria).
        importado_historico: body.importadoHistorico === true,
        ...aCamposDb(body),
      },
      { transaction }
    );
  });

  return getById(creada.id, usuario);
}

async function create(body, usuario) {
  const creada = body.solicitudPadreId ? await crearOtrosi(body, usuario) : await crearNormal(body, usuario);
  // Los archivos subidos antes de crear estan en _Pendientes de Drive: ahora que hay consecutivo se ordenan.
  await organizarArchivos(creada.id);
  return creada;
}

// "El histórico también se pueda guardar borrador... que se pueda volver a
// la edición" (2026-09-25) -- reemplaza al viejo "crea directo en
// COMPLETADA" de solicitud.importarHistorico.js para Contrato/Orden de
// Servicio: ahora nacen BORRADOR (importado_historico=true, vía crearNormal
// arriba), se editan con el mismo PATCH de siempre (ya lo permite
// puedeEditarSolicitud para BORRADOR+dueño, sin cambios ahí), y esta función
// es el único paso NUEVO -- el equivalente a "Enviar" pero sin pasar por la
// máquina de estados real (nunca hay aprobaciones que ejecutar en un
// registro que ya ocurrió). Solo aplica a BORRADOR -- un histórico nunca
// pasa por DEVUELTA/EN_REVISION (no hay a quién le llegue una devolución).
async function completarHistorico(id, usuario) {
  const solicitud = await Solicitud.findByPk(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');
  if (!solicitud.importado_historico) throw new ApiError(400, 'Esta solicitud no es un registro histórico');
  if (solicitud.estado !== 'BORRADOR') throw new ApiError(400, 'Solo se puede completar un registro histórico en borrador');
  if (!(await puedeEditarSolicitud(solicitud, usuario))) throw new ApiError(403, 'No tienes permiso para completar este registro');

  await sequelize.transaction(async (transaction) => {
    await solicitud.update({ estado: 'COMPLETADA' }, { transaction });
    await HistorialSolicitud.create(
      { solicitud_id: solicitud.id, usuario_id: usuario.id, accion: 'IMPORTAR_HISTORICO', nota: `Registro histórico completado por ${usuario.nombre ?? 'un usuario'}.`, estado_resultante: 'COMPLETADA' },
      { transaction }
    );
  });

  return getById(id, usuario);
}

async function update(id, body, usuario) {
  const solicitud = await Solicitud.findByPk(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  // Refactor 2026-09-21 (doble paso del Residente Administrativo en Directa):
  // la lógica booleana de edición se movió a solicitud.autorizacion.js
  // #puedeEditarSolicitud y queda como única fuente de verdad (getById también
  // la expone como enriched.puedeEditar). Mismo comportamiento, parece: el 409
  // y el 403 originales se conservan literal.
  if (!(await puedeEditarSolicitud(solicitud, usuario))) {
    if (['BORRADOR', 'DEVUELTA'].includes(solicitud.estado) && solicitud.solicitante_id !== Number(usuario.id) && !usuario.esAdmin) {
      throw new ApiError(403, 'Solo el solicitante puede editar esta solicitud');
    }
    throw new ApiError(409, 'Solo se pueden editar solicitudes en estado BORRADOR, DEVUELTA o EN_REVISION');
  }

  await solicitud.update(aCamposDb(body));
  await organizarArchivos(solicitud.id);
  return getById(id, usuario);
}

async function remove(id) {
  const solicitud = await Solicitud.findByPk(id, { include: [{ model: Solicitud, as: 'otrosis', attributes: ['id'] }] });
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  const otrosiIds = (solicitud.otrosis ?? []).map((o) => o.id);
  const allIds = [...otrosiIds, solicitud.id];

  await sequelize.transaction(async (transaction) => {
    await HistorialSolicitud.destroy({ where: { solicitud_id: { [Op.in]: allIds } }, transaction });
    // Bug real encontrado verificando ANULAR (2026-09-09, no relacionado con
    // esa acción en sí): a diferencia de HistorialSolicitud, las FK de
    // CronogramaContrato/CuadroComparativo/Memoria hacia `solicitudes` NO
    // tienen `onDelete: CASCADE` a nivel de base de datos (sus propios hijos
    // sí cascadean bien -- fases/actividades, proveedores/items, columnas/
    // filas -- el hueco es solo este primer nivel). "Eliminar solicitud"
    // (el botón ADMIN-only) tiraba un 500 crudo de Postgres
    // (SequelizeForeignKeyConstraintError) para cualquier CONTRATO/ORDEN_SERVICIO
    // que ya tuviera alguno de los tres guardado -- que hoy es prácticamente
    // cualquiera que haya llegado a ENVIADA, desde que el cuadro comparativo
    // se volvió obligatorio para enviar. Se corrige igual que ya se hacía
    // para HistorialSolicitud: destruirlos a mano antes de borrar la
    // Solicitud, con el mismo `allIds` (cubre también los otrosís, aunque
    // hoy nunca tengan Cuadro Comparativo/Memoria propios -- un `destroy`
    // sin coincidencias es un no-op inofensivo).
    await CronogramaContrato.destroy({ where: { solicitud_id: { [Op.in]: allIds } }, transaction });
    await CuadroComparativo.destroy({ where: { solicitud_id: { [Op.in]: allIds } }, transaction });
    await Memoria.destroy({ where: { solicitud_id: { [Op.in]: allIds } }, transaction });
    if (otrosiIds.length > 0) await Solicitud.destroy({ where: { id: { [Op.in]: otrosiIds } }, transaction });
    await solicitud.destroy({ transaction });
  });
}

module.exports = { list, getById, create, update, remove, CAMPO_DB, aCamposDb, usuarioTieneAlgunFrente, resolverResponsablesFrente, completarHistorico };
