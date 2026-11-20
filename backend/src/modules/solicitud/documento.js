// Puerto literal de api/solicitudes/[id]/documento/route.ts (458 líneas) --
// genera el Word de la solicitud con `docx`. La estructura del documento
// (14 secciones numeradas + firmas) se copia tal cual, incluida la
// numeración salteada ("12. FORMA DE PAGO" después de "10. VALOR..." -- no
// hay una sección 11 en el original, es así en producción, no un error de
// este puerto).
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  TableLayoutType,
} = require('docx');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const Solicitud = require('./solicitud.model');
const Usuario = require('../usuario/usuario.model');
const Tercero = require('../tercero/tercero.model');
const Frente = require('../frente/frente.model');
const FrenteUsuario = require('../frente/frenteUsuario.model');
const { getRolesPorCodigo } = require('../../utils/permisos');

// 2026-09-09 "eso de OBRA no es necesario" -- mismo mapa que
// frontend/src/utils/solicitudes.js#tipoContratoLabel. 2026-09-21 se
// agregaron los 5 tipos nuevos de DIRECTA (Suministro de Materiales, Mano
// de Obra, Servicios, Transporte, Alquiler) -- mismo orden que
// TIPOS_CONTRATO_VALIDOS_POR_CATEGORIA en solicitud.estado.js.
const TIPO_CONTRATO_LABELS = {
  TODO_COSTO: 'Todo Costo',
  OTROS_SERVICIOS: 'Otros Servicios',
  DISENO: 'Diseño',
  SUMINISTRO_MATERIALES: 'Suministro de Materiales',
  MANO_OBRA: 'Mano de Obra',
  SERVICIOS: 'Servicios',
  TRANSPORTE: 'Transporte',
  ALQUILER: 'Alquiler',
};

function bold(text) {
  return new TextRun({ text, bold: true });
}
function plain(text) {
  return new TextRun({ text: text ?? '—' });
}
function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ heading: level, children: [bold(text)], spacing: { before: 240, after: 120 } });
}
function cell(text, isHeader = false, shading) {
  return new TableCell({
    shading: shading ? { fill: shading, type: ShadingType.CLEAR, color: 'auto' } : isHeader ? { fill: '1E3A8A', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: isHeader, color: isHeader ? 'FFFFFF' : '000000', size: 20 })], alignment: AlignmentType.LEFT, spacing: { before: 40, after: 40 } })],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
    },
  });
}
function infoRow(label, value) {
  return new TableRow({ children: [cell(label, false, 'F3F4F6'), cell(value ?? '—')] });
}
function twoColTable(rows) {
  return new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(([k, v]) => infoRow(k, v)) });
}
function checklistTable(items) {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('Documento', true), cell('Incluido', true)] }),
      ...items.map((item) => new TableRow({ children: [cell(item.label), cell(item.checked ? 'Sí' : 'No', false, item.checked ? 'D1FAE5' : 'FEE2E2')] })),
    ],
  });
}
function spacer() {
  return new Paragraph({ text: '', spacing: { before: 80, after: 80 } });
}
function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value));
}

const generarDocumento = asyncHandler(async (req, res) => {
  const numId = Number(req.params.id);
  if (!Number.isInteger(numId)) throw new ApiError(400, 'ID inválido');

  const solicitud = await Solicitud.findByPk(numId, {
    include: [
      { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre', 'cargo', 'email', 'telefono'] },
      { model: Tercero, as: 'tercero' },
    ],
  });
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada');

  // Mismo criterio de acceso que el original: solo SOLICITANTE/DIRECTOR_PROYECTO
  // se restringen a dueño-o-frente; cualquier otro rol pasa sin más chequeo.
  // Resuelto por código, no por los strings a secas (2026-09-18) -- ver
  // utils/permisos.js#getRolesPorCodigo.
  const userRoles = req.usuario.roles ?? [];
  const rp = await getRolesPorCodigo();
  if (userRoles.includes(rp.SOLICITANTE) || userRoles.includes(rp.DIRECTOR_PROYECTO)) {
    if (solicitud.solicitante_id !== Number(req.usuario.id)) {
      const asignaciones = await FrenteUsuario.findAll({ where: { usuario_id: req.usuario.id, categoria: solicitud.categoria }, attributes: ['frente_id'] });
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

  const doc = new Document({
    styles: { paragraphStyles: [{ id: 'Normal', name: 'Normal', run: { size: 22, font: 'Calibri' } }] },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 720 } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: solicitud.tipo === 'ORDEN_SERVICIO' ? 'FORMATO DE SOLICITUD DE ORDEN DE SERVICIO' : 'FORMATO DE SOLICITUD DE CONTRATO', bold: true, size: 32, color: '1E3A8A' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'AED CONSTRUCTORES S.A.S — PROYECTO BAIA KRISTAL', size: 20, color: '6B7280', italics: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
          }),

          heading('1. ENCABEZADO', HeadingLevel.HEADING_2),
          twoColTable([
            ['Consecutivo', solicitud.consecutivo],
            ['Fecha de Solicitud', formatDate(solicitud.fecha_solicitud)],
            ['Solicitante', sol.nombre],
            ['Cargo', sol.cargo ?? '—'],
            ['Teléfono', sol.telefono ?? '—'],
            ['Correo', sol.email],
          ]),
          spacer(),

          heading('2. INFORMACIÓN DE LA SOLICITUD'),
          twoColTable([
            ['Área / Frente', frenteNames || '—'],
            ['Proyecto', 'Baia Kristal'],
            // 2026-09-09 "eso de OBRA no es necesario" -- el valor guardado
            // ya es distinto por categoría (TODO_COSTO/OTROS_SERVICIOS/
            // DISENO), mismo mapa que
            // frontend/src/utils/solicitudes.js#tipoContratoLabel (el
            // backend no puede importar código del frontend, se repite acá).
            solicitud.tipo === 'ORDEN_SERVICIO'
              ? ['Tipo', 'Orden de Servicio']
              : ['Tipo de Contrato', TIPO_CONTRATO_LABELS[solicitud.tipo_contrato] ?? '—'],
            ['Estado', solicitud.estado],
          ]),
          spacer(),

          heading('3. CREACIÓN DE TERCERO'),
          new Paragraph({ children: [plain('¿Requiere creación de tercero? '), bold(solicitud.creacion_tercero ? 'Sí' : 'No')] }),
          spacer(),

          heading('4. CONTRATANTE'),
          twoColTable([
            ['Nombre', solicitud.contratante_nombre ?? 'AED CONSTRUCTORES S.A.S'],
            ['NIT', solicitud.contratante_nit ?? '901237628-1'],
          ]),
          spacer(),

          heading('5. CONTRATISTA'),
          t
            ? twoColTable([
                ['Razón Social', t.razon_social],
                ['NIT', t.nit],
                ['Tipo de Contrato', t.tipo_contrato],
                ['Confidencialidad', t.confidencialidad ? 'Sí' : 'No'],
              ])
            : new Paragraph({ children: [plain('Sin tercero asignado.')] }),
          spacer(),

          heading('6. DOCUMENTOS OBLIGATORIOS'),
          checklistTable([
            { label: 'Términos de referencia / Especificaciones técnicas', checked: solicitud.doc_terminos_referencia },
            { label: 'Cámara de comercio', checked: solicitud.doc_camara_comercio },
            { label: 'Estados financieros', checked: solicitud.doc_estados_financieros },
            { label: 'Estado de resultados', checked: solicitud.doc_estado_resultados },
            { label: 'SAGRILAFT / Formulario de vinculación', checked: solicitud.doc_sagrilaft },
            { label: 'Composición accionaria', checked: solicitud.doc_composicion_accionaria },
            { label: 'RUT', checked: solicitud.doc_rut },
            { label: 'Cédula del representante legal', checked: solicitud.doc_cedula_representante },
            { label: 'Certificación bancaria', checked: solicitud.doc_certificacion_bancaria },
            { label: 'Cotización', checked: solicitud.doc_cotizacion },
          ]),
          spacer(),

          heading('7. OBJETO DEL CONTRATO'),
          new Paragraph({ children: [plain(solicitud.descripcion_actividad)], spacing: { after: 120 } }),
          spacer(),

          heading('8. ALCANCE'),
          new Paragraph({ children: [plain(solicitud.alcance)], spacing: { after: 120 } }),
          spacer(),

          heading('9. TÉRMINOS DE REFERENCIA / ESPECIFICACIONES TÉCNICAS'),
          new Paragraph({ children: [plain(solicitud.terminos_referencia || 'No aplica.')], spacing: { after: 120 } }),
          spacer(),

          heading('10. VALOR DEL CONTRATO'),
          twoColTable([
            ['Valor', solicitud.valor_final ? formatCurrency(solicitud.valor_final) : '—'],
            ['Valor en letras', solicitud.valor_en_letras ?? '—'],
          ]),
          spacer(),

          heading('12. FORMA DE PAGO'),
          new Paragraph({ children: [plain(solicitud.forma_pago)], spacing: { after: 120 } }),
          spacer(),

          heading('13. PLAZO DE EJECUCIÓN'),
          new Paragraph({ children: [plain(solicitud.plazo_ejecucion)], spacing: { after: 120 } }),
          spacer(),

          heading('14. CONDICIONES ESPECIALES'),
          new Paragraph({ children: [plain(solicitud.condiciones_especiales || 'No aplica.')], spacing: { after: 120 } }),
          spacer(),

          heading('15. ASUNTO'),
          new Paragraph({ children: [plain(solicitud.asunto)] }),
          spacer(),

          new Paragraph({ text: '', spacing: { before: 480 } }),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: '_________________________', size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ children: [new TextRun({ text: sol.nombre, bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ children: [new TextRun({ text: sol.cargo ?? 'Solicitante', size: 18, italics: true })], alignment: AlignmentType.CENTER }),
                    ],
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: '_________________________', size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ children: [new TextRun({ text: 'Director de Proyecto', bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ children: [new TextRun({ text: 'Firma y sello', size: 18, italics: true })], alignment: AlignmentType.CENTER }),
                    ],
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeConsecutivo = solicitud.consecutivo.replace(/[^a-zA-Z0-9-_]/g, '_');

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="Solicitud-Contrato-${safeConsecutivo}.docx"`,
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
});

module.exports = { generarDocumento };
