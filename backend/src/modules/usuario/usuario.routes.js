// Montado en /usuarios (ver routes/index.js).
const express = require('express');
const validate = require('../../middlewares/validate');
const { requireAuth, requirePermiso } = require('../../middlewares/auth');
const controller = require('./usuario.controller');
const { createSchema, updateSchema, masivoSchema } = require('./usuario.schema');

const router = express.Router();

// Ruta estatica ANTES de "/:id" -- ver la regla critica de orden de rutas.
router.get('/me', requireAuth, controller.getMe);

// Ya no es requireAdmin puro -- gateado por el permiso 'ver_usuarios' (puerto
// de HRMS, 2026-09-18, pedido explicito del usuario: poder darle a un rol NO
// admin acceso a una seccion puntual de Configuracion en vez de ser todo o
// nada). ADMIN sigue pasando siempre (tienePermiso hace bypass). Ver la nota
// de auto-escalacion en utils/permisos.js#FUNCIONALIDADES_DISPONIBLES#ver_usuarios.
router.get('/', requireAuth, requirePermiso('ver_usuarios'), controller.list);
router.post('/', requireAuth, requirePermiso('ver_usuarios'), validate(createSchema, 'body'), controller.create);

// Estaticas ANTES de "/:id" (si no, Express las tomaria como un id literal).
router.post('/masivo', requireAuth, requirePermiso('ver_usuarios'), validate(masivoSchema, 'body'), controller.accionMasiva);

router.get('/:id', requireAuth, requirePermiso('ver_usuarios'), controller.getById);
router.put('/:id', requireAuth, requirePermiso('ver_usuarios'), validate(updateSchema, 'body'), controller.update);
router.delete('/:id', requireAuth, requirePermiso('ver_usuarios'), controller.remove);
// Eliminacion fisica (solo cuentas inactivas); segmento literal, no colisiona con la de arriba.
router.delete('/:id/definitivo', requireAuth, requirePermiso('ver_usuarios'), controller.removeDefinitivo);

module.exports = router;
