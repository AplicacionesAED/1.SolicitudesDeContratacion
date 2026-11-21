// PLANTILLA -- copiado tal cual, va en backend/src/modules/auth/auth.routes.js,
// montado en /auth (ver routes/index.js).
const express = require('express');
const { requireAuth } = require('../../middlewares/auth');
const controller = require('./auth.controller');
const azure = require('./auth.azure');
const portalAuth = require('../../utils/portalAuth');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/ApiResponse');

const router = express.Router();

// Con PORTAL_AUTH=required el login propio de la app (y la vinculacion de Microsoft, que ya no tiene sentido) se apaga: seguiria siendo
// una puerta paralela al portal.
const loginPropioActivo = (req, res, next) =>
  portalAuth.modo() === 'required' ? next(new ApiError(410, 'El inicio de sesión de Solicitudes ahora se hace en el portal')) : next();

// Modo de acceso (off | optional | required): el frontend decide si muestra su login o manda al del portal. Publico a proposito.
router.get('/modo', (req, res) => ok(res, { modo: portalAuth.modo() }));

// Sin login por contraseña (2026-11-18): el único ingreso es Microsoft (Outlook), ver auth.azure.js.
router.post('/logout', controller.logout);
router.post('/refresh', loginPropioActivo, controller.refresh);

// SSO de Azure AD -- ver auth.azure.js. /login y /callback son navegaciones
// de nivel superior del navegador (no fetch/XHR), por eso son GET.
router.get('/azure/login', loginPropioActivo, azure.iniciarLogin);
router.get('/azure/link', loginPropioActivo, requireAuth, azure.iniciarVinculacion);
router.get('/azure/callback', loginPropioActivo, azure.callback);
router.post('/azure/unlink', loginPropioActivo, requireAuth, azure.desvincular);

module.exports = router;
