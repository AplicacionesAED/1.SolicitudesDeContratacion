'use strict';

// 2026-11-20 (pedido explícito del usuario): las personas asignadas a un frente pasan a ser INDEPENDIENTES entre Directa e
// Indirecta (antes una sola lista por frente valía para las dos). Se agrega `categoria` a la llave de frente_usuarios: lo que
// ya existe queda como INDIRECTA (sin cambios para ese flujo) y Directa se arma aparte (ver scripts/cargarResponsablesDirecta.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('frente_usuarios', 'categoria', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'INDIRECTA',
    });
    await queryInterface.sequelize.query('ALTER TABLE frente_usuarios DROP CONSTRAINT frente_usuarios_pkey');
    await queryInterface.sequelize.query('ALTER TABLE frente_usuarios ADD PRIMARY KEY (usuario_id, frente_id, categoria)');
  },

  async down(queryInterface) {
    // Vuelve a una asignación única por (usuario, frente): las filas de DIRECTA que dupliquen una de INDIRECTA se descartan.
    await queryInterface.sequelize.query(`DELETE FROM frente_usuarios WHERE categoria = 'DIRECTA'`);
    await queryInterface.sequelize.query('ALTER TABLE frente_usuarios DROP CONSTRAINT frente_usuarios_pkey');
    await queryInterface.removeColumn('frente_usuarios', 'categoria');
    await queryInterface.sequelize.query('ALTER TABLE frente_usuarios ADD PRIMARY KEY (usuario_id, frente_id)');
  },
};
