import client from './client';

export function listFrentes(proyectoId) {
  return client.get(`/frentes${proyectoId ? `?proyectoId=${proyectoId}` : ''}`);
}

export function getFrente(id) {
  return client.get(`/frentes/${id}`);
}

export function createFrente(data) {
  return client.post('/frentes', data);
}

export function updateFrente(id, data) {
  return client.put(`/frentes/${id}`, data);
}

export function setFrenteUsuarios(id, usuarioIds, categoria) {
  return client.put(`/frentes/${id}/usuarios`, { usuario_ids: usuarioIds, categoria });
}

export function getAprobadorFrente(frenteId, categoria) {
  return client.get(`/frentes/${frenteId}/aprobador?categoria=${categoria}`);
}

export function updateAprobadorFrente(frenteId, categoria, data) {
  return client.put(`/frentes/${frenteId}/aprobador`, { ...data, categoria });
}
