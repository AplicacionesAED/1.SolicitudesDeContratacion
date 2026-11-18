// Adaptado de la plantilla -- puerto de authorize()/jwt()/session() de
// src/lib/auth.ts (app Next.js original): roles como array,
// funcionalidades_adicionales en el perfil devuelto. Desde 2026-11-18 ya no hay login por contraseña (ni
// MASTER_KEY_HASH): el ingreso es solo por Microsoft, ver auth.azure.js.
const ApiError = require('../../utils/ApiError');
const { createAccessToken, createRefreshToken, decodeToken } = require('../../utils/security');
const Usuario = require('../usuario/usuario.model');

function _perfil(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    roles: usuario.roles,
    funcionalidades_adicionales: usuario.funcionalidades_adicionales,
    cargo: usuario.cargo,
    telefono: usuario.telefono,
    debe_cambiar_password: usuario.debe_cambiar_password,
  };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw new ApiError(401, 'No autenticado');

  let payload;
  try {
    payload = decodeToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Token inválido o expirado');
  }
  if (payload.type !== 'refresh') throw new ApiError(401, 'Token inválido');

  const usuario = await Usuario.findOne({ where: { email: payload.sub, activo: true } });
  if (!usuario) throw new ApiError(401, 'Usuario no encontrado');

  return { accessToken: createAccessToken(usuario.email, usuario.roles) };
}

module.exports = { refresh, _perfil };
