// Sidebar y topbar con el mismo diseno que el HRMS (migracion de diseno
// 2026-10-09): riel de categorias con flyout, entrada fija "Inicio", migas de
// pan (grupo > pantalla) y divisor antes del menu de usuario. Lo propio de
// Solicitudes: NAV_GROUPS (utils/navModulos.jsx, filtrado por permiso), la
// campana de notificaciones, el engranaje de Configuracion y la presencia.
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ReactLenis } from 'lenis/react';
import { ChevronRight, Home, Menu, Settings } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { usuarioTienePermiso } from '../../utils/permisos.js';
import { NAV_GROUPS } from '../../utils/navModulos.jsx';
import { UserMenu } from './UserMenu.jsx';
import { NotificacionesBell } from './NotificacionesBell.jsx';
import styles from './AppShell.module.css';

const ICON_SIZE = 16;
const ICON_STROKE_WIDTH = 1.75;

function ChevronIcon() {
  return <ChevronRight size={10} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" className={styles.chevron} />;
}

// El `isActive` por defecto de NavLink marca como activa cualquier ruta cuyo
// pathname EMPIECE con su `to` -- con dos items hermanos donde uno es prefijo
// del otro ("Todas las solicitudes" /solicitudes-directas y "Nueva solicitud"
// /solicitudes-directas/nueva, o Directorio /terceros y Especialidades
// /terceros/especialidades) quedarian los DOS encendidos a la vez. Se resuelve
// buscando, entre todos los items de todos los grupos cuyo `to` calce con la
// ruta actual, el de `to` mas largo: el mas especifico gana.
function encontrarItemActivo(pathname) {
  let mejor = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.to) continue;
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!mejor || item.to.length > mejor.item.to.length) mejor = { item, grupoTitulo: group.title };
      }
    }
  }
  return mejor;
}

// Rutas que no son un item del menu pero si tienen un lugar claro en la app:
// el detalle de una solicitud (`/solicitudes/:id`, sin categoria en la URL),
// el import historico, Configuracion y el perfil.
function migaFueraDelMenu(path) {
  if (path === '/solicitudes/importar-historico') return { group: 'Solicitudes', label: 'Importar histórico' };
  if (path.startsWith('/solicitudes/')) return { group: 'Solicitudes', label: 'Detalle de la solicitud' };
  if (path === '/configuracion' || path.startsWith('/configuracion/')) return { group: 'Configuración', label: 'Accesos y configuración' };
  if (path === '/perfil' || path.startsWith('/perfil/')) return { group: null, label: 'Mi perfil' };
  return null;
}

// Pantallas de trabajo denso (formularios, listado y detalle de solicitudes, workflows): el sidebar se oculta
// para ganar ancho y se abre encima del contenido con el boton de menu del topbar.
const RUTAS_SIN_SIDEBAR = [
  /^\/solicitudes-(directas|indirectas)\/nueva(\/[^/]+)?$/,
  /^\/solicitudes-(directas|indirectas)\/importar-historico$/,
  /^\/solicitudes\/importar-historico$/,
  /^\/solicitudes\/[^/]+\/editar$/,
  /^\/solicitudes-(directas|indirectas)$/,
  /^\/solicitudes\/[^/]+$/,
  /^\/configuracion\/workflows(\/.*)?$/,
];

export function AppShell() {
  const location = useLocation();
  const { usuario } = useAuth();
  const [openGroup, setOpenGroup] = useState(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navRef = useRef(null);
  const closeTimerRef = useRef(null);

  const ocultarSidebar = RUTAS_SIN_SIDEBAR.some((re) => re.test(location.pathname));
  const itemActivo = encontrarItemActivo(location.pathname);
  const activeGroupTitle = itemActivo?.grupoTitulo;

  // Migas de pan del topbar (grupo > pantalla), derivadas del mismo NAV_GROUPS:
  // un item nuevo aparece solo.
  const path = location.pathname;
  let crumb = null;
  if (path === '/') {
    crumb = { group: null, label: 'Inicio' };
  } else if (itemActivo) {
    crumb = { group: itemActivo.grupoTitulo, label: itemActivo.item.label };
  } else {
    crumb = migaFueraDelMenu(path);
  }
  // "Nueva solicitud" e "Importar historico" cuelgan del listado, sin item propio en el menu.
  if (itemActivo && /\/nueva(\/|$)/.test(path)) crumb = { group: itemActivo.grupoTitulo, label: 'Nueva solicitud' };
  else if (itemActivo && /\/importar-historico$/.test(path)) crumb = { group: itemActivo.grupoTitulo, label: 'Importar histórico' };

  // El flyout esta separado de su fila por un gap (ver .flyout en el CSS), asi
  // que moviendo el mouse en diagonal el cursor puede pasar por un pixel que no
  // es ni la fila ni el panel y dispara mouseleave a mitad de camino. Cerrar con
  // un pequeno retraso, cancelable apenas el mouse vuelve a entrar a CUALQUIER
  // parte del nav, absorbe ese cruce sin que se note.
  function scheduleClose() {
    closeTimerRef.current = setTimeout(() => setOpenGroup(null), 300);
  }

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function closeNow() {
    cancelScheduledClose();
    setOpenGroup(null);
  }

  function closeIfFocusLeftNav(event) {
    if (!navRef.current?.contains(event.relatedTarget)) {
      closeNow();
    }
  }

  useEffect(() => cancelScheduledClose, []); // eslint-disable-line react-hooks/exhaustive-deps

  // El menu flotante se cierra al cambiar de pantalla y con Escape.
  useEffect(() => setMenuAbierto(false), [location.pathname]);
  useEffect(() => {
    if (!menuAbierto) closeNow();
  }, [menuAbierto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menuAbierto) return undefined;
    const alTeclear = (e) => e.key === 'Escape' && setMenuAbierto(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);

  // Defensa contra un bug real (2026-09-18): esta app nunca debe scrollear la
  // pagina nativa -- el unico scroll real vive en `.scrollArea` (Lenis, ver
  // index.css#html,body { overflow: hidden }). `overflow: hidden` bloquea el
  // scroll del usuario pero NO que el propio navegador mueva `scrollTop` de
  // <html>/<body> (por ejemplo al devolver el foco a un elemento fuera de la
  // vista); eso desincroniza el contenido que Lenis ya movio y la barra lateral
  // y el topbar "desaparecen". Si `window` llega a moverse, se revierte al toque.
  useEffect(() => {
    function resetStrayScroll() {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    }
    window.addEventListener('scroll', resetStrayScroll, { passive: true });
    return () => window.removeEventListener('scroll', resetStrayScroll);
  }, []);

  const puedeVerUsuarios = usuario?.esAdmin || usuarioTienePermiso(usuario, 'ver_usuarios');
  const puedeVerRoles = usuarioTienePermiso(usuario, 'ver_roles');

  return (
    <div className={`${styles.shell} ${ocultarSidebar ? styles.shellSinSidebar : ''}`}>
      {ocultarSidebar && (
        <button
          type="button"
          className={`${styles.backdrop} ${menuAbierto ? styles.backdropAbierto : ''}`}
          aria-label="Cerrar menú"
          tabIndex={menuAbierto ? 0 : -1}
          onClick={() => setMenuAbierto(false)}
        />
      )}
      <aside className={`${styles.sidebar} ${ocultarSidebar ? `${styles.sidebarFlotante} ${menuAbierto ? styles.sidebarAbierto : ''}` : ''}`}>
        <div className={styles.brand}>
          <img className={styles.brandLogo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="aed" />
          <span className={styles.brandDivider} aria-hidden="true" />
          <span className={styles.brandName}>CONTRATACIÓN</span>
        </div>
        <nav
          ref={navRef}
          className={styles.nav}
          aria-label="Navegacion principal"
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={scheduleClose}
          onBlurCapture={closeIfFocusLeftNav}
        >
          <p className={styles.navSection}>Menú</p>
          {/* Inicio: entrada fija arriba de las categorias, navega directo (nunca
              abre flyout). `end` para que solo se marque activa en "/" exacto. */}
          <NavLink
            to="/"
            end
            onClick={closeNow}
            className={({ isActive }) => `${styles.navGroupButton} ${isActive ? styles.navGroupButtonActive : ''}`}
          >
            <span className={styles.navGroupLabel}>
              <Home size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
              Inicio
            </span>
          </NavLink>
          {NAV_GROUPS.map((group) => {
            // Un item se muestra si no es soloAdmin (o el usuario es ADMIN) y si no
            // declara `permiso` o el usuario lo tiene (ADMIN lo bypassea). Un grupo
            // entero se oculta si ningun item suyo quedo visible.
            const itemsVisibles = group.items.filter(
              (item) => !item.sinMenu && (!item.soloAdmin || usuario?.esAdmin) && (!item.permiso || usuarioTienePermiso(usuario, item.permiso))
            );
            if (itemsVisibles.length === 0) return null;

            const isOpen = openGroup === group.title;
            const isActiveGroup = activeGroupTitle === group.title;
            const GroupIcon = group.icon;
            if (group.directo) {
              return (
                <NavLink
                  key={group.title}
                  to={itemsVisibles[0].to}
                  onClick={closeNow}
                  className={`${styles.navGroupButton} ${isActiveGroup ? styles.navGroupButtonActive : ''}`}
                >
                  <span className={styles.navGroupLabel}>
                    <GroupIcon />
                    {group.title}
                  </span>
                </NavLink>
              );
            }
            return (
              <div key={group.title} className={styles.navGroupRow}>
                <button
                  type="button"
                  className={`${styles.navGroupButton} ${isActiveGroup ? styles.navGroupButtonActive : ''}`}
                  onMouseEnter={() => setOpenGroup(group.title)}
                  onFocus={() => setOpenGroup(group.title)}
                  onClick={() => setOpenGroup((current) => (current === group.title ? null : group.title))}
                  aria-expanded={isOpen}
                >
                  <span className={styles.navGroupLabel}>
                    <GroupIcon />
                    {group.title}
                  </span>
                  <ChevronIcon />
                </button>
                {isOpen && (
                  <div className={styles.flyout} role="menu">
                    {itemsVisibles.map((item) => (
                      <NavLink
                        key={item.label}
                        to={item.to}
                        role="menuitem"
                        onClick={closeNow}
                        className={() => `${styles.navItem} ${itemActivo?.item === item ? styles.navItemActive : ''}`}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className={styles.main}>
        <div className={styles.topbar}>
          {ocultarSidebar && (
            <button type="button" className={styles.menuToggle} onClick={() => setMenuAbierto((v) => !v)} aria-label="Abrir menú" aria-expanded={menuAbierto}>
              <Menu size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            </button>
          )}
          {crumb && (
            <nav className={styles.crumb} aria-label="Ubicación">
              {crumb.group && (
                <>
                  <span>{crumb.group}</span>
                  <ChevronRight size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                </>
              )}
              <span className={styles.crumbCurrent}>{crumb.label}</span>
            </nav>
          )}
          <NotificacionesBell />
          {/* Engranaje de Configuracion (Usuarios/Roles/Proyectos/Frentes/Workflows):
              ruta normal con su propio nav vertical (AccesosLayout), nunca un panel
              flotante -- este boton solo navega. Visible con 'ver_usuarios' O
              'ver_roles' (o ADMIN, que ve ademas Workflows/Proyectos/Frentes). Las
              rutas ya estan protegidas con <ProtectedRoute>; esto solo evita un link
              muerto. Si solo tiene 'ver_roles' lleva directo a /configuracion/roles
              (/configuracion redirige a usuarios y lo rebotaria). */}
          {(puedeVerUsuarios || puedeVerRoles) && (
            <NavLink
              to={puedeVerUsuarios ? '/configuracion' : '/configuracion/roles'}
              className={styles.topbarIconLink}
              aria-label="Accesos y configuración"
            >
              <Settings size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            </NavLink>
          )}
          <span className={styles.topbarDivider} aria-hidden="true" />
          <UserMenu />
        </div>
        <ReactLenis root={false} className={styles.scrollArea} options={{ smoothWheel: true }}>
          <Suspense fallback={<div className={styles.routeLoading}>Cargando...</div>}>
            <Outlet />
          </Suspense>
        </ReactLenis>
      </main>
    </div>
  );
}
