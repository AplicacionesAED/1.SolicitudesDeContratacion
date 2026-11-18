// Puerto literal de api/terceros/sync-sharepoint/route.ts (app Next.js
// original) -- es fetch + OAuth2 client-credentials contra Microsoft Graph,
// cero acoplamiento a Next.js, se traslada casi sin cambios. Mismas 3
// llamadas a Graph: token -> site -> drive -> content.
const XLSX = require('xlsx');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/ApiResponse');
const Tercero = require('./tercero.model');

// Credenciales propias del sync (app "CarteraExcel", permiso de aplicación sobre Graph), separadas de las del
// login (app "Acceso Apps"). Si SHAREPOINT_* no están definidas, cae a AZURE_* (comportamiento anterior).
const TENANT_ID = process.env.SHAREPOINT_TENANT_ID || process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID || process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
const FILE_ID = process.env.SHAREPOINT_FILE_ID;

async function getAccessToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function getSiteId(token) {
  const res = await fetch('https://graph.microsoft.com/v1.0/sites/aedcartagena.sharepoint.com:/sites/COMPRAS', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Site lookup error: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function downloadExcel(token, siteId) {
  const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!driveRes.ok) throw new Error(`Drive error: ${await driveRes.text()}`);
  const drive = await driveRes.json();
  const driveId = drive.id;

  const contentRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${FILE_ID}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contentRes.ok) throw new Error(`Download error: ${await contentRes.text()}`);

  return Buffer.from(await contentRes.arrayBuffer());
}

function parseExcelDate(raw) {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
      return isNaN(date.getTime()) ? null : date;
    }
  }
  if (typeof raw === 'number') {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  return rows
    .filter((row) => row['CONTRATISTA'])
    .map((row) => {
      const solicitudDate = parseExcelDate(row['SOLICITUD']);
      const fechaVencimientoSagrilaft = solicitudDate ? new Date(solicitudDate.getTime() + 365 * 24 * 60 * 60 * 1000) : null;

      return {
        razonSocial: String(row['CONTRATISTA'] ?? '').trim(),
        tipoContrato: String(row['AREA'] ?? '').trim().toUpperCase(),
        // La hoja renombró estas columnas a "DD" y "AC" -- se mantiene el
        // nombre viejo como respaldo por si se vuelve a renombrar (mismo
        // gotcha ya pisado una vez en la app original).
        aprobadoDD: Boolean(row['DD'] ?? row['DEBIDA DILIGENCIA']),
        confidencialidad: Boolean(row['AC'] ?? row['CONFIDENCIALIDAD']),
        fechaVencimientoSagrilaft,
      };
    });
}

// OJO: no se usa Tercero.upsert() a secas -- ese método aplica el MISMO
// objeto de valores tanto al crear como al actualizar, y el `nit` solo debe
// escribirse al CREAR (ver create() en tercero.service.js, y el mismo
// comportamiento en el upsert de Prisma original). Si el update tocara
// `nit`, cada sync volvería a "" el NIT que alguien ya haya completado a
// mano -- por eso acá se resuelve a mano: find -> update (sin nit) | create
// (con nit: "").
async function upsertTerceros(rows) {
  const resultados = await Promise.allSettled(
    rows.map(async (row) => {
      const existente = await Tercero.findOne({ where: { razon_social: row.razonSocial } });
      const camposSync = {
        tipo_contrato: row.tipoContrato,
        aprobado_debida_diligencia: row.aprobadoDD,
        confidencialidad: row.confidencialidad,
        fecha_vencimiento_sagrilaft: row.fechaVencimientoSagrilaft,
      };
      if (existente) return existente.update(camposSync);
      return Tercero.create({ razon_social: row.razonSocial, nit: '', ...camposSync });
    })
  );
  const errores = resultados.filter((r) => r.status === 'rejected').length;
  return { total: rows.length, errors: errores };
}

const sincronizar = asyncHandler(async (req, res) => {
  let stats;
  try {
    const token = await getAccessToken();
    const siteId = await getSiteId(token);
    const buffer = await downloadExcel(token, siteId);
    const rows = parseExcel(buffer);
    stats = await upsertTerceros(rows);
  } catch (error) {
    console.error('[sync-sharepoint]', error);
    throw new ApiError(500, String(error));
  }
  ok(res, { message: `Sincronizados ${stats.total - stats.errors} registros. Errores: ${stats.errors}.`, ...stats });
});

module.exports = { sincronizar };
