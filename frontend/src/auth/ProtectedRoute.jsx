// Adaptado de la plantilla: `usuario.roles` es un array (no un `rol` string
// único) -- ver usuario.model.js. `soloAdmin` chequea `usuario.esAdmin`
// (resuelto por el backend contra roles.es_admin, no contra el string
// 'ADMIN' -- ver GET /usuarios/me#esAdmin, 2026-09-18); `permiso` (opcional)
// chequea uno o más slugs granulares vía
// utils/permisos.js, para rutas restringidas a una acción específica en vez
// de a todo el rol admin. `permiso` acepta un string (chequeo único) o un
// array de strings (chequeo OR -- ej. importar-historico ahora sirve tanto a
// quien puede crear solicitudes directas como a quien puede crear indirectas,
// sin un slug único que cubra ambas).
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { usuarioTienePermiso } from '../utils/permisos.js';

export function ProtectedRoute({ soloAdmin = false, permiso = null }) {
  const { usuario, cargando, errorConexion, bloqueo, logout, refrescarPerfil } = useAuth();
  const location = useLocation();

  if (cargando) return null;

  // No se pudo leer la sesion por un fallo de conexion (no por falta de sesion): se queda aqui y reintenta
  // solo, en vez de mandar al login.
  if (!usuario && errorConexion) {
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>No se pudo conectar con el servidor</h1>
          <p style={{ margin: '0 0 16px', color: 'var(--color-ink-secondary)' }}>Tu sesión sigue abierta. Estamos reintentando automáticamente.</p>
          <button type="button" onClick={refrescarPerfil} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Reintentar ahora
          </button>
        </div>
      </div>
    );
  }
  // Entro por el portal, pero Solicitudes no lo deja pasar (sin acceso en el portal o sin usuario aqui): se explica y se ofrece salir.
  if (!usuario && bloqueo) {
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>No puedes entrar a Solicitudes de Contratación</h1>
          <p style={{ margin: '0 0 16px', color: 'var(--color-ink-secondary)' }}>{bloqueo}</p>
          <a href="/" style={{ padding: '8px 16px', marginRight: 8 }}>
            Volver al portal
          </a>
          <button type="button" onClick={logout} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }
  if (!usuario) return <Navigate to="/login" state={{ from: location }} replace />;
  if (soloAdmin && !usuario.esAdmin) return <Navigate to="/" replace />;
  if (permiso) {
    const permisos = Array.isArray(permiso) ? permiso : [permiso];
    const tieneAlguno = permisos.some((p) => usuarioTienePermiso(usuario, p));
    if (!tieneAlguno) return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
