'use strict';

// Directa, 2026-11-20 (pedido explícito del usuario): en el paso "Compras y Contrataciones" (PENDIENTE_GERENTE_COMPRAS),
// además de la firma del Gerente de Compras, un revisor (Anabela Salazar) da su concepto OK / No OK con una nota. Es solo
// una opinión visible para el Gerente: no bloquea, no devuelve ni hace avanzar la solicitud.
//   - aprobador_frentes.revisor_compras: slot configurable por frente (mismo patrón que gerente_compras).
//   - solicitudes: snapshot del responsable + el último concepto dado (prevalece el último; el historial guarda cada cambio).
// Además asigna a Anabela como revisora en todas las configuraciones de frente de Directa que ya existen.
const NOMBRE_REVISORA = 'Anabela Salazar';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('aprobador_frentes', 'revisor_compras', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: { usuarios: [], roles: [] },
    });
    await queryInterface.addColumn('solicitudes', 'responsable_revisor_compras_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('solicitudes', 'concepto_compras', { type: Sequelize.STRING(10), allowNull: true });
    await queryInterface.addColumn('solicitudes', 'nota_concepto_compras', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('solicitudes', 'fecha_concepto_compras', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('solicitudes', 'concepto_compras_por', { type: Sequelize.STRING(150), allowNull: true });

    // Idempotente: solo asigna si hay UNA coincidencia exacta de usuario activo; si no, deja los slots vacíos para
    // configurarlos a mano en Configuración > Frentes.
    const [usuarios] = await queryInterface.sequelize.query(`SELECT id FROM usuarios WHERE activo = true AND nombre ILIKE :nombre`, {
      replacements: { nombre: `${NOMBRE_REVISORA}%` },
    });
    if (usuarios.length !== 1) {
      console.warn(`[revisor_compras] No se asignó a ${NOMBRE_REVISORA}: se encontraron ${usuarios.length} usuarios activos con ese nombre.`);
      return;
    }
    const slot = JSON.stringify({ usuarios: [usuarios[0].id], roles: [] });
    await queryInterface.sequelize.query(`UPDATE aprobador_frentes SET revisor_compras = CAST(:slot AS jsonb) WHERE categoria = 'DIRECTA'`, {
      replacements: { slot },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('solicitudes', 'concepto_compras_por');
    await queryInterface.removeColumn('solicitudes', 'fecha_concepto_compras');
    await queryInterface.removeColumn('solicitudes', 'nota_concepto_compras');
    await queryInterface.removeColumn('solicitudes', 'concepto_compras');
    await queryInterface.removeColumn('solicitudes', 'responsable_revisor_compras_id');
    await queryInterface.removeColumn('aprobador_frentes', 'revisor_compras');
  },
};
