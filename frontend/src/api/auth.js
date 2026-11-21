// PLANTILLA -- copiado tal cual, va en frontend/src/api/auth.js. Requiere que
// api/client.js tenga `withCredentials: true` en el axios.create() -- si no, las
// cookies de sesion no viajan en los requests.
import client from './client';
import { API_BASE_URL } from './client';

export function logout() {
  return client.post('/auth/logout');
}

// Modo de acceso del servidor (off | optional | required): si Solicitudes usa su login propio o la sesion del portal.
export function getModo() {
  return client.get('/auth/modo');
}

// Cierra la sesion del portal (ruta absoluta del gateway: el portal vive en el mismo dominio, fuera del prefijo de esta app).
export function logoutPortal() {
  return fetch('/portal/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export function getMe() {
  return client.get('/usuarios/me');
}

// Navegación de nivel superior (no fetch) -- el backend redirige a Microsoft
// y de vuelta, ver backend/src/modules/auth/auth.azure.js.
export function iniciarVinculacionMicrosoft() {
  window.location.assign(`${API_BASE_URL}/auth/azure/link`);
}

export function desvincularMicrosoft() {
  return client.post('/auth/azure/unlink');
}
