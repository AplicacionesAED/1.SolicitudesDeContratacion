// PLANTILLA -- copiado tal cual, va en frontend/src/auth/AuthContext.jsx.
// Envuelve <App /> con <AuthProvider> en main.jsx (ver el ejemplo en el
// comentario de LoginPage.jsx).
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setModoPortal, setSessionExpiredHandler } from '../api/client';

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
  // Modo de acceso del servidor (off | optional | required) y, si el portal acepta a la persona pero Solicitudes no, el motivo (403).
  const [modo, setModo] = useState('off');
  const [bloqueo, setBloqueo] = useState(null);
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
        setBloqueo(null);
        setErrorConexion(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          setUsuario(null);
          setBloqueo(null);
          setErrorConexion(false);
        } else if (err.status === 403) {
          // Sesion del portal valida, pero sin acceso a Solicitudes o sin usuario en Solicitudes: se explica en vez de mandar al login.
          setUsuario(null);
          setBloqueo(err.message);
          setErrorConexion(false);
        } else {
          setErrorConexion(true);
        }
      });
  }, []);

  useEffect(() => {
    usuarioRef.current = usuario;
  }, [usuario]);

  // Primero el modo (decide como se renueva la sesion), luego el perfil. Un servidor sin /auth/modo (version anterior) cuenta como `off`.
  useEffect(() => {
    authApi
      .getModo()
      .then((res) => res.data?.modo ?? 'off')
      .catch(() => 'off')
      .then((m) => {
        setModoPortal(m);
        setModo(m);
        return cargarPerfil();
      })
      .finally(() => setCargando(false));
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
    // Con el portal activo tambien se cierra la sesion del portal (cierra la de TODAS las apps); si falla no debe impedir salir.
    if (modo !== 'off') await authApi.logoutPortal().catch(() => {});
    await authApi.logout().catch(() => {});
    setBloqueo(null);
    // Con el portal activo la pantalla se abandona navegando al login del portal (UserMenu): borrar `usuario` aqui haria que
    // ProtectedRoute redirigiera antes y con `next`, y la persona volveria a esta app en lugar de a la landing.
    if (modo === 'off') setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, errorConexion, modo, bloqueo, logout, refrescarPerfil: cargarPerfil }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
