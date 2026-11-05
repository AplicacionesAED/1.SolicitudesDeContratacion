'use strict';

// Flujo propio de Directa, 2026-11-05 -- "Trámite Contratos", "Elaboración de Orden" y "Firma Gerente de Compras"
// eran tres OK seguidos (la orden se genera con un botón): se unifican en un solo paso, "Compras y Contrataciones"
// (estado técnico PENDIENTE_GERENTE_COMPRAS), que firma el Gerente de Compras. Tras Controles — Proyección
// (APROBAR_PROYECCION) DIRECTA va directo a ese paso: se MUEVE el desvío que antes colgaba de AVANZAR_CONTRATOS
// (conserva su `activo`); si no existía, se siembra. INDIRECTA no cambia (sin desvío). Las solicitudes DIRECTA que
// estaban en Trámite Contratos / Elaboración de Orden pasan al paso nuevo. Idempotente.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE workflow_desvios SET accion = 'APROBAR_PROYECCION', actualizado_en = NOW() WHERE accion = 'AVANZAR_CONTRATOS' AND condicion_categoria = 'DIRECTA' AND estado_destino = 'PENDIENTE_GERENTE_COMPRAS'"
    );

    const [existentes] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS total FROM workflow_desvios WHERE accion = 'APROBAR_PROYECCION' AND condicion_categoria = 'DIRECTA' AND estado_destino = 'PENDIENTE_GERENTE_COMPRAS'"
    );
    if (existentes[0].total === 0) {
      const ahora = new Date();
      await queryInterface.bulkInsert('workflow_desvios', [
        {
          accion: 'APROBAR_PROYECCION',
          condicion_rol: null,
          condicion_categoria: 'DIRECTA',
          estado_destino: 'PENDIENTE_GERENTE_COMPRAS',
          activo: true,
          creado_en: ahora,
          actualizado_en: ahora,
        },
      ]);
    }

    await queryInterface.sequelize.query(
      "UPDATE solicitudes SET estado = 'PENDIENTE_GERENTE_COMPRAS', actualizado_en = NOW() WHERE categoria = 'DIRECTA' AND estado IN ('EN_TRAMITE_CONTRATOS', 'APROBADA_DIRECTOR', 'CREACION_MINUTA')"
    );
  },
};
