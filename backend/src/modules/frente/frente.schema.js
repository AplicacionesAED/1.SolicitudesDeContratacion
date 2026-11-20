const { z } = require('zod');

const createSchema = z.object({
  nombre: z.string().min(1).max(200),
  etapa: z.number().int().nullable().optional(),
  proyecto_id: z.number().int(),
});

const updateSchema = createSchema.partial();

const usuariosSchema = z.object({
  usuario_ids: z.array(z.number().int()),
  categoria: z.enum(['DIRECTA', 'INDIRECTA']),
});

module.exports = { createSchema, updateSchema, usuariosSchema };
