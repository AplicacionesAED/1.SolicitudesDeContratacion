// Wrapper fetch compartido -- base URL, error shape, y el refresh automático
// del access_token (ver "Login y autenticación" en ARQUITECTURA-FRONTEND.md).
// `credentials: 'include'` en cada request es obligatorio: sin eso las
// cookies de sesión (solind_access_token/solind_refresh_token) no viajan,
// porque backend (localhost:3021) y frontend (localhost:5193) son orígenes
// distintos para efectos de CORS aunque compartan host.
//
// El `/api` es obligatorio -- backend/src/app.js monta TODAS las rutas ahí
// (Fase de corte a producción): en un despliegue de un solo contenedor, el
// mismo proceso sirve el build del frontend bajo el mismo origen, y varias
// rutas de API (`/solicitudes/:id`, `/terceros/:id`) coinciden exactamente
// con una página real del frontend -- sin el prefijo, un refresh del
// navegador en esa página le pegaría al JSON de la API en vez de servir el
// SPA. Dev y producción usan el mismo prefijo a propósito, para no tener un
// comportamiento distinto entre los dos.
// En el build de producción el backend sirve también el frontend (mismo origen), así
// que la API vive en una ruta relativa al prefijo de la app: "/api" standalone, o
// "/solicitudes/api" detrás del gateway (BASE_URL = VITE_BASE_PATH, siempre con "/" final).
// En desarrollo (Vite :5193 y backend :3021 son orígenes distintos) apunta al backend local.
// VITE_API_URL, si se define, tiene prioridad sobre ambos.
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${import.meta.env.BASE_URL}api` : 'http://localhost:3021/api');

let sessionExpiredHandler = null;
export function setSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
}

// Modo de acceso (off | optional | required), lo fija AuthProvider al arrancar. Con el portal activo la sesion se renueva en el portal
// (ruta absoluta del gateway, mismo dominio); en `optional` si el portal no la renueva se intenta con el login propio.
let modoPortal = 'off';
export function setModoPortal(modo) {
  modoPortal = modo;
}

const renovar = (url) =>
  fetch(url, { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false);

let refreshingPromise = null;
function refreshSession() {
  if (!refreshingPromise) {
    const propia = () => renovar(`${API_BASE_URL}/auth/refresh`);
    refreshingPromise = (modoPortal === 'off' ? propia() : renovar('/portal/api/auth/refresh').then((ok) => (ok || modoPortal === 'required' ? ok : propia()))).finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

class ApiRequestError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return request(path, { ...options, _retried: true });
    sessionExpiredHandler?.();
  }

  if (res.status === 204) return { data: null };

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(body?.error?.message ?? 'Error de red', res.status, body?.error?.details);
  }
  return { data: body?.data, meta: body?.meta };
}

const client = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path, body) => request(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export default client;
export { API_BASE_URL };
