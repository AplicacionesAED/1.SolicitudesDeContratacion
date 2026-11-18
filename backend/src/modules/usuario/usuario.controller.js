// PLANTILLA -- base copiable, va en backend/src/modules/usuario/usuario.controller.js.
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/ApiResponse');
const service = require('./usuario.service');

const getMe = asyncHandler(async (req, res) => ok(res, await service.getMe(req.usuario)));

const list = asyncHandler(async (req, res) => ok(res, await service.list()));
const create = asyncHandler(async (req, res) => created(res, await service.create(req.body)));
const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
const update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body)));
const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.usuario.id);
  noContent(res);
});

const removeDefinitivo = asyncHandler(async (req, res) => {
  await service.removeDefinitivo(req.params.id, req.usuario.id);
  noContent(res);
});
const accionMasiva = asyncHandler(async (req, res) => ok(res, await service.accionMasiva(req.body, req.usuario.id)));

module.exports = { getMe, list, create, getById, update, remove, removeDefinitivo, accionMasiva };
