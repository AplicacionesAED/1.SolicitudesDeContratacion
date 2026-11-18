// Adaptado de la plantilla -- va en backend/src/modules/usuario/usuario.schema.js.
const { z } = require('zod');

// 2026-09-18: ya NO se valida contra un enum fijo -- la tabla `roles` (GET
// /roles) es la fuente real de qué roles existen, editable en runtime desde
// /configuracion/roles (incluida la creación de roles nuevos). Un enum fijo
// acá bloqueaba con un 400 asignarle a un usuario cualquier rol creado
// después del scaffold original (ej. "RESIDENTE_ADMINISTRATIVO") -- mismo
// bug, mismo motivo, que ya se corrigió del lado del frontend (ver
// UsuarioFormPage.jsx). Un string que no corresponda a ningún rol real
// simplemente no otorga ningún permiso (mismo criterio que ya usa
// tienePermiso()), no hace falta que el schema lo rechace.
const ROLES_LEGACY = [
  'SOLICITANTE',
  'TECNICA',
  'DIRECTOR_TECNICO',
  'DIRECTOR_PROYECTO',
  'CONTRATOS',
  'CONTROLES',
  'DIRECTOR_CONTROLES',
  'GERENCIA',
  'ADMIN',
];

const createSchema = z.object({
  nombre: z.string().min(1).max(200),
  email: z.string().email(),
  roles: z.array(z.string().min(1)).min(1),
  funcionalidades_adicionales: z.array(z.string()).optional(),
  cargo: z.string().max(150).nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
});

const updateSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  roles: z.array(z.string().min(1)).min(1).optional(),
  funcionalidades_adicionales: z.array(z.string()).optional(),
  cargo: z.string().max(150).nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
  activo: z.boolean().optional(),
});

// Acciones masivas desde la lista (2026-10-09).
const masivoSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(50),
  accion: z.enum(['activar', 'inactivar']),
});

module.exports = { ROLES: ROLES_LEGACY, createSchema, updateSchema, masivoSchema };
