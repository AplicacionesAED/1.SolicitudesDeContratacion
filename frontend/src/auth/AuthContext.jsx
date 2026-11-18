// PLANTILLA -- copiado tal cual, va en frontend/src/auth/AuthContext.jsx.
// Envuelve <App /> con <AuthProvider> en main.jsx (ver el ejemplo en el
// comentario de LoginPage.jsx).
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

// 2026-09-02: si un admin le revoca un permiso a un rol mientras alguien con
// ese rol ya tiene una sesión abierta, esa sesión seguía viendo el sidebar
// viejo indefinidamente -- `usuario.funcionalidadesPorRol` solo se pedía una
// vez, al cargar la app o al hacer login. Se refresca solo (mismo intervalo
// que el heartbeat de presencia, ver usePresence.js#HEARTBEAT_MS, por
// consistencia) para que el cambio se refleje sin que la persona tenga que
// cerrar sesión -- `usuario` es un objeto nuevo en cada respuesta, así que
// cualquier componente que lo consuma (AppShell, ProtectedRoute) se
// re-renderiza solo con los permisos al día; si la ruta actual dejó de
// estar permitida, `ProtectedRoute` lo saca de ahí en el mismo tick.
const PERFIL_POLL_MS = 30_000;
const REINTENTO_MS = 5000;

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  // true = no se pudo leer el perfil por un fallo de conexion/servidor (no por falta de sesion).
  const [errorConexion, setErrorConexion] = useState(false);
  const usuarioRef = useRef(null);

  // Sesion: el usuario SOLO se borra cuando el servidor dice de verdad que no hay sesion (401 al leer el
  // perfil, o refresh rechazado). Cualquier otro fallo (red caida, 502/503, timeout, 500) conserva al
  // usuario que ya estaba: antes un solo error al pedir el perfil -- p. ej. un 503 mientras Coolify
  // reemplaza el contenedor en un deploy -- mandaba a todos al login. Ver la regla 13 de AED-REGLAS.md.
  const cargarPerfil = useCallback(() => {
    return authApi
      .getMe()
      .then((res) => {
        setUsuario(res.data);
        setErrorConexion(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          setUsuario(null);
          setErrorConexion(false);
        } else {
          setErrorConexion(true);
        }
      });
  }, []);

  useEffect(() => {
    usuarioRef.current = usuario;
  }, [usuario]);

  useEffect(() => {
    cargarPerfil().finally(() => setCargando(false));
  }, [cargarPerfil]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (usuarioRef.current) cargarPerfil();
    }, PERFIL_POLL_MS);
    return () => clearInterval(intervalo);
  }, [cargarPerfil]);

  // El refresh_token vencio de verdad (30 dias) -- client.js ya intento
  // renovar el access_token y fallo. Limpiar la sesion local; ProtectedRoute
  // redirige a /login apenas usuario pasa a null.
  // Reintenta solo mientras haya un error de conexion.
  useEffect(() => {
    if (!errorConexion) return undefined;
    const id = setInterval(cargarPerfil, REINTENTO_MS);
    return () => clearInterval(id);
  }, [errorConexion, cargarPerfil]);

  useEffect(() => {
    setSessionExpiredHandler(() => setUsuario(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  async function logout() {
    await authApi.logout();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, errorConexion, logout, refrescarPerfil: cargarPerfil }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
