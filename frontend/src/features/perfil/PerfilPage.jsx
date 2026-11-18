// Mi perfil (rediseno 2026-10-09). Antes era una tarjeta con 4 datos; ahora responde a lo que la persona necesita saber
// de su propia cuenta: quien es, A QUE tiene acceso, en que frentes esta asignada y como protege su cuenta (vincular
// Microsoft). El resultado de vincular llega como ?ms_linked=... / ?ms_error=... (ver
// backend/src/modules/auth/auth.azure.js#callback).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { desvincularMicrosoft, iniciarVinculacionMicrosoft } from '../../api/auth.js';
import { listFrentes } from '../../api/frentes.js';
import { usuarioTienePermiso, ROL_LABELS } from '../../utils/permisos.js';
import { NAV_GROUPS } from '../../utils/navModulos.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import layoutStyles from '../../components/layout/WizardLayout.module.css';
import { iniciales } from '../configuracion/usuarioUtils.js';
import styles from '../configuracion/Usuarios.module.css';
import extra from '../terceros/Terceros.module.css';
import p from './PerfilPage.module.css';

export function PerfilPage() {
  const { usuario, refrescarPerfil } = useAuth();
  const [searchParams] = useSearchParams();
  const msLinked = searchParams.get('ms_linked');
  const msError = searchParams.get('ms_error');

  const [frentes, setFrentes] = useState(null);
  const [errorMs, setErrorMs] = useState(null);

  useEffect(() => {
    if (!usuario) return;
    listFrentes()
      .then((res) => setFrentes(res.data.filter((f) => f.usuarioIds?.includes(usuario.id))))
      .catch(() => setFrentes([]));
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A que pantallas entra esta persona, agrupadas por modulo -- sale del mismo arbol del menu lateral, filtrado
  // por sus permisos reales (no se pide la lista de roles, que solo ve un admin).
  const accesos = useMemo(() => {
    if (!usuario) return [];
    return NAV_GROUPS.map((g) => ({
      titulo: g.title,
      items: g.items.filter((i) => (i.soloAdmin ? usuario.esAdmin : !i.permiso || usuario.esAdmin || usuarioTienePermiso(usuario, i.permiso))).map((i) => i.label),
    })).filter((g) => g.items.length > 0).concat(usuario.esAdmin ? [{ titulo: 'Configuración (administrador)', items: ['Usuarios', 'Roles', 'Workflows', 'Proyectos', 'Frentes'] }] : []);
  }, [usuario]);

  if (!usuario) return null;

  async function handleDesvincular() {
    setErrorMs(null);
    try {
      await desvincularMicrosoft();
      await refrescarPerfil();
    } catch (err) {
      setErrorMs(err.message);
    }
  }

  return (
    <div className={styles.page}>
      <section className={layoutStyles.hero}>
        <div className={layoutStyles.heroAvatar}>{iniciales(usuario.nombre)}</div>
        <div className={layoutStyles.heroInfo}>
          <h1 className={layoutStyles.heroName}>{usuario.nombre}</h1>
          <p className={layoutStyles.heroRole}>{usuario.cargo ? `${usuario.cargo} · ${usuario.email}` : usuario.email}</p>
          <p className={layoutStyles.heroMeta}>{(usuario.roles ?? []).map((r) => ROL_LABELS[r] ?? r).join(' · ')}</p>
        </div>
        <div className={layoutStyles.heroSide}>
          {usuario.microsoft_email ? <Badge variant="success" dot>Microsoft vinculada</Badge> : <Badge variant="neutral">Sin Microsoft</Badge>}
        </div>
      </section>

      {msLinked && <div className={extra.okBanner} role="status">Cuenta de Microsoft vinculada: {msLinked}</div>}
      {msError && <div className={styles.errorBanner} role="alert">{msError}</div>}

      <div className={styles.formStack}>
        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>A qué tienes acceso</h2>
            <p className={styles.sectionHint}>Según tus roles. Si necesitas algo más, pídeselo a un administrador.</p>
          </div>
          {accesos.length === 0 ? (
            <p className={styles.permisosVacio}>Tus roles no dan acceso a pantallas del menú.</p>
          ) : (
            <div className={p.accesos}>
              {accesos.map((g) => (
                <div key={g.titulo} className={p.accesoGrupo}>
                  <p className={p.accesoTitulo}>{g.titulo}</p>
                  <div className={extra.chips}>
                    {g.items.map((i) => (
                      <span key={i} className={extra.chip}>{i}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>Mis frentes</h2>
            <p className={styles.sectionHint}>Los frentes en los que estás asignado; de ahí salen las solicitudes que ves y que puedes crear.</p>
          </div>
          {frentes === null ? (
            <p className={styles.permisosVacio}>Cargando...</p>
          ) : frentes.length === 0 ? (
            <p className={styles.permisosVacio}>No estás asignado a ningún frente.</p>
          ) : (
            <div className={extra.chips}>
              {frentes.map((f) => (
                <span key={f.id} className={extra.chip}>{f.nombre}{f.proyecto?.nombre ? ` · ${f.proyecto.nombre}` : ''}</span>
              ))}
            </div>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={extra.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>Cuenta de Microsoft</h2>
              <p className={styles.sectionHint}>{usuario.microsoft_email ? `Vinculada a ${usuario.microsoft_email}. Puedes entrar con ella desde el login.` : 'Se vincula sola la primera vez que entras con "Continuar con Microsoft".'}</p>
            </div>
            {usuario.microsoft_email ? (
              <Button type="button" variant="danger" onClick={handleDesvincular}>Desvincular</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={iniciarVinculacionMicrosoft}>Vincular cuenta de Microsoft</Button>
            )}
          </div>
          {errorMs && <div className={styles.errorBanner} role="alert">{errorMs}</div>}
        </section>
      </div>
    </div>
  );
}
