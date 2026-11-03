// Puerto de las constantes de src/lib/utils.ts (app Next.js original) --
// ESTADO_COLORS usaba clases Tailwind de un ramp de ~12 colores distintos;
// acá se traduce a las 5 variantes fijas de nuestro <Badge> (ver DESIGN.md) --
// una simplificación deliberada del sistema de diseño, no una traducción 1:1.
export const ESTADO_LABELS = {
  BORRADOR: 'Borrador',
  PENDIENTE_DIRECTOR_TECNICO: 'Pendiente Director Técnico',
  ENVIADA: 'Enviada',
  APROBADA_DIRECTOR: 'Aprobada por Director',
  // Flujo propio de Directa (Orden de Servicio), 2026-09-18.
  // 2026-09-21: paso nuevo de Residente Administrativo entre el Director y
  // Controles-Proyección (misma persona que 'Residente Administrativo —
  // Adpro' más abajo, 2 participaciones del mismo rol en Directa).
  PENDIENTE_RESIDENTE_ADMINISTRATIVO: 'Pendiente Residente Administrativo',
  EN_PROYECCION_CONTROLES: 'En Proyección de Controles',
  EN_REVISION: 'En Revisión',
  EN_TRAMITE_CONTRATOS: 'En Trámite Contratos',
  CREACION_MINUTA: 'Creación de Minuta',
  ENVIO_CONTRATO_POLIZAS: 'Envío Contrato y Pólizas',
  EN_CONTROLES: 'En Controles',
  APROBACION_FINAL: 'Aprobación Final',
  // Firma del Gerente de Compras en Directa -- desde 2026-11-03 va ANTES del Residente
  // Administrativo — Adpro (tras la elaboración de la orden). Este label es genérico
  // (compartido con INDIRECTA en los filtros/badges, aunque INDIRECTA nunca
  // alcanza este estado en la práctica) -- la etiqueta category-aware
  // "Aprobación Director/a de Controles" vive solo en
  // EstadoTimeline.jsx#WORKFLOW_STEPS_DIRECTA, no acá.
  PENDIENTE_GERENTE_COMPRAS: 'Pendiente firma Gerente de Compras',
  COMPLETADA: 'Completada',
  DEVUELTA: 'Devuelta',
  ANULADA: 'Anulada',
};

export const ESTADO_BADGE_VARIANT = {
  BORRADOR: 'neutral',
  PENDIENTE_DIRECTOR_TECNICO: 'info',
  ENVIADA: 'info',
  APROBADA_DIRECTOR: 'info',
  PENDIENTE_RESIDENTE_ADMINISTRATIVO: 'info',
  EN_PROYECCION_CONTROLES: 'info',
  EN_REVISION: 'warning',
  EN_TRAMITE_CONTRATOS: 'info',
  CREACION_MINUTA: 'warning',
  ENVIO_CONTRATO_POLIZAS: 'info',
  EN_CONTROLES: 'info',
  APROBACION_FINAL: 'warning',
  PENDIENTE_GERENTE_COMPRAS: 'warning',
  COMPLETADA: 'success',
  DEVUELTA: 'danger',
  ANULADA: 'danger',
};

export const TIPO_SOLICITUD_LABELS = {
  ORDEN_SERVICIO: 'Orden de Servicio',
  CONTRATO: 'Contrato',
  OTROSI_TIEMPO: 'Otrosí por Tiempo',
  OTROSI_TIEMPO_CANTIDAD: 'Otrosí Tiempo, Cantidad y/o Modificación',
  TRAMITE_CUENTA: 'Trámite de Cuenta',
  TRAMITE_FACTURAS: 'Trámite de Facturas',
  TRAMITE_CUENTAS_RECURRENTES: 'Trámite de Cuentas Recurrentes',
  TRAMITE_CUENTAS_OCASIONALES: 'Trámite de Cuentas Ocasionales',
  TRAMITE_BONIFICACIONES_COMISIONES: 'Trámite de Bonificaciones y Comisiones',
};

export const CATEGORIA_LABELS = { DIRECTA: 'Directa', INDIRECTA: 'Indirecta' };
export const CATEGORIA_BADGE_VARIANT = { DIRECTA: 'info', INDIRECTA: 'neutral' };

// Usados por el nav (AppShell), las rutas top-level `/solicitudes-directas`/
// `/solicitudes-indirectas`, y cualquier link/redirect que necesite construir
// esa ruta a partir de la categoría de una solicitud (o al revés).
export function categoriaSlug(categoria) {
  return categoria === 'DIRECTA' ? 'directas' : 'indirectas';
}

export function categoriaFromSlug(slug) {
  return slug === 'directas' ? 'DIRECTA' : 'INDIRECTA';
}

// `tipoContrato` de una Solicitud de tipo CONTRATO -- 2026-09-09, segunda
// vuelta: dejó de ser un único valor 'OBRA' con etiqueta distinta según
// categoría ("eso de OBRA no es necesario", pedido explícito) -- ahora el
// valor GUARDADO ya es distinto por categoría (`TODO_COSTO` en Directa,
// `OTROS_SERVICIOS` en Indirecta), así que esta función ya no necesita la
// categoría para nada, es un mapa directo (el label NO depende de la
// categoría: un mismo código se etiqueta igual en cualquier lado). `DISENO`
// sigue sin aplicar a Directa en absoluto (ver
// SolicitudForm.jsx#tiposContratoDisponibles). 2026-09-21: Directa ganó 5
// tipos más (`SUMINISTRO_MATERIALES`/`MANO_OBRA`/`SERVICIOS`/`TRANSPORTE`/
// `ALQUILER`), mismas etiquetas en el mapa (ver tiposContratoDisponibles).
const TIPO_CONTRATO_LABELS = {
  TODO_COSTO: 'Todo Costo',
  SUMINISTRO_MATERIALES: 'Suministro de Materiales',
  MANO_OBRA: 'Mano de Obra',
  SERVICIOS: 'Servicios',
  TRANSPORTE: 'Transporte',
  ALQUILER: 'Alquiler',
  OTROS_SERVICIOS: 'Otros Servicios',
  DISENO: 'Diseño',
};
export function tipoContratoLabel(tipoContrato) {
  return TIPO_CONTRATO_LABELS[tipoContrato] ?? tipoContrato ?? '—';
}

// Puerto de ACCION_ESTADO_DESTINO (src/lib/utils.ts original) -- el estado al
// que queda la solicitud después de cada acción, usado por
// HistorialSeguimiento.jsx para mostrar "Estado resultante" en cada entrada
// sin depender de una llamada extra al backend (es la misma tabla que
// ESTADO_DESTINO en solicitud.estado.js, backend).
export const ACCION_ESTADO_DESTINO = {
  ENVIAR: 'ENVIADA',
  APROBAR_DIRECTOR_TECNICO: 'ENVIADA',
  APROBAR_DIRECTOR: 'EN_TRAMITE_CONTRATOS',
  APROBAR_PROYECCION: 'EN_TRAMITE_CONTRATOS',
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'EN_PROYECCION_CONTROLES',
  COMENTAR: 'EN_PROYECCION_CONTROLES',
  DEVOLVER: 'DEVUELTA',
  REVISAR: 'EN_REVISION',
  TRAMITAR_OK: 'CREACION_MINUTA',
  AVANZAR_CONTRATOS: 'EN_CONTROLES',
  PASAR_CONTROLES: 'EN_CONTROLES',
  REGISTRAR_ADPRO: 'APROBACION_FINAL',
  APROBAR_FINAL: 'COMPLETADA',
  APROBAR_GERENTE_COMPRAS: 'EN_CONTROLES',
  REENVIAR: 'ENVIADA',
  ANULAR: 'ANULADA',
  IMPORTAR_HISTORICO: 'COMPLETADA',
};

// Nombre corto de cada acción (imperativo, "Enviar"/"Aprobar Director") --
// distinto de ACCION_LABELS (que describe una entrada YA ejecutada del
// historial, en pasado: "Solicitud enviada para aprobación"). Usado por el
// módulo Workflows (WorkflowsPage.jsx/WorkflowDetallePage.jsx) para
// etiquetar la acción misma, no un evento pasado.
export const ACCION_NOMBRES_CORTOS = {
  ENVIAR: 'Enviar',
  APROBAR_DIRECTOR_TECNICO: 'Aprobar (Dir. Técnico)',
  APROBAR_DIRECTOR: 'Aprobar (Director)',
  APROBAR_PROYECCION: 'Aprobar Proyección (Controles)',
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'Aprobar (Residente Administrativo)',
  COMENTAR: 'Agregar comentario',
  DEVOLVER: 'Devolver',
  REVISAR: 'Revisar',
  TRAMITAR_OK: 'Trámite OK',
  AVANZAR_CONTRATOS: 'Avanzar a Controles',
  PASAR_CONTROLES: 'Pasar a Controles',
  REGISTRAR_ADPRO: 'Registrar Adpro',
  APROBAR_FINAL: 'Aprobar Final',
  APROBAR_GERENTE_COMPRAS: 'Firmar (Gerente de Compras)',
  REENVIAR: 'Reenviar',
  ANULAR: 'Anular',
};

// Puerto de ACCION_COLOR (original usaba clases Tailwind arbitrarias por
// acción) -- traducido a las 5 variantes de color ya usadas en el proyecto
// (ver Badge.jsx) en vez de un color nuevo por acción.
export const ACCION_COLOR_VARIANT = {
  ENVIAR: 'primary',
  REENVIAR: 'primary',
  REGISTRAR_ADPRO: 'primary',
  APROBAR_DIRECTOR_TECNICO: 'success',
  APROBAR_DIRECTOR: 'success',
  APROBAR_PROYECCION: 'success',
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'success',
  COMENTAR: 'neutral',
  TRAMITAR_OK: 'success',
  AVANZAR_CONTRATOS: 'success',
  PASAR_CONTROLES: 'success',
  APROBAR_FINAL: 'success',
  APROBAR_GERENTE_COMPRAS: 'success',
  DEVOLVER: 'danger',
  REVISAR: 'warning',
  ANULAR: 'danger',
  IMPORTAR_HISTORICO: 'neutral',
};

export const ACCION_LABELS = {
  ENVIAR: 'Solicitud enviada para aprobación',
  APROBAR_DIRECTOR_TECNICO: 'Aprobada por Director Técnico',
  APROBAR_DIRECTOR: 'Aprobada por Director de Proyecto',
  APROBAR_PROYECCION: 'Proyección aprobada por Controles',
  APROBAR_RESIDENTE_ADMINISTRATIVO: 'Aprobada por Residente Administrativo',
  COMENTAR: 'Comentario de Controles — Proyección',
  DEVOLVER: 'Devuelta al solicitante',
  REVISAR: 'Enviada a revisión por el solicitante',
  TRAMITAR_OK: 'Documentación revisada — En creación de minuta',
  AVANZAR_CONTRATOS: 'Anexos adjuntados — Enviada a Controles',
  PASAR_CONTROLES: 'Contrato y pólizas enviados a Controles',
  REGISTRAR_ADPRO: 'Número de contrato Adpro registrado',
  APROBAR_FINAL: 'Aprobación definitiva por Director de Controles',
  APROBAR_GERENTE_COMPRAS: 'Firmada por Gerente de Compras',
  REENVIAR: 'Solicitud reenviada para aprobación',
  ANULAR: 'Solicitud anulada',
  IMPORTAR_HISTORICO: 'Registro histórico importado',
};

// Puerto literal de numeroALetras (src/lib/utils.ts) -- usado para mostrar el
// valor final "en letras" en el wizard, tal cual lo hacía el original.
const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function cientos(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const d = n % 100;
  const dec = Math.floor(d / 10);
  const uni = d % 10;
  let res = CENTENAS[c];
  if (d > 0) {
    if (d < 30) res += (res ? ' ' : '') + UNIDADES[d];
    else {
      res += (res ? ' ' : '') + DECENAS[dec];
      if (uni > 0) res += ' Y ' + UNIDADES[uni];
    }
  }
  return res;
}

export function numeroALetras(valor) {
  if (valor === 0) return 'CERO PESOS M/CTE';
  const entero = Math.floor(valor);
  const totalMillones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;
  let resultado = '';
  if (totalMillones > 0) {
    if (totalMillones === 1) {
      resultado += 'UN MILLÓN';
    } else {
      const milesDeMillones = Math.floor(totalMillones / 1000);
      const restoMillones = totalMillones % 1000;
      let parteMillones = '';
      if (milesDeMillones > 0) parteMillones += milesDeMillones === 1 ? 'MIL' : cientos(milesDeMillones) + ' MIL';
      if (restoMillones > 0) parteMillones += (parteMillones ? ' ' : '') + cientos(restoMillones);
      resultado += parteMillones + ' MILLONES';
    }
  }
  if (miles > 0) resultado += (resultado ? ' ' : '') + (miles === 1 ? 'MIL' : cientos(miles) + ' MIL');
  if (resto > 0) resultado += (resultado ? ' ' : '') + cientos(resto);
  return resultado + ' PESOS M/CTE';
}

// "Orden de Servicio en Directa solo para valores < $50.000.000" -- pedido
// explícito del usuario (2026-10-20). Por encima del tope amerita un proceso
// de licitación, no una Orden de Servicio simple. El backend
// (solicitud.estado.js) repite este mismo valor literal -- no puede importar
// código del frontend.
export const LIMITE_ORDEN_SERVICIO_DIRECTA = 50000000;

export function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
}

// Para campos de dinero editados como texto (nunca <input type="number">
// -- ver el comentario grande donde se usan). `soloDigitos` es lo que hay
// que aplicarle a `e.target.value` en el onChange: al pegar "1.500.000" el
// navegador entrega ese string tal cual (a diferencia de un input numérico,
// que interpretaría el primer punto como separador decimal y truncaría o
// rechazaría el resto) -- quitar todo lo que no sea dígito lo reduce a
// "1500000" sin importar si el usuario pegó puntos de miles o no. Guardar
// SIEMPRE el string de dígitos crudo (nunca el formateado) -- `Number()`
// sobre eso funciona igual que sobre cualquier otro valor numérico ya
// usado en el resto del código (comparaciones, cálculos, envío al backend).
export function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

// Formatea esos mismos dígitos con separador de miles (es-CO -> puntos)
// para MOSTRAR en el input mientras se edita -- nunca lo que se guarda.
export function formatearMiles(valor) {
  const digitos = soloDigitos(valor);
  return digitos ? new Intl.NumberFormat('es-CO').format(Number(digitos)) : '';
}
