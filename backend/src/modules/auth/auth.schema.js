// PLANTILLA -- copiado tal cual, va en backend/src/modules/auth/auth.schema.js.
const { z } = require('zod');

const cambiarPasswordSchema = z.object({
  nueva_password: z.string().min(1),
});

module.exports = { cambiarPasswordSchema };
