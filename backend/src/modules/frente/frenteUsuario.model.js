// Puerto de `model FrenteUsuario` (schema.prisma) -- tabla puente explícita
// (PK compuesta usuario_id+frente_id), no un `belongsToMany` implícito con
// tabla auto-generada, para que la relación pueda inspeccionarse/borrarse
// directamente si algún módulo futuro lo necesita.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const FrenteUsuario = sequelize.define(
  'FrenteUsuario',
  {
    usuario_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    frente_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    // Directa e Indirecta tienen su propia lista de personas por frente (2026-11-20).
    categoria: { type: DataTypes.STRING(20), primaryKey: true, allowNull: false, defaultValue: 'INDIRECTA' },
  },
  { tableName: 'frente_usuarios', underscored: true, timestamps: false }
);

FrenteUsuario.associate = (models) => {
  FrenteUsuario.belongsTo(models.Usuario, { foreignKey: 'usuario_id' });
  FrenteUsuario.belongsTo(models.Frente, { foreignKey: 'frente_id' });
};

module.exports = FrenteUsuario;
