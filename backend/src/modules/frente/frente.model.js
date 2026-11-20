// Puerto de `model Frente` (schema.prisma).
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Frente = sequelize.define(
  'Frente',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    etapa: { type: DataTypes.INTEGER, allowNull: true },
    proyecto_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'frentes', underscored: true, createdAt: 'creado_en', updatedAt: 'actualizado_en' }
);

Frente.associate = (models) => {
  Frente.belongsTo(models.Proyecto, { foreignKey: 'proyecto_id', as: 'proyecto' });
  Frente.hasMany(models.FrenteUsuario, { foreignKey: 'frente_id', as: 'asignaciones' });
  Frente.hasOne(models.AprobadorFrente, { foreignKey: 'frente_id', as: 'aprobadorConfig' });
};

module.exports = Frente;
