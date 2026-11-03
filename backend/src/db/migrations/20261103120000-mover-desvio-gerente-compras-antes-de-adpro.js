'use strict';

// Flujo propio de Directa, 2026-11-03 -- la firma del Gerente de Compras pasa de ser el ÚLTIMO paso (después de la
// aprobación de Director/a de Controles) a ir ANTES del Residente Administrativo — Adpro: Elaboración de Orden ->
// Firma Gerente de Compras -> Adpro -> Aprobación Director/a de Controles -> Completada. Sigue resolviéndose con el
// mecanismo de desvíos (workflow_desvios): el desvío de DIRECTA pasa de APROBAR_FINAL a AVANZAR_CONTRATOS. Se MUEVE la
// fila existente (conserva su `activo`); si no existía, se siembra. Idempotente. Directa no tiene solicitudes en
// producción, así que no se migran estados de solicitudes en curso.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE workflow_desvios SET accion = 'AVANZAR_CONTRATOS', actualizado_en = NOW() WHERE accion = 'APROBAR_FINAL' AND condicion_categoria = 'DIRECTA' AND estado_destino = 'PENDIENTE_GERENTE_COMPRAS'"
    );

    const [existentes] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS total FROM workflow_desvios WHERE accion = 'AVANZAR_CONTRATOS' AND condicion_categoria = 'DIRECTA' AND estado_destino = 'PENDIENTE_GERENTE_COMPRAS'"
    );
    if (existentes[0].total > 0) return;

    const ahora = new Date();
    await queryInterface.bulkInsert('workflow_desvios', [
      {
        accion: 'AVANZAR_CONTRATOS',
        condicion_rol: null,
        condicion_categoria: 'DIRECTA',
        estado_destino: 'PENDIENTE_GERENTE_COMPRAS',
        activo: true,
        creado_en: ahora,
        actualizado_en: ahora,
      },
    ]);
  },
};
