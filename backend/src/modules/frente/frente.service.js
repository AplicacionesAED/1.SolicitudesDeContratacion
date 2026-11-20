const ApiError = require('../../utils/ApiError');
const sequelize = require('../../config/db');
const Frente = require('./frente.model');
const FrenteUsuario = require('./frenteUsuario.model');
const Proyecto = require('../proyecto/proyecto.model');
const Usuario = require('../usuario/usuario.model');

async function list({ proyectoId } = {}) {
  const frentes = await Frente.findAll({
    where: proyectoId ? { proyecto_id: proyectoId } : {},
    include: [{ model: Proyecto, as: 'proyecto', attributes: ['id', 'nombre'] }],
    order: [['nombre', 'ASC']],
  });
  // Solo los IDs -- el wizard de Solicitudes filtra a "mis frentes asignados" en el cliente, mismo criterio que el original.
  // Directa e Indirecta tienen su propia lista de personas por frente (2026-11-20): `usuarioIdsPorCategoria` las separa y
  // `usuarioIds` queda como la unión de las dos.
  const asignaciones = await FrenteUsuario.findAll({ where: { frente_id: frentes.map((f) => f.id) }, attributes: ['frente_id', 'usuario_id', 'categoria'], raw: true });
  return frentes.map((f) => {
    const json = f.toJSON();
    const propias = asignaciones.filter((a) => a.frente_id === f.id);
    json.usuarioIdsPorCategoria = {
      DIRECTA: propias.filter((a) => a.categoria === 'DIRECTA').map((a) => a.usuario_id),
      INDIRECTA: propias.filter((a) => a.categoria === 'INDIRECTA').map((a) => a.usuario_id),
    };
    json.usuarioIds = [...new Set(propias.map((a) => a.usuario_id))];
    return json;
  });
}

async function getById(id) {
  const frente = await Frente.findByPk(id, { include: [{ model: Proyecto, as: 'proyecto', attributes: ['id', 'nombre'] }] });
  if (!frente) throw new ApiError(404, 'Frente no encontrado');
  const json = frente.toJSON();
  json.asignaciones = await FrenteUsuario.findAll({ where: { frente_id: id }, attributes: ['usuario_id', 'categoria'], raw: true });
  const ids = [...new Set(json.asignaciones.map((a) => a.usuario_id))];
  json.usuarios = ids.length ? await Usuario.findAll({ where: { id: ids }, attributes: ['id', 'nombre', 'email', 'roles'], raw: true }) : [];
  return json;
}

async function create(data) {
  return Frente.create(data);
}

async function update(id, data) {
  const frente = await Frente.findByPk(id);
  if (!frente) throw new ApiError(404, 'Frente no encontrado');
  await frente.update(data);
  return frente;
}

// Reemplaza TODA la asignación de usuarios de un frente PARA ESA CATEGORÍA por la lista dada -- más simple que un diff
// add/remove, y el volumen (unos pocos usuarios por frente) no justifica la complejidad de un diff.
async function setUsuarios(frenteId, usuarioIds, categoria) {
  const frente = await Frente.findByPk(frenteId);
  if (!frente) throw new ApiError(404, 'Frente no encontrado');

  await sequelize.transaction(async (transaction) => {
    await FrenteUsuario.destroy({ where: { frente_id: frenteId, categoria }, transaction });
    if (usuarioIds.length > 0) {
      await FrenteUsuario.bulkCreate(
        usuarioIds.map((usuarioId) => ({ frente_id: frenteId, usuario_id: usuarioId, categoria })),
        { transaction }
      );
    }
  });

  return getById(frenteId);
}

module.exports = { list, getById, create, update, setUsuarios };
