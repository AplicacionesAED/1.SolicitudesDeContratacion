// Puerto de (app)/dashboard/page.tsx -- la fuente REAL de los KPIs que veía
// el usuario (Server Component, sin fetch). api/dashboard/stats/route.ts
// existía en el original con una lógica casi idéntica pero NADA en el
// frontend lo llamaba nunca (confirmado por búsqueda en el código fuente) --
// código muerto, no se porta; esta es la única fuente de verdad ahora,
// expuesta como endpoint real porque acá SÍ hace falta (SPA, no SSR).
const { Op } = require('sequelize');
const { getRolesAlcanceSolicitudes, resolverAlcanceSolicitudes } = require('../../utils/permisos');
const Solicitud = require('../solicitud/solicitud.model');
const Frente = require('../frente/frente.model');
const { usuarioTieneAlgunFrente } = require('../solicitud/solicitud.service');
const { puedeEjecutarAccion, ACCION_PRINCIPAL_POR_ESTADO } = require('../solicitud/solicitud.autorizacion');

const ESTADOS_ACTIVOS = ['ENVIADA', 'APROBADA_DIRECTOR', 'EN_PROYECCION_CONTROLES', 'EN_REVISION', 'EN_TRAMITE_CONTRATOS', 'CREACION_MINUTA', 'ENVIO_CONTRATO_POLIZAS', 'EN_CONTROLES', 'APROBACION_FINAL', 'PENDIENTE_GERENTE_COMPRAS'];

const CAMPOS_CANDIDATAS = ['id', 'estado', 'solicitante_id', 'aprobador_id', 'responsable_contratos_tramite_id', 'responsable_contratos_minuta_id', 'coordinador_controles_id', 'director_controles_id', 'frentes_ids', 'actualizado_en'];


// Todas las columnas que puedeEjecutarAccion/SNAPSHOT_POR_SLOT pueden
// necesitar leer, para las 2 categorías y los 10 slots -- ver
// solicitud.autorizacion.js.
const CAMPOS_PENDIENTES = [
  'id',
  'estado',
  'categoria',
  'frentes_ids',
  'aprobador_id',
  'responsable_contratos_tramite_id',
  'responsable_contratos_minuta_id',
  'director_controles_id',
  'coordinador_controles_id',
  'responsable_controles_proyeccion_id',
  'responsable_residente_administrativo_id',
  'responsable_controles_aprobacion_final_id',
  'responsable_director_obra_id',
  'responsable_gerente_compras_id',
];

// Mismo criterio de visibilidad que solicitud.service.js#list ("alcance de
// solicitudes en 3 niveles": PROPIAS/FRENTE/TODAS) -- el original de
// page.tsx solo miraba solicitanteId (calculaba userFrenteIds pero nunca
// los usaba en el where, código muerto real en el Next.js), lo que hacía
// que un DIRECTOR_PROYECTO o alguien con un frente asignado viera "0
// activas" en el Dashboard aunque esas mismas solicitudes SÍ aparecieran en
// /solicitudes (Fase 4 ya corrigió ese mismo tipo de hueco ahí). Se corrige
// acá también para que ambas pantallas cuenten lo mismo.
async function filtrarVisibles(solicitudes, usuario) {
  const alcancePorRol = await getRolesAlcanceSolicitudes();
  const alcance = resolverAlcanceSolicitudes(usuario.roles ?? [], alcancePorRol);
  const userId = Number(usuario.id);

  if (alcance === 'TODAS') return solicitudes;
  if (alcance === 'PROPIAS') return solicitudes.filter((s) => s.solicitante_id === userId);

  const userFrenteIds = await usuarioTieneAlgunFrente(userId);
  return solicitudes.filter(
    (s) =>
      s.solicitante_id === userId ||
      s.aprobador_id === userId ||
      s.responsable_contratos_tramite_id === userId ||
      s.responsable_contratos_minuta_id === userId ||
      s.coordinador_controles_id === userId ||
      s.director_controles_id === userId ||
      (s.frentes_ids ?? []).some((id) => userFrenteIds.includes(id))
  );
}

// 2026-09-18, segunda vuelta: esta función contaba "por rol a secas" (ej.
// CUALQUIER usuario con rol Contratos veía TODAS las EN_TRAMITE_CONTRATOS
// del sistema, sin importar si esa solicitud es de un frente donde
// realmente es responsable) -- imprecisión documentada y aceptada durante
// el refactor de "eliminar permisos de rol para solicitudes" (2026-09-02),
// que dejó la AUTORIZACIÓN real 100% basada en AprobadorFrente pero nunca
// volvió a este KPI para que contara lo mismo. Ahora reusa
// `puedeEjecutarAccion` -- la MISMA función que decide si el botón
// "Aprobar"/"Registrar Adpro"/etc. aparece en el detalle de una solicitud
// puntual -- así este número es exactamente "cuántas solicitudes tienen un
// botón de aprobación para MÍ ahora mismo", sin duplicar ningún criterio
// de autorización a mano. De paso, esto también lo vuelve inmune a
// renombrar roles (puedeEjecutarAccion nunca compara por nombre de rol
// para las acciones de aprobación, solo para ENVIAR/REENVIAR, que no
// entran acá) y ya sabe distinguir Directa/Indirecta (ej. Registrar Adpro
// en Directa lo autoriza Residente Administrativo, en Indirecta Controles)
// sin que este archivo tenga que saberlo.
async function contarPendientesMiAprobacion(usuario) {
  if (usuario.esAdmin) {
    return Solicitud.count({ where: { estado: { [Op.in]: ESTADOS_ACTIVOS } } });
  }

  const estados = Object.keys(ACCION_PRINCIPAL_POR_ESTADO);
  const candidatas = await Solicitud.findAll({ where: { estado: { [Op.in]: estados } }, attributes: CAMPOS_PENDIENTES });

  let total = 0;
  for (const s of candidatas) {
    const accion = ACCION_PRINCIPAL_POR_ESTADO[s.estado];
    if (await puedeEjecutarAccion(s, usuario, accion)) total++;
  }
  return total;
}

async function stats(usuario) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);

  const candidatas = await Solicitud.findAll({ where: { solicitud_padre_id: null }, attributes: CAMPOS_CANDIDATAS });
  const visibles = await filtrarVisibles(candidatas, usuario);

  const totalActivas = visibles.filter((s) => ESTADOS_ACTIVOS.includes(s.estado)).length;
  const enRevision = visibles.filter((s) => s.estado === 'EN_REVISION').length;
  const completadasEsteMes = visibles.filter((s) => s.estado === 'COMPLETADA' && s.actualizado_en >= inicioMes && s.actualizado_en <= finMes).length;
  const pendientesMiAprobacion = await contarPendientesMiAprobacion(usuario);

  return { totalActivas, pendientesMiAprobacion, enRevision, completadasEsteMes };
}

async function recientes(usuario, limit = 10, categoria = null) {
  const candidatas = await Solicitud.findAll({
    where: { solicitud_padre_id: null, ...(categoria ? { categoria } : {}) },
    include: [
      { association: 'solicitante', attributes: ['nombre'] },
      { association: 'tercero', attributes: ['razon_social'] },
    ],
    order: [['fecha_solicitud', 'DESC']],
  });
  // `filtrarVisibles` ya devuelve todo sin filtrar cuando el alcance es
  // 'TODAS' -- no hace falta repetir ese chequeo acá (redundancia real que
  // tenía este archivo antes de "alcance de solicitudes en 3 niveles").
  const visibles = await filtrarVisibles(candidatas, usuario);
  const top = visibles.slice(0, limit);

  const todosFrenteIds = [...new Set(top.flatMap((s) => s.frentes_ids ?? []))];
  const frentesMap = todosFrenteIds.length
    ? Object.fromEntries((await Frente.findAll({ where: { id: todosFrenteIds }, attributes: ['id', 'nombre'] })).map((f) => [f.id, f.nombre]))
    : {};

  return top.map((s) => ({
    id: s.id,
    consecutivo: s.consecutivo,
    tipo: s.tipo,
    categoria: s.categoria,
    frentesNombres: (s.frentes_ids ?? []).map((id) => frentesMap[id]).filter(Boolean),
    estado: s.estado,
    fechaSolicitud: s.fecha_solicitud,
    numeroContratoAdpro: s.numero_contrato_adpro,
    solicitanteNombre: s.solicitante?.nombre ?? null,
    terceroRazonSocial: s.tercero?.razon_social ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------
// Resumen del Inicio (rediseno 2026-10-09): lo que necesita la pantalla para mostrar la SITUACION y
// lo que requiere atencion, no solo 4 contadores. Todo respeta la visibilidad del usuario
// (`filtrarVisibles`, igual que /solicitudes) y, para "requiere tu atencion", la MISMA funcion que
// decide si aparece el boton de aprobar en el detalle (`puedeEjecutarAccion`).
// ---------------------------------------------------------------------------------------------

// En flujo = todo lo que ya salio de borrador y todavia no termino ni se anulo, INCLUIDOS los pasos
// intermedios (Director Tecnico / Residente Administrativo) que el KPI viejo dejaba fuera.
const ESTADOS_EN_FLUJO = [...ESTADOS_ACTIVOS, 'PENDIENTE_DIRECTOR_TECNICO', 'PENDIENTE_RESIDENTE_ADMINISTRATIVO'];
const ESTADOS_POR_CORREGIR = ['DEVUELTA', 'EN_REVISION'];

// Orden del flujo (para el grafico "por etapa"); las devueltas cierran la lista.
const ORDEN_ETAPAS = [
  'ENVIADA',
  'PENDIENTE_DIRECTOR_TECNICO',
  'APROBADA_DIRECTOR',
  'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
  'EN_PROYECCION_CONTROLES',
  'EN_TRAMITE_CONTRATOS',
  'CREACION_MINUTA',
  'ENVIO_CONTRATO_POLIZAS',
  'EN_CONTROLES',
  'APROBACION_FINAL',
  'PENDIENTE_GERENTE_COMPRAS',
  'EN_REVISION',
  'DEVUELTA',
];

const DIA_MS = 24 * 60 * 60 * 1000;
const LIMITE_ATENCION = 8;
const LIMITE_POR_CORREGIR = 5;
const MESES_GRAFICO = 6;

function mesClave(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function contar(lista, claveDe) {
  const mapa = new Map();
  for (const item of lista) mapa.set(claveDe(item), (mapa.get(claveDe(item)) ?? 0) + 1);
  return mapa;
}

function diasDesde(fecha, ahora) {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(fecha).getTime()) / DIA_MS));
}

function resumirNota(nota) {
  if (!nota) return null;
  const limpia = String(nota).replace(/\s+/g, ' ').trim();
  return limpia.length > 140 ? `${limpia.slice(0, 137)}...` : limpia;
}

function itemAtencion(s, accion, ahora) {
  return {
    id: s.id,
    consecutivo: s.consecutivo,
    tipo: s.tipo,
    categoria: s.categoria,
    estado: s.estado,
    accion,
    contratista: s.tercero?.razon_social ?? null,
    valorFinal: s.valor_final != null ? Number(s.valor_final) : null,
    diasEsperando: diasDesde(s.actualizado_en, ahora),
  };
}

async function resumen(usuario, { categoria } = {}) {
  const cat = categoria === 'DIRECTA' || categoria === 'INDIRECTA' ? categoria : null;
  const filtroCategoria = cat ? { categoria: cat } : {};
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);

  // 1) Contratos/ordenes visibles (sin otrosis, igual que los KPIs de siempre).
  const candidatas = await Solicitud.findAll({
    where: { solicitud_padre_id: null, ...filtroCategoria },
    attributes: [...CAMPOS_CANDIDATAS, 'categoria', 'tipo', 'valor_final'],
  });
  const visibles = await filtrarVisibles(candidatas, usuario);

  const enFlujo = visibles.filter((s) => ESTADOS_EN_FLUJO.includes(s.estado));
  const completadas = visibles.filter((s) => s.estado === 'COMPLETADA');
  const porCategoria = contar(enFlujo, (s) => s.categoria);

  const mesesVentana = Array.from({ length: MESES_GRAFICO }, (_, i) => mesClave(new Date(ahora.getFullYear(), ahora.getMonth() - (MESES_GRAFICO - 1 - i), 1)));
  const completadasPorMes = contar(completadas, (s) => mesClave(new Date(s.actualizado_en)));

  const etapas = contar(visibles.filter((s) => ORDEN_ETAPAS.includes(s.estado)), (s) => s.estado);

  // 2) Solicitudes (incluidos otrosis) donde ESTE usuario puede actuar ahora -- las mas viejas primero.
  const pendientes = await Solicitud.findAll({
    where: { estado: { [Op.in]: Object.keys(ACCION_PRINCIPAL_POR_ESTADO) }, ...filtroCategoria },
    attributes: [...new Set([...CAMPOS_PENDIENTES, 'consecutivo', 'tipo', 'valor_final', 'actualizado_en'])],
    include: [{ association: 'tercero', attributes: ['razon_social'] }],
  });
  const mias = [];
  for (const s of pendientes) {
    const accion = ACCION_PRINCIPAL_POR_ESTADO[s.estado];
    if (await puedeEjecutarAccion(s, usuario, accion)) mias.push({ s, accion });
  }
  mias.sort((a, b) => new Date(a.s.actualizado_en) - new Date(b.s.actualizado_en));

  // 3) Las del propio usuario que volvieron a su escritorio para corregir.
  const porCorregirWhere = { solicitante_id: Number(usuario.id), estado: { [Op.in]: ESTADOS_POR_CORREGIR }, ...filtroCategoria };
  const porCorregirTotal = await Solicitud.count({ where: porCorregirWhere });
  const porCorregir = await Solicitud.findAll({
    where: porCorregirWhere,
    attributes: ['id', 'consecutivo', 'tipo', 'categoria', 'estado', 'valor_final', 'actualizado_en', 'nota_contratacion'],
    include: [{ association: 'tercero', attributes: ['razon_social'] }],
    order: [['actualizado_en', 'ASC']],
    limit: LIMITE_POR_CORREGIR,
  });

  return {
    categoria: cat,
    kpis: {
      activas: enFlujo.length,
      activasPorCategoria: { DIRECTA: porCategoria.get('DIRECTA') ?? 0, INDIRECTA: porCategoria.get('INDIRECTA') ?? 0 },
      pendientesMiAprobacion: mias.length,
      requierenCorreccion: visibles.filter((s) => ESTADOS_POR_CORREGIR.includes(s.estado)).length,
      completadasMes: completadas.filter((s) => new Date(s.actualizado_en) >= inicioMes).length,
      completadasMesAnterior: completadas.filter((s) => new Date(s.actualizado_en) >= inicioMesAnterior && new Date(s.actualizado_en) < inicioMes).length,
      valorEnTramite: enFlujo.reduce((suma, s) => suma + Number(s.valor_final ?? 0), 0),
    },
    porEtapa: ORDEN_ETAPAS.filter((estado) => etapas.get(estado)).map((estado) => ({ estado, total: etapas.get(estado) })),
    porMes: mesesVentana.map((mes) => ({ mes, total: completadasPorMes.get(mes) ?? 0 })),
    porTipo: [...contar(enFlujo, (s) => s.tipo)].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
    atencion: {
      total: mias.length,
      items: mias.slice(0, LIMITE_ATENCION).map(({ s, accion }) => itemAtencion(s, accion, ahora)),
    },
    porCorregir: {
      total: porCorregirTotal,
      items: porCorregir.map((s) => ({ ...itemAtencion(s, null, ahora), nota: resumirNota(s.nota_contratacion) })),
    },
    recientes: await recientes(usuario, 8, cat),
  };
}

module.exports = { stats, recientes, resumen };
