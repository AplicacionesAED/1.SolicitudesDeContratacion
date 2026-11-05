// "Generar Documento" para solicitudes DIRECTAS -- pedido explícito del
// usuario, que compartió la plantilla real "Orden de Compra/Servicios" de
// la empresa (una imagen, no un archivo) para replicarla como PDF. Fiel a
// esa plantilla: encabezado con logo + control de versión, bloque
// Comprador (datos fijos de la empresa) + Orden de Compra (fecha/OC#),
// bloque VENDEDOR (el Tercero contratista), tabla de ítems, totales con
// AIU/IVA, Forma de pago/Plazo de entrega, Términos y Condiciones, y pie
// de firmas Registro/Revisó/Aprobó.
//
// SOLO aplica a DIRECTA (pedido explícito: "de momento solo aplícalo en
// directos") -- Indirecta sigue generando el .docx de siempre
// (documento.js), sin ningún cambio. El botón "Generar documento" del
// frontend decide a cuál de los dos endpoints llamar según
// `solicitud.categoria` (ver SolicitudDetallePage.jsx).
//
// Los datos de ítems/proveedor/totales son LITERALMENTE los del Cuadro
// Comparativo de la solicitud (ver CuadroComparativoBuilder.jsx) -- Directa
// ya fuerza un único proveedor (el mismo Tercero contratista,
// `proveedorUnico`), así que esa única fila de `proveedores` trae el
// precio unitario y el AIU/IVA que van en este documento. Las fórmulas de
// Valor Total/Subtotal/AIU/IVA/Costo Total se REPITEN acá a mano (no se
// puede importar el .jsx del frontend desde el backend) pero son
// exactamente las mismas que `calcularValorTotalItem`/
// `calcularTotalesProveedor` -- si esas cambian, este archivo hay que
// actualizarlo en paralelo.
const path = require('path');
const PDFDocument = require('pdfkit');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const Solicitud = require('./solicitud.model');
const HistorialSolicitud = require('./historialSolicitud.model');
const Usuario = require('../usuario/usuario.model');
const Tercero = require('../tercero/tercero.model');
const Frente = require('../frente/frente.model');
const FrenteUsuario = require('../frente/frenteUsuario.model');
const CronogramaContrato = require('./cronogramaContrato.model');
const CuadroComparativo = require('./cuadroComparativo.model');
const CuadroComparativoProveedor = require('./cuadroComparativoProveedor.model');
const CuadroComparativoItem = require('./cuadroComparativoItem.model');
const { getRolesPorCodigo } = require('../../utils/permisos');

const LOGO_PATH = path.join(__dirname, '../../assets/aed-logo.png');

// Nombre que firma la casilla APROBO cuando el Gerente de Compras ya aprobó (APROBAR_GERENTE_COMPRAS).
const FIRMANTE_GERENTE_COMPRAS = 'Didier Moreno';

// Datos FIJOS de la empresa compradora (Promotora Barlovento del Mar) --
// fieles a la plantilla real que compartió el usuario. Mismo criterio que
// CONTRATANTE_NOMBRE/CONTRATANTE_NIT en SolicitudForm.jsx (frontend): son
// datos de la empresa, no de cada solicitud puntual, así que no viven en
// la base de datos. El NIT acá lleva el dígito de verificación
// ("-6", formato legal de factura) -- distinto del CONTRATANTE_NIT sin
// guion que ya se usa en otros lados de la app; son 2 constantes
// independientes a propósito, cada una fiel al formato que pide SU propio
// documento.
const EMPRESA_NOMBRE = 'PROMOTORA BARLOVENTO DEL MAR SAS';
const EMPRESA_NIT = '901307871-6';
const EMPRESA_DIRECCION = 'ZONA NORTE ANILLO VIAL KM12-855';
const EMPRESA_CIUDAD = 'CARTAGENA';
const EMPRESA_TELEFONO = '3107180522';
const EMPRESA_SITIO_WEB = '';
// Dirección de radicación de facturas -- distinta de la dirección de
// arriba en la plantilla real (una es la sede, la otra el punto de
// radicación), se guardan como 2 constantes separadas a propósito, no se
// asume que sean la misma.
const EMPRESA_DIRECCION_FACTURACION = 'Anillo Vial Km 12-655, Sector Puerta de las Américas Baía Kristal, Cartagena';
const DOCUMENTO_VERSION = '04';
const DOCUMENTO_FECHA_VERSION = '11/06/2022';

// Solo tonos de azul (+ grises neutros) -- pedido explícito del usuario de
// quitar morado/verde/naranja del documento. COLOR_BLUE queda para
// encabezados/etiquetas de bloque; COLOR_BLUE_LIGHT es el tono más claro
// para los bloques de valor (Comprador, Forma de pago, Plazo de entrega)
// que antes usaban morado/verde/naranja para diferenciarse del label.
const COLOR_BLUE = '#1F4E79';
const COLOR_BLUE_LIGHT = '#4472C4';
const COLOR_TOTAL_BG = '#BEE7E8';
const COLOR_BORDER = '#999999';
const COLOR_LABEL = '#555555';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

function formatCurrency(value) {
  const num = Math.round(Number(value) || 0);
  return '$' + num.toLocaleString('es-CO');
}

function formatFechaCorta(date) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

// `iso` es 'YYYY-MM-DD' (columna DATEONLY de CronogramaContrato) -- NUNCA
// envolver en `new Date()` acá (mismo gotcha ya documentado en
// cronograma.js: un Date de JS se reformatea en la zona horaria del
// proceso y puede correr el día), se parsea el string a mano.
function formatFechaLarga(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${Number(d)} DE ${MESES[Number(m) - 1]} DE ${y}`;
}

// Mismas fórmulas que CuadroComparativoBuilder.jsx#calcularValorTotalItem/
// calcularTotalesProveedor -- ver el comentario grande arriba sobre por
// qué están repetidas acá.
function calcularValorTotalItem(item, proveedorId) {
  const cantidad = Number(item.cantidad_real) || 0;
  const unitario = Number(item.precios?.[String(proveedorId)]) || 0;
  return cantidad * unitario;
}

function calcularTotalesProveedor(items, proveedor) {
  const subtotal = items.reduce((acc, it) => acc + calcularValorTotalItem(it, proveedor.id), 0);
  const administracion = subtotal * ((Number(proveedor.administracion_pct) || 0) / 100);
  const imprevisto = subtotal * ((Number(proveedor.imprevisto_pct) || 0) / 100);
  const utilidad = subtotal * ((Number(proveedor.utilidad_pct) || 0) / 100);
  const ivaUtilidad = utilidad * ((Number(proveedor.iva_utilidad_pct) || 0) / 100);
  const costoTotal = subtotal + administracion + imprevisto + utilidad + ivaUtilidad;
  return { subtotal, administracion, imprevisto, utilidad, ivaUtilidad, costoTotal };
}

// ── Helpers de dibujo -- pdfkit no tiene tablas nativas, se arma todo a
//    mano con rectángulos + texto posicionados. ──────────────────────────
function fillRect(doc, x, y, w, h, color) {
  doc.rect(x, y, w, h).fill(color);
}
function strokeRect(doc, x, y, w, h) {
  doc.rect(x, y, w, h).lineWidth(0.75).strokeColor(COLOR_BORDER).stroke();
}
function cellText(doc, str, x, y, w, opts = {}) {
  // `str === ''` (ej. Tercero.nit vacío en vez de null, un dato real así
  // en la base) también debe caer al guion -- `?? '—'` solo cubre
  // null/undefined, un string vacío pasaba de largo y quedaba en blanco.
  const display = str === null || str === undefined || str === '' ? '—' : str;
  doc
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts.size ?? 8)
    .fillColor(opts.color ?? '#000000')
    .text(display, x + 4, y + (opts.padTop ?? 4), { width: w - 8, align: opts.align ?? 'left' });
}

const PAGE_MARGIN = 30;
const CONTENT_W = 612 - PAGE_MARGIN * 2; // 552
const PAGE_BOTTOM = 792 - PAGE_MARGIN;

const generarOrdenServicio = asyncHandler(async (req, res) => {
  const numId = Number(req.params.id);
  if (!Number.isInteger(numId)) throw new ApiError(400, 'ID inválido');

  const solicitud = await Solicitud.findByPk(numId, {
    include: [
      { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'cargo', 'email'] },
      { model: Tercero, as: 'tercero' },
      { model: CronogramaContrato, as: 'cronograma' },
      {
        model: CuadroComparativo,
        as: 'cuadroComparativo',
        include: [
          { model: CuadroComparativoProveedor, as: 'proveedores' },
          { model: CuadroComparativoItem, as: 'items' },
        ],
      },
    ],
  });
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  // "De momento solo aplícalo en directos" -- pedido explícito del
  // usuario. Indirecta sigue con documento.js (.docx) sin cambios.
  if (solicitud.categoria !== 'DIRECTA') {
    throw new ApiError(400, 'La Orden de Servicio solo aplica a solicitudes Directas');
  }

  // Mismo criterio de acceso que documento.js. Resuelto por código, no por
  // los strings 'SOLICITANTE'/'DIRECTOR_PROYECTO' a secas (2026-09-18) --
  // ver utils/permisos.js#getRolesPorCodigo.
  const userRoles = req.usuario.roles ?? [];
  const rp = await getRolesPorCodigo();
  if (userRoles.includes(rp.SOLICITANTE) || userRoles.includes(rp.DIRECTOR_PROYECTO)) {
    if (solicitud.solicitante_id !== Number(req.usuario.id)) {
      const asignaciones = await FrenteUsuario.findAll({ where: { usuario_id: req.usuario.id }, attributes: ['frente_id'] });
      const userFrenteIds = asignaciones.map((a) => a.frente_id);
      const tieneAcceso = (solicitud.frentes_ids ?? []).some((fId) => userFrenteIds.includes(fId));
      if (!tieneAcceso) throw new ApiError(403, 'Sin acceso a esta solicitud');
    }
  }

  const frentesIds = solicitud.frentes_ids ?? [];
  const frenteRecords = await Frente.findAll({ where: { id: frentesIds }, attributes: ['id', 'nombre'] });
  const frenteNames = frenteRecords.map((f) => f.nombre).join(', ');

  const t = solicitud.tercero;
  const sol = solicitud.solicitante;
  const cuadro = solicitud.cuadroComparativo;
  // Directa fuerza EXACTAMENTE un proveedor (ver
  // CuadroComparativoBuilder.jsx#proveedorUnico) -- es el mismo Tercero
  // contratista de la solicitud, alcanza con el primero.
  const proveedor = cuadro?.proveedores?.[0] ?? null;
  const items = cuadro?.items ?? [];
  const totales = proveedor
    ? calcularTotalesProveedor(items, proveedor)
    : { subtotal: 0, administracion: 0, imprevisto: 0, utilidad: 0, ivaUtilidad: 0, costoTotal: 0 };

  const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', resolve));

  const left = PAGE_MARGIN;
  let y = PAGE_MARGIN;

  // 1. Encabezado -- logo + título + control de versión del formato.
  const HEADER_H = 50;
  strokeRect(doc, left, y, 90, HEADER_H);
  try {
    doc.image(LOGO_PATH, left + 12, y + 12, { fit: [66, 26] });
  } catch {
    cellText(doc, 'aed', left, y + 18, 90, { bold: true, align: 'center', size: 14 });
  }
  strokeRect(doc, left + 90, y, 310, HEADER_H);
  cellText(doc, 'ORDEN DE COMPRA/SERVICIOS', left + 90, y + HEADER_H / 2 - 7, 310, { bold: true, size: 13, align: 'center' });
  strokeRect(doc, left + 400, y, 152, HEADER_H / 2);
  cellText(doc, `VERSIÓN: ${DOCUMENTO_VERSION}`, left + 400, y + HEADER_H / 4 - 6, 152, { bold: true, size: 8, align: 'center' });
  strokeRect(doc, left + 400, y + HEADER_H / 2, 152, HEADER_H / 2);
  cellText(doc, `FECHA: ${DOCUMENTO_FECHA_VERSION}`, left + 400, y + (HEADER_H * 3) / 4 - 6, 152, { bold: true, size: 8, align: 'center' });
  y += HEADER_H;

  // 2. Comprador (datos fijos de la empresa) + Orden de Compra (fecha/OC#).
  const ROW_H = 16;
  const labelW = 100;
  const buyerLeftW = 380;
  const buyerRightW = CONTENT_W - buyerLeftW;

  const buyerRows = [
    ['Nombre de empresa', EMPRESA_NOMBRE],
    ['Nit', EMPRESA_NIT],
    ['Dirección', EMPRESA_DIRECCION],
    ['Ciudad, Estado, postal', EMPRESA_CIUDAD],
    ['Teléfono', EMPRESA_TELEFONO],
    ['Sitio Web', EMPRESA_SITIO_WEB || '—'],
  ];
  let by = y;
  for (const [label, value] of buyerRows) {
    strokeRect(doc, left, by, labelW, ROW_H);
    cellText(doc, label, left, by, labelW, { size: 6.5, color: COLOR_LABEL });
    fillRect(doc, left + labelW, by, buyerLeftW - labelW, ROW_H, COLOR_BLUE_LIGHT);
    strokeRect(doc, left + labelW, by, buyerLeftW - labelW, ROW_H);
    cellText(doc, value, left + labelW, by, buyerLeftW - labelW, { size: 8, bold: true, color: '#FFFFFF' });
    by += ROW_H;
  }

  let ry = y;
  const rx = left + buyerLeftW;
  strokeRect(doc, rx, ry, buyerRightW, ROW_H);
  cellText(doc, 'ORDEN DE COMPRA', rx, ry, buyerRightW, { bold: true, size: 9, align: 'right', color: COLOR_BLUE });
  ry += ROW_H;
  strokeRect(doc, rx, ry, 55, ROW_H);
  cellText(doc, 'FECHA', rx, ry, 55, { size: 7, bold: true });
  strokeRect(doc, rx + 55, ry, buyerRightW - 55, ROW_H);
  cellText(doc, formatFechaCorta(new Date()), rx + 55, ry, buyerRightW - 55, { size: 8 });
  ry += ROW_H;
  strokeRect(doc, rx, ry, 55, ROW_H);
  cellText(doc, 'OC #', rx, ry, 55, { size: 7, bold: true });
  strokeRect(doc, rx + 55, ry, buyerRightW - 55, ROW_H);
  cellText(doc, solicitud.consecutivo, rx + 55, ry, buyerRightW - 55, { size: 6.5 });
  ry += ROW_H;

  y = Math.max(by, ry) + 8;

  // 3. Vendedor (el Tercero contratista).
  fillRect(doc, left, y, CONTENT_W, ROW_H, COLOR_BLUE);
  strokeRect(doc, left, y, CONTENT_W, ROW_H);
  cellText(doc, 'VENDEDOR', left, y, CONTENT_W, { bold: true, size: 9, align: 'center', color: '#FFFFFF' });
  y += ROW_H;

  const vendedorRows = [
    ['Nombre de empresa', t?.razon_social],
    ['Nit', t?.nit],
    // "Contacto o Departamento" -- confirmado con el usuario: el campo
    // "Contacto" del Tercero (nombre_contacto), no el representante legal.
    ['Contacto o Departamento', t?.nombre_contacto],
    ['Dirección', t?.direccion_representante],
    ['Ciudad, Estado, postal', null],
    ['Teléfono', t?.telefono_contacto ?? t?.telefono_representante],
  ];
  for (const [label, value] of vendedorRows) {
    strokeRect(doc, left, y, labelW, ROW_H);
    cellText(doc, label, left, y, labelW, { size: 6.5, color: COLOR_LABEL });
    strokeRect(doc, left + labelW, y, CONTENT_W - labelW, ROW_H);
    cellText(doc, value, left + labelW, y, CONTENT_W - labelW, { size: 8, bold: true });
    y += ROW_H;
  }
  y += 8;

  // 4. Tabla de ítems -- ITEM/Cod./Descripción/Cant/Unidad/Precio unitario/
  //    Valor total. Cant = cantidadReal (la que se compra/contrata, mismo
  //    campo que ya alimenta calcularValorTotalItem en el frontend).
  const cols = [
    { key: 'item', label: 'ITEM', w: 28, align: 'center' },
    { key: 'cod', label: 'COD.', w: 42, align: 'center' },
    { key: 'desc', label: 'DESCRIPCIÓN', w: 160, align: 'left' },
    { key: 'cant', label: 'CANT', w: 45, align: 'center' },
    { key: 'unidad', label: 'UNIDAD', w: 60, align: 'center' },
    { key: 'punit', label: 'PRECIO UNITARIO', w: 100, align: 'right' },
    { key: 'vtotal', label: 'VALOR TOTAL', w: 117, align: 'right' },
  ];
  const headerH = 22;

  function drawItemsHeader() {
    let cx = left;
    for (const c of cols) {
      fillRect(doc, cx, y, c.w, headerH, COLOR_BLUE);
      strokeRect(doc, cx, y, c.w, headerH);
      cellText(doc, c.label, cx, y + 7, c.w, { bold: true, size: 7, align: 'center', color: '#FFFFFF' });
      cx += c.w;
    }
    y += headerH;
  }

  drawItemsHeader();

  const rowH = 20;
  items.forEach((it, idx) => {
    // Salto de página si la fila no cabe -- vuelve a dibujar el
    // encabezado de la tabla en la página nueva, para que siga siendo
    // legible sin tener que volver a la página anterior.
    if (y + rowH > PAGE_BOTTOM - 120) {
      doc.addPage();
      y = PAGE_MARGIN;
      drawItemsHeader();
    }
    const precio = Number(it.precios?.[String(proveedor?.id)]) || 0;
    const vtotal = calcularValorTotalItem(it, proveedor?.id);
    const values = {
      item: String(idx + 1),
      cod: it.codigo_insumo ?? it.codigo_item ?? '—',
      desc: it.actividad,
      cant: String(Number(it.cantidad_real) || 0),
      unidad: it.unidad ?? '—',
      punit: formatCurrency(precio),
      vtotal: formatCurrency(vtotal),
    };
    let cx = left;
    for (const c of cols) {
      strokeRect(doc, cx, y, c.w, rowH);
      cellText(doc, values[c.key], cx, y + 6, c.w, { size: 7.5, align: c.align });
      cx += c.w;
    }
    y += rowH;
  });
  if (items.length === 0) {
    strokeRect(doc, left, y, CONTENT_W, rowH);
    cellText(doc, 'Sin ítems en el Cuadro Comparativo.', left, y + 6, CONTENT_W, { size: 7.5, align: 'center', color: COLOR_LABEL });
    y += rowH;
  }

  // 5. Totales -- Subtotal + AIU + IVA sobre utilidad + Costo Total, mismas
  //    fórmulas y mismos % que el Cuadro Comparativo del proveedor único.
  const totalsW = cols[5].w + cols[6].w; // Precio unitario + Valor total
  const totalsX = left + CONTENT_W - totalsW;
  const totalsLabelW = 135;
  const totalsValW = totalsW - totalsLabelW;
  const totalRows = [
    ['SUBTOTAL', totales.subtotal],
    [`ADMINISTRACION (${proveedor?.administracion_pct ?? 0}%)`, totales.administracion],
    [`IMPREVISTOS (${proveedor?.imprevisto_pct ?? 0}%)`, totales.imprevisto],
    [`UTILIDAD (${proveedor?.utilidad_pct ?? 0}%)`, totales.utilidad],
    [`IVA/UTILIDAD (${proveedor?.iva_utilidad_pct ?? 0}%)`, totales.ivaUtilidad],
  ];
  y += 4;
  for (const [label, value] of totalRows) {
    strokeRect(doc, totalsX, y, totalsLabelW, ROW_H);
    cellText(doc, label, totalsX, y, totalsLabelW, { size: 6.5 });
    strokeRect(doc, totalsX + totalsLabelW, y, totalsValW, ROW_H);
    cellText(doc, formatCurrency(value), totalsX + totalsLabelW, y, totalsValW, { size: 7.5, align: 'right' });
    y += ROW_H;
  }
  fillRect(doc, totalsX, y, totalsLabelW, ROW_H + 2, COLOR_TOTAL_BG);
  strokeRect(doc, totalsX, y, totalsLabelW, ROW_H + 2);
  cellText(doc, 'TOTAL', totalsX, y + 2, totalsLabelW, { bold: true, size: 8 });
  fillRect(doc, totalsX + totalsLabelW, y, totalsValW, ROW_H + 2, COLOR_TOTAL_BG);
  strokeRect(doc, totalsX + totalsLabelW, y, totalsValW, ROW_H + 2);
  cellText(doc, formatCurrency(totales.costoTotal), totalsX + totalsLabelW, y + 2, totalsValW, { bold: true, size: 8, align: 'right' });
  y += ROW_H + 2 + 10;

  // 6. Forma de pago / 7. Plazo de entrega.
  const labelBarW = 110;
  const barH = ROW_H + 4;

  fillRect(doc, left, y, labelBarW, barH, COLOR_BLUE);
  strokeRect(doc, left, y, labelBarW, barH);
  cellText(doc, 'Forma de pago', left, y + 5, labelBarW, { bold: true, size: 8, color: '#FFFFFF' });
  fillRect(doc, left + labelBarW, y, CONTENT_W - labelBarW, barH, COLOR_BLUE_LIGHT);
  strokeRect(doc, left + labelBarW, y, CONTENT_W - labelBarW, barH);
  cellText(doc, (solicitud.forma_pago || '—').toUpperCase(), left + labelBarW, y + 5, CONTENT_W - labelBarW, { bold: true, size: 8, align: 'center', color: '#FFFFFF' });
  y += barH;

  // "Cronograma no aplica en directos" (2026-09-21) -- una Orden de Servicio
  // nueva ya no tiene fechas de cronograma para armar "DESDE EL... HASTA
  // EL...", así que este campo cae al texto libre de `plazo_ejecucion`
  // (siempre obligatorio para enviar, ver solicitud.estado.js). El
  // cronograma real se conserva tal cual para cualquier solicitud vieja que
  // ya lo tenga guardado -- no se pierde ese dato histórico.
  const fechaInicio = formatFechaLarga(solicitud.cronograma?.fecha_inicio);
  const fechaFin = formatFechaLarga(solicitud.cronograma?.fecha_fin);
  const plazoTexto =
    fechaInicio && fechaFin ? `DESDE EL ${fechaInicio} HASTA EL ${fechaFin}` : (solicitud.plazo_ejecucion || 'Sin información registrada.').toUpperCase();

  fillRect(doc, left, y, labelBarW, barH, COLOR_BLUE);
  strokeRect(doc, left, y, labelBarW, barH);
  cellText(doc, 'Plazo de entrega', left, y + 5, labelBarW, { bold: true, size: 8, color: '#FFFFFF' });
  fillRect(doc, left + labelBarW, y, CONTENT_W - labelBarW, barH, COLOR_BLUE_LIGHT);
  strokeRect(doc, left + labelBarW, y, CONTENT_W - labelBarW, barH);
  cellText(doc, plazoTexto, left + labelBarW, y + 5, CONTENT_W - labelBarW, { bold: true, size: 8, align: 'center', color: '#FFFFFF' });
  y += barH + 8;

  // 8. Términos y condiciones -- texto fijo (boilerplate legal, fiel a la
  //    plantilla real) + datos dinámicos de la solicitud al final.
  fillRect(doc, left, y, CONTENT_W, ROW_H, COLOR_BLUE);
  strokeRect(doc, left, y, CONTENT_W, ROW_H);
  cellText(doc, 'TERMINOS Y CONDICIONES', left, y, CONTENT_W, { bold: true, size: 9, align: 'center', color: '#FFFFFF' });
  y += ROW_H;

  const terminos = [
    `La Factura o Cuenta de Cobro debe hacerse a nombre de la empresa ${EMPRESA_NOMBRE} nit: ${EMPRESA_NIT}`,
    `Remitir la Factura a la Dirección: ${EMPRESA_DIRECCION_FACTURACION}`,
    'No acepte este pedido si tiene enmendaduras.',
    'Los precios unitarios de esta orden deben coincidir con los facturados.',
    'Plazos de Pago inician a partir de la fecha de radicación de la factura.',
    `Frente de trabajo: ${frenteNames || '—'}`,
    `Quien solicita: ${sol?.nombre ?? '—'}`,
    `Cargo: ${sol?.cargo ?? '—'}`,
    `Correo electronico: ${sol?.email ?? '—'}`,
  ];
  const lineH = 12;
  const termsH = terminos.length * lineH + 10;
  if (y + termsH + 60 > PAGE_BOTTOM) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  strokeRect(doc, left, y, CONTENT_W, termsH);
  let tyy = y + 6;
  for (const line of terminos) {
    cellText(doc, line, left, tyy, CONTENT_W, { size: 7.5, padTop: 0 });
    tyy += lineH;
  }
  y += termsH + 8;

  // 9. Pie de firmas -- Registro/Revisó/Aprobó, en blanco para firma física.
  const footerColW = CONTENT_W / 3;
  const footerHeaderH = 16;
  const footerBodyH = 40;
  if (y + footerHeaderH + footerBodyH > PAGE_BOTTOM) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  // REGISTRO = quien diligenció y envió la solicitud (el último ENVIAR/REENVIAR del historial; si no hay, el solicitante);
  // REVISO = quien aprobó Controles — Proyección (el último que ejecutó
  // APROBAR_PROYECCION); APROBO = Gerente de Compras, solo si ya firmó. Sin firmante, la casilla queda en blanco.
  const aprobacionProyeccion = await HistorialSolicitud.findOne({
    where: { solicitud_id: solicitud.id, accion: 'APROBAR_PROYECCION' },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'cargo'] }],
    order: [['id', 'DESC']],
  });
  const envio = await HistorialSolicitud.findOne({
    where: { solicitud_id: solicitud.id, accion: ['ENVIAR', 'REENVIAR'] },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'cargo'] }],
    order: [['id', 'DESC']],
  });
  const quienEnvio = envio?.usuario ?? sol;
  const firmas = {
    REGISTRO: quienEnvio?.nombre ? { nombre: quienEnvio.nombre, cargo: quienEnvio.cargo } : null,
    REVISO: aprobacionProyeccion?.usuario?.nombre ? { nombre: aprobacionProyeccion.usuario.nombre, cargo: aprobacionProyeccion.usuario.cargo } : null,
    APROBO: solicitud.fecha_aprobacion_gerente_compras ? { nombre: FIRMANTE_GERENTE_COMPRAS, cargo: 'Gerente de Compras' } : null,
  };
  ['REGISTRO', 'REVISO', 'APROBO'].forEach((label, i) => {
    const fx = left + i * footerColW;
    fillRect(doc, fx, y, footerColW, footerHeaderH, COLOR_BLUE);
    strokeRect(doc, fx, y, footerColW, footerHeaderH);
    cellText(doc, label, fx, y + 4, footerColW, { bold: true, size: 8, align: 'center', color: '#FFFFFF' });
    strokeRect(doc, fx, y + footerHeaderH, footerColW, footerBodyH);
    const firma = firmas[label];
    if (firma) {
      cellText(doc, firma.nombre, fx, y + footerHeaderH + 12, footerColW, { bold: true, size: 10, align: 'center' });
      if (firma.cargo) cellText(doc, firma.cargo, fx, y + footerHeaderH + 27, footerColW, { size: 7, align: 'center', color: '#555555' });
    }
  });

  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);
  // Espacios permitidos a propósito -- pedido explícito del usuario:
  // "el nombre del archivo debe ser orden de servicio y después todo el
  // nombre que tiene la solicitud", ej. "Orden de Servicio SOL-D-CONT-BK-
  // KABO1-002.pdf", no "Orden-Servicio-SOL-D-CONT-BK-KABO1-002.pdf".
  const safeConsecutivo = solicitud.consecutivo.replace(/[^a-zA-Z0-9-_ ]/g, '_');

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Orden de Servicio ${safeConsecutivo}.pdf"`,
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
});

module.exports = { generarOrdenServicio };
