// Puerto de `model AprobadorFrente` (schema.prisma), reshapeado para
// eliminar los permisos de rol de solicitudes (2026-09-02): cada "rol de
// responsabilidad" por frente+categoría ya no es un array plano de IDs --
// es `{ usuarios: [ids], roles: [nombresDeRol] }`. Un usuario califica si
// está en `usuarios` O si alguno de sus roles está en `roles` -- ver
// solicitud.estado.js#usuarioAutorizadoParaSlot. `director_tecnico`/
// `controles_adpro` son nuevos (antes hardcodeados por rol de sistema sin
// ningún alcance por frente); sus roles vienen sembrados con
// ['DIRECTOR_TECNICO']/['CONTROLES'] para no cambiar el comportamiento
// actual el día del deploy -- ver 20260831000510-reshape-aprobador-frente.js.
//
// 2026-09-18: esos 2 defaults NO pueden seguir siendo el string literal
// 'DIRECTOR_TECNICO'/'CONTROLES' -- un `defaultValue` de Sequelize es
// síncrono (no puede consultar la BD), así que si un admin renombra esos
// roles, un Frente NUEVO seguiría sembrándose con el nombre VIEJO,
// sordo al rename. La resolución dinámica (contra el nombre ACTUAL del
// rol, vía su código estable) vive en aprobadorFrente.service.js#getByFrenteId
// -- acá los defaults son solo un slot vacío, igual que los demás, como
// red de seguridad si algo crea una fila sin pasar por ese service.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const SLOT_VACIO = () => ({ usuarios: [], roles: [] });

const AprobadorFrente = sequelize.define(
  'AprobadorFrente',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    frente_id: { type: DataTypes.INTEGER, allowNull: false },
    categoria: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'INDIRECTA' },
    director_proyecto: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    contratos_tramite: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    contratos_minuta: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    director_controles: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    director_tecnico: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    controles_adpro: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    // Flujo propio de Directa (Orden de Servicio), 2026-09-18 -- ver
    // solicitud.autorizacion.js. Sin rol de sistema pre-cargado en el
    // default (a diferencia de director_tecnico/controles_adpro, que sí lo
    // tenían para no cambiar comportamiento YA existente) -- acá no hay
    // comportamiento previo que preservar, es 100% nuevo.
    controles_proyeccion: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    residente_administrativo: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    controles_aprobacion_final: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    // "Director de Obra" -- confirmado con el usuario que es un rol/slot
    // DISTINTO de director_proyecto (dos personas posibles por frente), no
    // una etiqueta alternativa del mismo. Reemplaza a director_proyecto
    // como quien aprueba la solicitud en Directa.
    director_obra: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    // Paso nuevo AL FINAL del flujo Directa, 2026-10-09 -- aprueba después
    // de Director/a de Controles (controles_aprobacion_final), antes de
    // COMPLETADA. Sin rol de sistema precargado, mismo criterio que
    // controles_proyeccion/residente_administrativo (100% nuevo, sin
    // comportamiento previo que preservar).
    gerente_compras: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
    // Revisor de "Compras y Contrataciones" (2026-11-20): da un concepto OK / No OK visible para el Gerente de Compras,
    // sin bloquear ni mover la solicitud.
    revisor_compras: { type: DataTypes.JSONB, allowNull: false, defaultValue: SLOT_VACIO },
  },
  {
    tableName: 'aprobador_frentes',
    underscored: true,
    createdAt: 'creado_en',
    updatedAt: 'actualizado_en',
    indexes: [{ unique: true, fields: ['frente_id', 'categoria'] }],
  }
);

AprobadorFrente.associate = (models) => {
  AprobadorFrente.belongsTo(models.Frente, { foreignKey: 'frente_id' });
};

module.exports = AprobadorFrente;
