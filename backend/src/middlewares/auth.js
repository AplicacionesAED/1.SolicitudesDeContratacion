// requireAuth va PRIMERO en toda ruta protegida (incluidas las de solo
// lectura). requireAdmin/requirePermiso van DESPUÉS, solo en
// escrituras/rutas restringidas. El rol/los permisos SIEMPRE se re-leen de la
// BD en requireAuth (nunca del claim del JWT), así un token manipulado no
// puede escalar privilegios -- ver createAccessToken en utils/security.js.
const { Op } = require('sequelize');
const { decodeToken, ACCESS_COOKIE_NAME } = require('../utils/security');
const portalAuth = require('../utils/portalAuth');
const { tienePermiso, getRolesFuncionalidades } = require('../utils/permisos');
const ApiError = require('../utils/ApiError');
const Usuario = require('../modules/usuario/usuario.model');
const Rol = require('../modules/rol/rol.model');

// `esAdmin` se resuelve UNA VEZ por request aca, no por el string 'ADMIN' en
// usuario.roles -- pedido explicito del usuario (2026-09-18): poder
// renombrar el rol ADMIN sin que eso rompa el acceso de administrador de
// nadie. Se calcula contra `roles.es_admin` (flag ligado a la fila/id, ver
// rol.model.js), y se cuelga en `req.usuario.esAdmin` (propiedad plana, no
// persistida) para que requireAdmin y cualquier modulo que reciba este mismo
// `usuario`/`req.usuario` (solicitud.*, dashboard, presence, tercero.*) lo
// lean de forma sincrona sin tener que repetir esta consulta.
// Nombre de esta app en el portal (el portal le da acceso a la gente con este nombre).
const APP_PORTAL = 'solicitudes';

async function cargarEsAdmin(usuario) {
  const rolesAdmin = await Rol.findAll({ where: { es_admin: true }, attributes: ['nombre'] });
  const nombresAdmin = rolesAdmin.map((r) => r.nombre);
  usuario.esAdmin = (usuario.roles ?? []).some((r) => nombresAdmin.includes(r));
}

// Con el portal activo (PORTAL_AUTH=optional|required) la identidad sale de la sesion del portal: aqui solo se busca a la persona por su
// correo y se le aplican los roles y permisos de esta app (que siguen siendo de Solicitudes). `optional` cae al login propio si no hay
// sesion del portal; `required` no.
async function requireAuth(req, res, next) {
  const modo = portalAuth.modo();
  if (modo !== 'off') {
    const sesion = await portalAuth.resolverSesion(req, APP_PORTAL);
    const usuarioPortal =
      sesion.estado === 'ok'
        ? await Usuario.findOne({ where: { [Op.or]: [{ email: sesion.email }, { microsoft_email: sesion.email }], activo: true } })
        : null;
    if (usuarioPortal) {
      await cargarEsAdmin(usuarioPortal);
      req.usuario = usuarioPortal;
      return next();
    }

    // Sin entrar por el portal: en `optional`, quien ya tiene su sesion propia sigue con ella (que el portal no le de la app no debe
    // sacarlo de lo que ya usa durante la transicion); en `required` no hay otra puerta.
    const conSesionPropia = modo === 'optional' && Boolean(req.cookies?.[ACCESS_COOKIE_NAME]);
    if (!conSesionPropia) {
      if (sesion.estado === 'cambiar-password') return next(new ApiError(403, 'Debes cambiar tu contraseña en el portal antes de continuar'));
      if (sesion.estado === 'sin-acceso') return next(new ApiError(403, 'El portal no te da acceso a Solicitudes de Contratación. Pide acceso a TI.'));
      if (sesion.estado === 'ok') return next(new ApiError(403, 'Tienes acceso en el portal, pero aún no existe un usuario de Solicitudes para tu correo. Pide a un administrador que lo cree.'));
      return next(new ApiError(401, 'No autenticado'));
    }
  }

  const token = req.cookies?.[ACCESS_COOKIE_NAME];
  if (!token) return next(new ApiError(401, 'No autenticado'));

  let payload;
  try {
    payload = decodeToken(token);
  } catch {
    return next(new ApiError(401, 'Token invalido o expirado'));
  }
  if (payload.type !== 'access') return next(new ApiError(401, 'Token invalido'));

  const usuario = await Usuario.findOne({ where: { email: payload.sub, activo: true } });
  if (!usuario) return next(new ApiError(401, 'Usuario no encontrado'));

  await cargarEsAdmin(usuario);

  req.usuario = usuario;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.usuario?.esAdmin) {
    return next(new ApiError(403, 'Acceso restringido a administradores'));
  }
  next();
}

// Exige que el usuario tenga AL MENOS UNO de los slugs dados -- vía su rol
// (tabla Rol, con fallback a FUNCIONALIDADES_POR_ROL) o vía
// funcionalidadesAdicionales concedidas a mano. ADMIN siempre pasa (ver
// tienePermiso). Uso: requirePermiso('gestionar_especialidades') o
// requirePermiso(['slug_a', 'slug_b']) -- ojo con Solicitudes: desde
// "desglose ver/crear" (2026-09-02) listar depende de `ver_solicitudes_
// directas`/`_indirectas` y crear/enviar de `crear_solicitudes_directas`/
// `_indirectas`, ambos resueltos dinámicamente contra `solicitud.categoria`
// -- ver solicitud.autorizacion.js#tieneVerSolicitudes/tieneCrearSolicitudes)
// y aprobar ya NO depende de ningún slug de rol, se resuelve 100% contra
// AprobadorFrente -- nunca
// gatear una ruta de acción de Solicitud con requirePermiso.
function requirePermiso(slugs) {
  const requeridos = Array.isArray(slugs) ? slugs : [slugs];
  return async (req, res, next) => {
    const roles = req.usuario?.roles ?? [];
    const funcionalidadesAdicionales = req.usuario?.funcionalidades_adicionales ?? [];
    const funcionalidadesPorRol = await getRolesFuncionalidades();
    const tiene = requeridos.some((slug) => tienePermiso(roles, funcionalidadesAdicionales, slug, funcionalidadesPorRol, req.usuario?.esAdmin));
    if (!tiene) return next(new ApiError(403, 'No tienes permiso para realizar esta acción'));
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requirePermiso };
