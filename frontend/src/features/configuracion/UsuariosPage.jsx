// Lista de usuarios con el mismo diseno que la del HRMS y Cartera (migracion de diseno 2026-10-09):
// tarjetas de resumen, filtros con etiqueta (rol, estado, primer ingreso, Microsoft), acciones masivas
// (generar contrasenas / activar / inactivar) y la tabla con persona + avatar. Hay pocas cuentas, asi que
// busqueda, orden y paginacion se resuelven en el navegador sobre `GET /usuarios` completo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { SortHeader } from '../../components/ui/SortHeader.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { ariaSort, useSortableTable } from '../../hooks/useSortableTable.js';
import { listUsuarios, accionMasivaUsuarios } from '../../api/usuarios.js';
import { listRoles } from '../../api/roles.js';
import { ROL_LABELS } from '../../utils/permisos.js';
import { iniciales, fmtAcceso } from './usuarioUtils.js';
import styles from './Usuarios.module.css';

const PAGE_SIZE = 20;

const ACCIONES = {
  activar: { titulo: 'Activar cuentas', texto: 'Las cuentas seleccionadas podrán iniciar sesión.', boton: 'Activar' },
  inactivar: { titulo: 'Inactivar cuentas', texto: 'Las cuentas seleccionadas no podrán iniciar sesión hasta que las actives de nuevo.', boton: 'Inactivar' },
};

const etiquetaRol = (rol) => ROL_LABELS[rol] ?? rol;

const VALORES_ORDEN = {
  nombre: (u) => u.nombre,
  roles: (u) => (u.roles ?? []).map(etiquetaRol).join(', '),
  ultimo_acceso: (u) => (u.ultima_conexion ? new Date(u.ultima_conexion).getTime() : null),
  estado: (u) => (u.activo ? 0 : 1),
};

export function UsuariosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [todos, setTodos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState(searchParams.get('rol') ?? ''); // ?rol= viene del enlace "Cuentas" de Roles
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMicrosoft, setFiltroMicrosoft] = useState('');
  const [page, setPage] = useState(1);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [confirmar, setConfirmar] = useState(null); // clave de ACCIONES
  const [ejecutando, setEjecutando] = useState(false);
  const [avisoMasivo, setAvisoMasivo] = useState(null);

  useEffect(() => {
    listRoles()
      .then((res) => setRoles(res.data.map((rol) => rol.nombre)))
      .catch(() => {});
  }, []);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    listUsuarios()
      .then((res) => {
        setTodos(res.data);
        setSeleccion(new Set());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todos.filter((u) => {
      if (q && !`${u.nombre} ${u.email} ${u.cargo ?? ''}`.toLowerCase().includes(q)) return false;
      if (filtroRol && !(u.roles ?? []).includes(filtroRol)) return false;
      if (filtroEstado && String(u.activo) !== filtroEstado) return false;
      if (filtroMicrosoft === 'vinculada' && !u.microsoft_id) return false;
      if (filtroMicrosoft === 'sin' && u.microsoft_id) return false;
      return true;
    });
  }, [todos, busqueda, filtroRol, filtroEstado, filtroMicrosoft]);

  const { sortedRows, sort, toggleSort } = useSortableTable(filtrados, VALORES_ORDEN);
  const usuarios = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const todasMarcadas = usuarios.length > 0 && usuarios.every((u) => seleccion.has(u.id));
  const alternar = (id) =>
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  const alternarTodas = () => setSeleccion(todasMarcadas ? new Set() : new Set(usuarios.map((u) => u.id)));

  async function ejecutarAccion() {
    setEjecutando(true);
    setError(null);
    try {
      const res = await accionMasivaUsuarios([...seleccion], confirmar);
      const accion = confirmar;
      setConfirmar(null);
      setAvisoMasivo(`${res.data.procesados} cuenta(s) ${accion === 'activar' ? 'activadas' : 'inactivadas'}.`);
      cargar();
    } catch (err) {
      setConfirmar(null);
      setError(err.message);
    } finally {
      setEjecutando(false);
    }
  }

  const cambiarFiltro = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const hayFiltros = busqueda !== '' || filtroRol !== '' || filtroEstado !== '' || filtroMicrosoft !== '';
  const limpiar = () => {
    setBusqueda('');
    setFiltroRol('');
    setFiltroEstado('');
    setFiltroMicrosoft('');
    setPage(1);
  };

  const tarjetas = [
    { valor: todos.length, label: 'Cuentas' },
    { valor: todos.filter((u) => u.activo).length, label: 'Activas' },
    { valor: todos.filter((u) => !u.activo).length, label: 'Inactivas' },
    { valor: todos.filter((u) => u.microsoft_id).length, label: 'Con Microsoft' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.title}>Usuarios</h1>
          <p className={styles.subtitle}>Cuentas de acceso al sistema y los roles que definen qué puede hacer cada una.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/configuracion/usuarios/nueva')}>
          Crear usuario
        </Button>
      </div>

      {!loading && (
        <div className={styles.kpiRow}>
          {tarjetas.map((tarjeta) => (
            <div key={tarjeta.label} className={styles.kpiCard}>
              <span className={styles.kpiValor}>{tarjeta.valor}</span>
              <span className={styles.kpiLabel}>{tarjeta.label}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <div className={styles.filters}>
        <label className={`${styles.filterField} ${styles.filterSearch}`}>
          <span>Buscar</span>
          <input type="text" className={styles.control} placeholder="Nombre, correo o cargo..." value={busqueda} onChange={cambiarFiltro(setBusqueda)} aria-label="Buscar usuarios" />
        </label>
        <label className={styles.filterField}>
          <span>Rol</span>
          <select className={styles.control} value={filtroRol} onChange={cambiarFiltro(setFiltroRol)}>
            <option value="">Todos</option>
            {roles.map((nombre) => (
              <option key={nombre} value={nombre}>
                {etiquetaRol(nombre)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span>Estado</span>
          <select className={styles.control} value={filtroEstado} onChange={cambiarFiltro(setFiltroEstado)}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </label>
        <label className={styles.filterField}>
          <span>Microsoft</span>
          <select className={styles.control} value={filtroMicrosoft} onChange={cambiarFiltro(setFiltroMicrosoft)}>
            <option value="">Todos</option>
            <option value="vinculada">Vinculada</option>
            <option value="sin">Sin vincular</option>
          </select>
        </label>
        {hayFiltros && (
          <button type="button" className={styles.clearBtn} onClick={limpiar}>
            Limpiar filtros
          </button>
        )}
      </div>

      {avisoMasivo && (
        <div className={styles.passwordBanner} role="status">
          {avisoMasivo}
        </div>
      )}

      {seleccion.size > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="Acciones masivas">
          <span className={styles.bulkCount}>{seleccion.size} seleccionada(s)</span>
          <Button variant="secondary" onClick={() => setConfirmar('activar')}>
            Activar
          </Button>
          <Button variant="secondary" onClick={() => setConfirmar('inactivar')}>
            Inactivar
          </Button>
          <button type="button" className={styles.bulkClear} onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCell}>
                <Checkbox checked={todasMarcadas} onChange={alternarTodas} aria-label="Seleccionar todas las cuentas de esta página" />
              </th>
              <th aria-sort={ariaSort(sort, 'nombre')}>
                <SortHeader label="Usuario" sortKey="nombre" sort={sort} onSort={toggleSort} />
              </th>
              <th aria-sort={ariaSort(sort, 'roles')}>
                <SortHeader label="Roles" sortKey="roles" sort={sort} onSort={toggleSort} />
              </th>
              <th aria-sort={ariaSort(sort, 'ultimo_acceso')}>
                <SortHeader label="Último acceso" sortKey="ultimo_acceso" sort={sort} onSort={toggleSort} />
              </th>
              <th aria-sort={ariaSort(sort, 'estado')}>
                <SortHeader label="Estado" sortKey="estado" sort={sort} onSort={toggleSort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  Cargando...
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  Sin usuarios que coincidan.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className={styles.clickableRow} onClick={() => navigate(`/configuracion/usuarios/${u.id}`)}>
                  <td className={styles.checkCell} onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={seleccion.has(u.id)} onChange={() => alternar(u.id)} aria-label={`Seleccionar a ${u.nombre}`} />
                  </td>
                  <td>
                    <div className={styles.personaCell}>
                      <span className={styles.avatar}>{iniciales(u.nombre)}</span>
                      <span className={styles.personaTexto}>
                        <span className={styles.personaNombre}>{u.nombre}</span>
                        <span className={styles.personaDoc}>{u.cargo ? `${u.cargo} · ${u.email}` : u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={`${styles.rolesCell} ${styles.rolesUnaLinea}`}>
                      {(u.roles ?? []).map((rol) => (
                        <Badge key={rol} variant="info">
                          {etiquetaRol(rol)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={`${styles.dateCell} ${u.ultima_conexion ? '' : styles.muted}`}>
                    {fmtAcceso(u.ultima_conexion) ?? 'Nunca'}
                  </td>
                  <td>
                    <div className={styles.rolesCell}>
                      {u.activo ? (
                        <Badge variant="success" dot>
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="neutral" dot>
                          Inactivo
                        </Badge>
                      )}
                      {u.microsoft_id && <Badge variant="neutral">Microsoft</Badge>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && <Pagination page={page} pageSize={PAGE_SIZE} total={filtrados.length} onPageChange={setPage} />}
      </div>

      <Modal
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title={confirmar ? ACCIONES[confirmar].titulo : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button variant={confirmar === 'inactivar' ? 'danger' : 'primary'} onClick={ejecutarAccion} disabled={ejecutando}>
              {ejecutando ? 'Procesando...' : confirmar ? ACCIONES[confirmar].boton : ''}
            </Button>
          </>
        }
      >
        {confirmar && (
          <p>
            {ACCIONES[confirmar].texto} <strong>{seleccion.size} cuenta(s)</strong> seleccionada(s). Tu propia cuenta nunca se modifica.
          </p>
        )}
      </Modal>
    </div>
  );
}
