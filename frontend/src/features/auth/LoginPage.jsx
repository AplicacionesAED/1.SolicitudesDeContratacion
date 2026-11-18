import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, FilePlus2, Handshake } from 'lucide-react';
import { API_BASE_URL } from '../../api/client.js';
import styles from './LoginPage.module.css';

// Mismo diseno que el login del HRMS (migracion de diseno 2026-10-09): panel de
// marca con foto, velo azul y el logo en blanco, y una tarjeta de acceso con
// iconos en los campos y boton para ver la contrasena. El titular es un SLOGAN,
// no el nombre de la app. Se conserva el inicio de sesion con Microsoft (SSO de
// Azure AD): un intento fallido llega como ?error=... en la URL (ver
// backend/src/modules/auth/auth.azure.js#callback).
const BENEFICIOS = [
  { icono: FilePlus2, texto: 'Solicitudes directas e indirectas' },
  { icono: ClipboardCheck, texto: 'Aprobaciones y seguimiento' },
  { icono: Handshake, texto: 'Terceros y contratistas' },
];

const MENSAJES_ERROR_SSO = {
  OAuthAccountNotFound: 'No existe una cuenta vinculada a este correo de Microsoft. Pide a un administrador que cree tu usuario primero.',
  OAuthAccountInactive: 'Tu cuenta está desactivada. Contacta al administrador del sistema.',
  OAuthError: 'No se pudo completar el inicio de sesión con Microsoft. Intenta de nuevo.',
};

function IconoMicrosoft() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const codigo = searchParams.get('error');
    if (codigo) setError(MENSAJES_ERROR_SSO[codigo] ?? 'No se pudo iniciar sesión.');
  }, [searchParams]);

  return (
    <div className={styles.splitWrap}>
      {/* backgroundImage inline (no en el CSS module) -- una url('/login-hero.svg')
          absoluta en CSS no se reescribe con el `base` de Vite cuando la app
          vive bajo un subpath; import.meta.env.BASE_URL si refleja ese `base`.
          Las DOS capas (velo + foto) van juntas en el mismo inline style: un
          style inline pisa por completo el background-image del CSS module. */}
      <div
        className={styles.brandPanel}
        style={{
          backgroundImage: `linear-gradient(160deg, rgba(11, 45, 77, 0.82) 0%, rgba(20, 48, 143, 0.55) 55%, rgba(35, 43, 237, 0.38) 100%), url('${import.meta.env.BASE_URL}login-hero.svg')`,
        }}
        aria-hidden="true"
      >
        <img className={styles.brandLogo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="" />
        <div className={styles.brandTextBlock}>
          <h2 className={styles.brandHeadline}>Cada contrato, bien pedido y bien aprobado.</h2>
          <p className={styles.brandSubtext}>Contratación directa e indirecta de los proyectos de AED — de la solicitud a la firma, todo en un solo sistema.</p>
          <ul className={styles.benefits}>
            {BENEFICIOS.map(({ icono: Icono, texto }) => (
              <li key={texto}>
                <Icono size={16} strokeWidth={1.75} />
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formCard}>
          <img className={styles.formLogo} src={`${import.meta.env.BASE_URL}aed-logo.png`} alt="aed" />
          <div className={styles.formHead}>
            <h1 className={styles.formTitle}>Te damos la bienvenida</h1>
            <p className={styles.formSubtitle}>Ingresa con tu cuenta de Microsoft para continuar.</p>
          </div>

          {error && (
            <p className={styles.alert} role="alert">
              {error}
            </p>
          )}

          <button type="button" className={styles.sso} onClick={() => window.location.assign(`${API_BASE_URL}/auth/azure/login`)}>
            <IconoMicrosoft />
            Continuar con Microsoft
          </button>

          <p className={styles.footnote}>¿Problemas para ingresar? Escribe al administrador del sistema.</p>
        </div>
      </div>
    </div>
  );
}
