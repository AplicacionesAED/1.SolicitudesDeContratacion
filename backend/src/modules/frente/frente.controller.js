const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/ApiResponse');
const service = require('./frente.service');

const list = asyncHandler(async (req, res) => ok(res, await service.list({ proyectoId: req.query.proyectoId })));
const getById = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
const create = asyncHandler(async (req, res) => created(res, await service.create(req.body)));
const update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body)));
const setUsuarios = asyncHandler(async (req, res) => ok(res, await service.setUsuarios(req.params.id, req.body.usuario_ids, req.body.categoria)));

module.exports = { list, getById, create, update, setUsuarios };
