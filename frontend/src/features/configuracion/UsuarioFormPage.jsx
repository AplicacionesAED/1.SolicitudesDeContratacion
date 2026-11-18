// Ficha de usuario con el mismo diseno que la del HRMS y Cartera (migracion de diseno 2026-10-09):
// banner de detalle al editar, secciones en tarjetas (Cuenta / Roles y acceso / Microsoft / Contrasena) y
// barra de acciones. El id especial 'nueva' activa modo creacion en el mismo componente.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { CheckboxGroup } from '../../components/ui/CheckboxGroup.jsx';
import { createUsuario, getUsuario, removeUsuarioDefinitivo, updateUsuario } from '../../api/usuarios.js';
import { listRoles, listFuncionalidadesDisponibles } from '../../api/roles.js';
import { ROL_LABELS } from '../../utils/permisos.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import layoutStyles from '../../components/layout/WizardLayout.module.css';
import { iniciales, fmtFecha, fmtAcceso } from './usuarioUtils.js';
import styles from './Usuarios.module.css';

const VACIO = { nombre: '', email: '', roles: [], funcionalidades_adicionales: [], cargo: '', telefono: '', activo: true };

export function UsuarioFormPage() {
  const { id } = useParams();
  const esNuevo = id === 'nueva';
  const navigate = useNavigate();
  const { usuario: usuarioActual } = useAuth();

  const [form, setForm] = useState(VACIO);
  const [usuarioEditado, setUsuarioEditado] = useState(null);
  // Roles y funcionalidades REALES (tablas en vivo): un rol creado desde Roles queda asignable de inmediato.
  const [roles, setRoles] = useState([]);
  const [funcionalidades, setFuncionalidades] = useState({});
  const [loading, setLoading] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [requisitosFaltantes, setRequisitosFaltantes] = useState(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    listRoles().then((res) => setRoles(res.data)).catch(() => {});
    listFuncionalidadesDisponibles().then((res) => setFuncionalidades(res.data)).catch(() => {});
    if (esNuevo) return;
    getUsuario(id)
      .then((res) => {
        setUsuarioEditado(res.data);
        setForm({ ...VACIO, ...res.data, cargo: res.data.cargo ?? '', telefono: res.data.telefono ?? '' });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, esNuevo]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const opcionesRoles = useMemo(() => roles.map((rol) => ({ value: rol.nombre, label: ROL_LABELS[rol.nombre] ?? rol.nombre })), [roles]);
  const opcionesFuncionalidades = useMemo(() => Object.entries(funcionalidades).map(([slug, info]) => ({ value: slug, label: info.nombre })), [funcionalidades]);
  const permisosPorRol = useMemo(() => Object.fromEntries(roles.map((rol) => [rol.nombre, rol.permisos ?? []])), [roles]);

  const esAdminRol = roles.some((rol) => rol.es_admin && form.roles.includes(rol.nombre));
  // Lo que PODRA hacer: permisos de los roles elegidos + las funcionalidades concedidas a mano.
  const permisosEfectivos = useMemo(
    () => [...new Set([...form.roles.flatMap((rol) => permisosPorRol[rol] ?? []), ...form.funcionalidades_adicionales])],
    [form.roles, form.funcionalidades_adicionales, permisosPorRol]
  );
  const esMismaCuenta = Number(usuarioActual?.id) === Number(usuarioEditado?.id);

  async function handleEliminarDefinitivo() {
    setEliminando(true);
    try {
      await removeUsuarioDefinitivo(id);
      navigate('/configuracion/usuarios');
    } catch (err) {
      setConfirmarEliminar(false);
      setError(err.message);
      setEliminando(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setRequisitosFaltantes(null);
    if (form.roles.length === 0) {
      setError('Selecciona al menos un rol');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre,
        roles: form.roles,
        funcionalidades_adicionales: form.funcionalidades_adicionales,
        cargo: form.cargo || null,
        telefono: form.telefono || null,
      };
      if (esNuevo) await createUsuario({ ...payload, email: form.email });
      else await updateUsuario(id, { ...payload, activo: form.activo });
      navigate('/configuracion/usuarios');
    } catch (err) {
      setError(err.details?.formErrors?.join(', ') ?? err.message);
      setFieldErrors(err.details?.fieldErrors ?? {});
      setRequisitosFaltantes(err.details?.requisitos_faltantes ?? null);
      setGuardando(false);
    }
  }

  if (loading) return <div className={styles.loadingState}>Cargando...</div>;

  return (
    <div className={styles.page}>
      <BackLink to="/configuracion/usuarios">Usuarios</BackLink>

      {!esNuevo && usuarioEditado ? (
        <section className={layoutStyles.hero}>
          <div className={layoutStyles.heroAvatar}>{iniciales(usuarioEditado.nombre)}</div>
          <div className={layoutStyles.heroInfo}>
            <h1 className={layoutStyles.heroName}>{usuarioEditado.nombre}</h1>
            <p className={layoutStyles.heroRole}>{usuarioEditado.cargo ? `${usuarioEditado.cargo} · ${usuarioEditado.email}` : usuarioEditado.email}</p>
            <p className={layoutStyles.heroMeta}>
              Cuenta creada el {fmtFecha(usuarioEditado.creado_en)} · Último acceso: {fmtAcceso(usuarioEditado.ultima_conexion) ?? 'nunca ha iniciado sesión'}
            </p>
          </div>
          <div className={layoutStyles.heroSide}>
            <Badge variant={usuarioEditado.activo ? 'success' : 'neutral'} dot={usuarioEditado.activo}>
              {usuarioEditado.activo ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </section>
      ) : (
        <div>
          <h1 className={styles.title}>Crear usuario</h1>
          <p className={styles.subtitle}>Da acceso al sistema a una persona y elige los roles que definen qué puede hacer.</p>
        </div>
      )}

      {error && (
        <div className={styles.formError} role="alert">
          <div>
            {error}
            {requisitosFaltantes && (
              <ul>
                {requisitosFaltantes.map((req) => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <form className={styles.formStack} onSubmit={handleSubmit}>
        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>Cuenta</h2>
            <p className={styles.sectionHint}>{esNuevo ? 'Datos con los que la persona inicia sesión.' : 'El correo no se puede cambiar.'}</p>
          </div>
          <div className={styles.row}>
            <Field className={styles.fieldLg} label="Nombre" required error={fieldErrors.nombre?.[0]}>
              {(fp) => <TextInput {...fp} value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} required />}
            </Field>
            <Field className={styles.fieldLg} label="Correo" required={esNuevo} error={fieldErrors.email?.[0]}>
              {(fp) => <TextInput {...fp} type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required={esNuevo} disabled={!esNuevo} />}
            </Field>
          </div>
          <div className={styles.row}>
            <Field className={styles.fieldLg} label="Cargo">
              {(fp) => <TextInput {...fp} value={form.cargo} onChange={(e) => setField('cargo', e.target.value)} />}
            </Field>
            <Field className={styles.fieldLg} label="Teléfono">
              {(fp) => <TextInput {...fp} value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} />}
            </Field>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>Roles y acceso</h2>
            <p className={styles.sectionHint}>Los roles definen qué puede hacer esta cuenta; las funcionalidades adicionales suman permisos solo para ella.</p>
          </div>
          <CheckboxGroup label="Roles" options={opcionesRoles} value={form.roles} onChange={(valor) => setField('roles', valor)} />
          {fieldErrors.roles?.[0] && <p className={styles.formError}>{fieldErrors.roles[0]}</p>}

          <CheckboxGroup
            label="Funcionalidades adicionales"
            hint="Permisos concedidos a mano a este usuario, por encima de los que ya le dan sus roles."
            options={opcionesFuncionalidades}
            value={form.funcionalidades_adicionales}
            onChange={(valor) => setField('funcionalidades_adicionales', valor)}
          />

          <div>
            <p className={styles.permisosTitulo}>Lo que podrá hacer con la selección actual</p>
            {esAdminRol ? (
              <p className={styles.permisosVacio}>Acceso total al sistema (rol de administrador).</p>
            ) : permisosEfectivos.length > 0 ? (
              <div className={styles.permisosChips}>
                {permisosEfectivos.map((slug) => (
                  <Badge key={slug} variant="info">
                    {funcionalidades[slug]?.nombre ?? slug}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className={styles.permisosVacio}>Ninguna funcionalidad con los roles actuales.</p>
            )}
          </div>

          {!esNuevo && (
            <Checkbox
              label="Cuenta activa"
              checked={form.activo}
              disabled={esMismaCuenta && form.activo}
              title={esMismaCuenta && form.activo ? 'No puedes desactivarte a ti mismo' : undefined}
              onChange={(e) => setField('activo', e.target.checked)}
            />
          )}
        </section>

        {!esNuevo && usuarioEditado && (
          <section className={styles.sectionCard}>
            <div>
              <h2 className={styles.sectionTitle}>Cuenta de Microsoft</h2>
              <p className={styles.sectionHint}>La cuenta se vincula sola en el primer ingreso con el correo de Outlook con el que se creó el usuario; desde aquí solo se consulta.</p>
            </div>
            {usuarioEditado.microsoft_id ? (
              <div className={styles.permisosChips}>
                <Badge variant="success" dot>
                  Vinculada
                </Badge>
                <span className={styles.sectionHint}>{usuarioEditado.microsoft_email ?? 'Cuenta vinculada'}</span>
              </div>
            ) : (
              <p className={styles.permisosVacio}>Todavía no ha ingresado con Microsoft; la cuenta se vincula sola en su primer ingreso.</p>
            )}
          </section>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate('/configuracion/usuarios')}>
            Cancelar
          </Button>
          <div className={styles.actionsEnd}>
            {!esNuevo && usuarioEditado && !usuarioEditado.activo && !esMismaCuenta && (
              <Button type="button" variant="danger" onClick={() => setConfirmarEliminar(true)} disabled={guardando || eliminando}>
                Eliminar usuario
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={guardando}>
              {guardando ? 'Guardando...' : esNuevo ? 'Crear usuario' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </form>

      <Modal
        open={confirmarEliminar}
        onClose={() => setConfirmarEliminar(false)}
        title="Eliminar usuario"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmarEliminar(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleEliminarDefinitivo} disabled={eliminando}>
              {eliminando ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </>
        }
      >
        <p>
          Se eliminará la cuenta de <strong>{usuarioEditado?.nombre}</strong> de forma definitiva. Si ya tiene solicitudes o registros asociados no se podrá borrar y deberá quedar inactiva.
        </p>
      </Modal>
    </div>
  );
}
