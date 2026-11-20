const { z } = require('zod');

// 2026-09-18: `roles` ya no se valida contra un enum fijo -- ver la nota en
// usuario.schema.js. Un rol creado desde /configuracion/roles (ej.
// "RESIDENTE_ADMINISTRATIVO") tiene que poder guardarse acá como "O
// cualquiera con este rol" de un slot.
const slotSchema = z.object({
  usuarios: z.array(z.number().int()),
  roles: z.array(z.string().min(1)),
});

const updateSchema = z.object({
  categoria: z.enum(['DIRECTA', 'INDIRECTA']),
  director_proyecto: slotSchema.optional(),
  contratos_tramite: slotSchema.optional(),
  contratos_minuta: slotSchema.optional(),
  director_controles: slotSchema.optional(),
  director_tecnico: slotSchema.optional(),
  controles_adpro: slotSchema.optional(),
  // Flujo propio de Directa (Orden de Servicio), 2026-09-18 -- ver
  // solicitud.autorizacion.js.
  controles_proyeccion: slotSchema.optional(),
  residente_administrativo: slotSchema.optional(),
  controles_aprobacion_final: slotSchema.optional(),
  director_obra: slotSchema.optional(),
  gerente_compras: slotSchema.optional(),
  revisor_compras: slotSchema.optional(),
});

module.exports = { slotSchema, updateSchema };
