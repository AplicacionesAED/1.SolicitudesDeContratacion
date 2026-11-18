// PLANTILLA -- copiado tal cual salvo el prefijo de las cookies. Va en
// backend/src/utils/security.js del proyecto nuevo. El resto no cambia por
// proyecto -- JWT en cookies httpOnly, bcrypt para contraseñas. Ver la regla
// "Login y autenticación" y "Nombres de cookie por proyecto" en
// ARQUITECTURA-BACKEND.md.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRE_HOURS = 24;
const REFRESH_TOKEN_EXPIRE_DAYS = 30;
const SECRET_KEY_EJEMPLO = 'CAMBIAR-EN-PRODUCCION';

if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET ?? SECRET_KEY_EJEMPLO) === SECRET_KEY_EJEMPLO) {
  throw new Error('JWT_SECRET sigue en su valor de ejemplo con NODE_ENV=production. Define uno real antes de desplegar.');
}

const SECRET_KEY = process.env.JWT_SECRET ?? SECRET_KEY_EJEMPLO;

// Prefijadas con "<proyecto>_" a proposito -- las cookies del navegador se
// comparten por host, NO por puerto: dos proyectos de esta plantilla corriendo
// en localhost en puertos distintos verían las cookies del otro si ambos
// usaran "access_token"/"refresh_token" a secas, y cerrar sesión en uno
// borraría la cookie de sesión del otro (bug real, encontrado y corregido en
// HRMS aed / BASES-AED 2026-08-27). Reemplaza <PROYECTO> por un prefijo corto
// y único de este proyecto (ej. "hrms", "scp_bases") al copiar este archivo.
const ACCESS_COOKIE_NAME = 'solind_access_token';
const REFRESH_COOKIE_NAME = 'solind_refresh_token';
// Cookie de corta vida (5 min) que marca "el próximo login de Microsoft es
// para VINCULAR una cuenta ya logueada, no para iniciar sesión" -- puesta por
// GET /auth/azure/link, leída y borrada por GET /auth/azure/callback. Puerto
// del `ms_link_intent` que la app Next.js original guardaba como cookie de
// next-auth.
const MS_LINK_INTENT_COOKIE_NAME = 'solind_ms_link_intent';

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// `roles` (array) va en el claim solo a título informativo -- requireAuth
// SIEMPRE re-lee los roles reales desde la BD, nunca confía en este claim
// (así un token manipulado no puede escalar privilegios).
function createAccessToken(subject, roles) {
  return jwt.sign({ sub: subject, roles, type: 'access' }, SECRET_KEY, { algorithm: ALGORITHM, expiresIn: `${ACCESS_TOKEN_EXPIRE_HOURS}h` });
}

function createRefreshToken(subject) {
  return jwt.sign({ sub: subject, type: 'refresh' }, SECRET_KEY, { algorithm: ALGORITHM, expiresIn: `${REFRESH_TOKEN_EXPIRE_DAYS}d` });
}

// Lanza si el token es invalido/expirado.
function decodeToken(token) {
  return jwt.verify(token, SECRET_KEY, { algorithms: [ALGORITHM] });
}

module.exports = {
  ACCESS_TOKEN_EXPIRE_HOURS,
  REFRESH_TOKEN_EXPIRE_DAYS,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  MS_LINK_INTENT_COOKIE_NAME,
  hashPassword,
  createAccessToken,
  createRefreshToken,
  decodeToken,
};
