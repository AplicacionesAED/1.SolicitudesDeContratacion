// PLANTILLA -- copiado tal cual, va en backend/src/modules/auth/auth.routes.js,
// montado en /auth (ver routes/index.js).
const express = require('express');
const { requireAuth } = require('../../middlewares/auth');
const controller = require('./auth.controller');
const azure = require('./auth.azure');

const router = express.Router();

// Sin login por contraseña (2026-11-18): el único ingreso es Microsoft (Outlook), ver auth.azure.js.
router.post('/logout', controller.logout);
router.post('/refresh', controller.refresh);

// SSO de Azure AD -- ver auth.azure.js. /login y /callback son navegaciones
// de nivel superior del navegador (no fetch/XHR), por eso son GET.
router.get('/azure/login', azure.iniciarLogin);
router.get('/azure/link', requireAuth, azure.iniciarVinculacion);
router.get('/azure/callback', azure.callback);
router.post('/azure/unlink', requireAuth, azure.desvincular);

module.exports = router;
