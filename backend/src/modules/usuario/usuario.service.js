// PLANTILLA -- base copiable, va en backend/src/modules/usuario/usuario.service.js.
// Sin auto-registro a propósito: solo un admin crea usuarios (`create`). Nunca
// expone `hashed_password` en la respuesta (`_enrich`).
const ApiError = require('../../utils/ApiError');
const { hashPassword } = require('../../utils/security');
const { generateRandomPassword } = require('../../utils/passwordRules');
const { getRolesFuncionalidades, getRolesPorCodigo } = require('../../utils/permisos');
const Usuario = require('./usuario.model');

function _enrich(usuario) {
  const data = usuario.toJSON();
  delete data.hashed_password;
  return data;
}

// El frontend tiene su propio `tienePermiso` (no puede importar código del
// backend), pero hasta ahora siempre lo evaluaba contra el mapa hardcodeado
// FUNCIONALIDADES_POR_ROL -- nunca contra la tabla Rol real. Si un admin
// personalizaba un rol desde RolDetallePage, el backend respetaba el cambio
// (getRolesFuncionalidades() lee la tabla) pero el sidebar/los botones del
// frontend seguían mostrando lo que el mapa hardcodeado decía por default --
// dos fuentes de verdad desincronizadas. Iba `funcionalidadesPorRol` acá para
// que el frontend evalúe exactamente lo mismo que el backend.
async function getMe(usuario) {
  const data = _enrich(usuario);
  data.funcionalidadesPorRol = await getRolesFuncionalidades();
  // 2026-09-18: mismo motivo que funcionalidadesPorRol -- el frontend tiene
  // sus propios chequeos de rol por nombre (ej. SolicitudForm.jsx,
  // FrenteDetallePage.jsx) que dejan de matchear en silencio si un admin
  // renombra ese rol. `rolesPorCodigo` resuelve el nombre ACTUAL de un rol
  // contra su código estable -- ver utils/permisos.js#getRolesPorCodigo.
  data.rolesPorCodigo = await getRolesPorCodigo();
  // `usuario.esAdmin` lo resuelve requireAuth contra roles.es_admin (ver
  // middlewares/auth.js) -- toJSON() de _enrich no lo trae porque no es una
  // columna del modelo Usuario, hay que copiarlo aparte. El frontend lo usa
  // en vez de `roles.includes('ADMIN')` para que renombrar ese rol no le
  // quite acceso a nadie (pedido explicito del usuario, 2026-09-18).
  data.esAdmin = usuario.esAdmin;
  return data;
}

async function list() {
  const usuarios = await Usuario.findAll({ order: [['nombre', 'ASC']] });
  return usuarios.map(_enrich);
}

async function create(data) {
  const existente = await Usuario.findOne({ where: { email: data.email.toLowerCase() } });
  if (existente) throw new ApiError(400, 'Ya existe un usuario con este email');

  // Sin login por contraseña (2026-11-18): la columna es NOT NULL, así que se guarda el hash de una clave aleatoria que
  // nadie conoce; el ingreso es solo por Microsoft (ver auth.azure.js).
  const usuario = await Usuario.create({
    email: data.email,
    nombre: data.nombre,
    hashed_password: await hashPassword(generateRandomPassword()),
    roles: data.roles,
    funcionalidades_adicionales: data.funcionalidades_adicionales ?? [],
    cargo: data.cargo ?? null,
    telefono: data.telefono ?? null,
    activo: true,
  });
  return getById(usuario.id);
}

async function getById(id) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  return _enrich(usuario);
}

async function update(id, data) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');

  const values = {};
  if (data.nombre !== undefined) values.nombre = data.nombre;
  if (data.roles !== undefined) values.roles = data.roles;
  if (data.funcionalidades_adicionales !== undefined) values.funcionalidades_adicionales = data.funcionalidades_adicionales;
  if (data.cargo !== undefined) values.cargo = data.cargo;
  if (data.telefono !== undefined) values.telefono = data.telefono;
  if (data.activo !== undefined) values.activo = data.activo;

  if (Object.keys(values).length > 0) await usuario.update(values);
  return getById(id);
}

// Soft delete -- nunca elimina fisicamente. No permite auto-desactivacion (el
// admin perderia acceso inmediatamente).
async function remove(id, solicitanteId) {
  if (Number(id) === Number(solicitanteId)) throw new ApiError(400, 'No puedes desactivarte a ti mismo');
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  await usuario.update({ activo: false });
}

// Eliminacion fisica real, distinta del soft delete de remove(). Solo cuentas ya inactivas (nunca una activa)
// y nunca la propia. Si la cuenta tiene registros asociados (solicitudes, historial, notificaciones...) la base
// rechaza el borrado por llave foranea: se responde 409 y la cuenta se conserva inactiva, que es lo correcto
// para no perder la trazabilidad de quien hizo que.
async function removeDefinitivo(id, solicitanteId) {
  if (Number(id) === Number(solicitanteId)) throw new ApiError(400, 'No puedes eliminarte a ti mismo');
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  if (usuario.activo) throw new ApiError(400, 'El usuario debe estar inactivo antes de poder eliminarlo');
  try {
    await usuario.destroy();
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      throw new ApiError(409, 'No se puede eliminar: la cuenta tiene solicitudes o registros asociados. Déjala inactiva.');
    }
    throw err;
  }
}

// ── Vinculación de cuenta Microsoft (usada por modules/auth/auth.azure.js) ──

async function buscarPorMicrosoftId(microsoftId) {
  return Usuario.findOne({ where: { microsoft_id: microsoftId } });
}

async function vincularMicrosoft(usuarioId, microsoftId, microsoftEmail) {
  const yaVinculada = await Usuario.findOne({ where: { microsoft_id: microsoftId } });
  if (yaVinculada && yaVinculada.id !== Number(usuarioId)) {
    throw new ApiError(409, 'Esta cuenta de Microsoft ya está vinculada a otro usuario.');
  }
  const usuario = await Usuario.findByPk(usuarioId);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  await usuario.update({ microsoft_id: microsoftId, microsoft_email: microsoftEmail?.toLowerCase() ?? null });
  return _enrich(usuario);
}

async function desvincularMicrosoft(usuarioId) {
  const usuario = await Usuario.findByPk(usuarioId);
  if (!usuario) throw new ApiError(404, 'Usuario no encontrado');
  await usuario.update({ microsoft_id: null, microsoft_email: null });
  return _enrich(usuario);
}

async function registrarConexion(usuario) {
  // No bloquea el login si falla -- ver el mismo criterio en auth.service.js.
  try {
    await usuario.update({ ultima_conexion: new Date() });
  } catch {
    // ignorar errores de registro de conexión
  }
}

// Acciones masivas sobre varias cuentas desde la lista de Usuarios. La cuenta de quien ejecuta la
// accion nunca se toca.
async function accionMasiva({ ids, accion }, actorId) {
  const unicos = [...new Set(ids)];
  const usuarios = await Usuario.findAll({ where: { id: unicos } });
  const encontrados = new Map(usuarios.map((u) => [u.id, u]));
  const omitidos = [];
  const objetivo = [];
  for (const id of unicos) {
    const usuario = encontrados.get(id);
    if (!usuario) omitidos.push({ id, motivo: 'No existe' });
    else if (id === Number(actorId)) omitidos.push({ id, email: usuario.email, motivo: 'Es tu propia cuenta' });
    else objetivo.push(usuario);
  }

  const activo = accion === 'activar';
  for (const usuario of objetivo) await usuario.update({ activo });
  return { procesados: objetivo.length, omitidos };
}

module.exports = {
  accionMasiva,
  getMe,
  list,
  create,
  getById,
  update,
  remove,
  removeDefinitivo,
  buscarPorMicrosoftId,
  vincularMicrosoft,
  desvincularMicrosoft,
  registrarConexion,
};
