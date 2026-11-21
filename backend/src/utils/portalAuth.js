// Verificacion de la sesion del portal (servicio portal-auth) para el backend de cada app de AED.
// COPIA IDENTICA en cada app (backend/src/utils/portalAuth.js): la fuente es 0. PLATAFORMA AED/auth/cliente/portalAuth.js, con sus
// pruebas en auth/test/cliente.test.js. No se edita por app: un cambio se hace aqui y se vuelve a copiar.
//
// El portal firma la sesion (cookie `portal_session`, JWT RS256) con su llave privada; la app la verifica con la llave PUBLICA que el
// portal publica en su JWKS, asi la app no guarda ningun secreto con el que se pudieran falsificar sesiones. Este modulo solo dice
// QUIEN es la persona y si el portal le da acceso a esta app; los roles y permisos dentro de la app siguen siendo de la app.
//
// Interruptor por app (variable PORTAL_AUTH): `off` (por defecto) ignora el portal; `optional` acepta la sesion del portal y, si no hay,
// deja pasar al login propio de la app; `required` exige la del portal. Volver a `off` es el plan de reversa.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE_SESION = 'portal_session';
const ISSUER = 'portal.aed-it.com';
const AUDIENCE = 'aed-apps';
const MODOS = ['off', 'optional', 'required'];
const JWKS_TTL_MS = 10 * 60 * 1000;
// Un `kid` desconocido provoca releer el JWKS (rotacion de llave); este minimo evita martillar al portal si llegan tokens inventados.
const JWKS_MIN_REINTENTO_MS = 30 * 1000;

function modo() {
  const valor = String(process.env.PORTAL_AUTH ?? 'off').trim().toLowerCase();
  if (MODOS.includes(valor)) return valor;
  console.error(`[portalAuth] PORTAL_AUTH="${valor}" no es valido (off | optional | required): se usa "off".`); // eslint-disable-line no-console
  return 'off';
}

const urlJwks = () => process.env.PORTAL_JWKS_URL || 'https://portal.aed-it.com/portal/api/.well-known/jwks.json';

let cache = { llaves: new Map(), cargadoEn: 0, intentoEn: 0 };

async function cargarLlaves() {
  cache.intentoEn = Date.now();
  const res = await fetch(urlJwks(), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`el portal respondio ${res.status}`);
  const { keys } = await res.json();
  const llaves = new Map();
  for (const jwk of keys ?? []) {
    if (jwk.kty === 'RSA' && jwk.kid) llaves.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
  }
  cache = { llaves, cargadoEn: Date.now(), intentoEn: Date.now() };
}

async function llavePara(kid) {
  const vencida = Date.now() - cache.cargadoEn > JWKS_TTL_MS;
  const desconocida = !cache.llaves.has(kid);
  if ((vencida || desconocida) && Date.now() - cache.intentoEn > JWKS_MIN_REINTENTO_MS) {
    try {
      await cargarLlaves();
    } catch (err) {
      console.error('[portalAuth] no se pudo leer el JWKS del portal:', err.message); // eslint-disable-line no-console
    }
  }
  return cache.llaves.get(kid) ?? null;
}

// Resuelve la sesion del portal de una peticion para la app `slug` (el nombre de la app en el portal: cartera, siger...).
//   { estado: 'sin-sesion' }                      no hay cookie, o no es valida (firma, emisor, audiencia o vencida)
//   { estado: 'cambiar-password', email }         el portal exige que cambie su contraseña antes de entrar a cualquier app
//   { estado: 'sin-acceso', email }               sesion valida, pero el portal no le da acceso a esta app
//   { estado: 'ok', email, nombre }               puede entrar; `email` (en minusculas) es la llave para buscar al usuario local
// Un acceso quitado en el portal deja de valer al vencer el token (60 min), cuando la sesion se renueva con los datos nuevos.
async function resolverSesion(req, slug) {
  const token = req.cookies?.[COOKIE_SESION];
  if (!token) return { estado: 'sin-sesion' };

  // Una cookie del portal que llega pero se rechaza deja su motivo en el log (sin datos de la persona): sin esto un fallo de verificacion
  // seria indistinguible de "no ha iniciado sesion". Un token vencido es normal (la app renueva y reintenta), por eso no se registra.
  const rechazar = (motivo) => {
    console.warn(`[portalAuth] sesion del portal rechazada: ${motivo}`); // eslint-disable-line no-console
    return { estado: 'sin-sesion' };
  };

  let payload;
  try {
    const kid = jwt.decode(token, { complete: true })?.header?.kid;
    if (!kid) return rechazar('el token no trae kid');
    const llave = await llavePara(kid);
    if (!llave) return rechazar(`no hay llave publica para el kid "${kid}" (JWKS no disponible o llave rotada)`);
    payload = jwt.verify(token, llave, { algorithms: ['RS256'], issuer: ISSUER, audience: AUDIENCE });
  } catch (err) {
    return err.name === 'TokenExpiredError' ? { estado: 'sin-sesion' } : rechazar(err.message);
  }
  if (payload.type !== 'access' || typeof payload.email !== 'string') return rechazar('el token no es de acceso o no trae correo');

  const email = payload.email.toLowerCase();
  if (payload.cpw) return { estado: 'cambiar-password', email };
  if (!Array.isArray(payload.apps) || !payload.apps.includes(slug)) return { estado: 'sin-acceso', email };
  return { estado: 'ok', email, nombre: payload.nombre };
}

// Solo para pruebas.
const _reiniciarCache = () => {
  cache = { llaves: new Map(), cargadoEn: 0, intentoEn: 0 };
};

module.exports = { COOKIE_SESION, modo, resolverSesion, _reiniciarCache };
