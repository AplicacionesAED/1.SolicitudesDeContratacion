import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutGrid, LogOut, User } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import styles from './UserMenu.module.css';

function initials(nombre) {
  return (nombre ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// Mismo diseno que el HRMS (migracion de diseno 2026-10-09): avatar + nombre +
// flecha, y un panel anclado a la derecha con nombre/correo, "Mi perfil" y
// "Cerrar sesion". Mismo patron que la campana de notificaciones (containerRef +
// onBlurCapture para cerrar al perder el foco) -- vive en .topbar, junto a ella.
export function UserMenu() {
  const { usuario, logout, modo } = useAuth();
  // Con el portal activo y detras del gateway (/solicitudes/): hay un acceso al portal y el cierre de sesion termina en su login.
  const conPortal = modo !== 'off' && import.meta.env.BASE_URL !== '/';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  if (!usuario) return null;

  function closeIfFocusLeft(event) {
    if (!containerRef.current?.contains(event.relatedTarget)) {
      setOpen(false);
    }
  }

  async function handleLogout() {
    setOpen(false);
    await logout();
    // El login ES el del portal (ruta absoluta del gateway), sin `next`: tras entrar de nuevo se llega a la landing, no a esta app.
    if (conPortal) window.location.assign('/login');
    else navigate('/login', { replace: true });
  }

  return (
    <div ref={containerRef} className={styles.container} onBlurCapture={closeIfFocusLeft}>
      <button type="button" className={styles.trigger} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((prev) => !prev)}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(usuario.nombre)}
        </span>
        <span className={styles.name}>{usuario.nombre}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={styles.caret} />
      </button>

      {open && (
        <div className={styles.panel} role="menu">
          <div className={styles.panelHeader}>
            <span className={styles.panelName}>{usuario.nombre}</span>
            <span className={styles.panelEmail}>{usuario.email}</span>
          </div>

          {conPortal && (
            <a href="/" role="menuitem" className={styles.item}>
              <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
              Portal AED
            </a>
          )}
          <Link to="/perfil" role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
            <User size={16} strokeWidth={1.75} aria-hidden="true" />
            Mi perfil
          </Link>

          <button type="button" role="menuitem" className={styles.item} onClick={handleLogout}>
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
