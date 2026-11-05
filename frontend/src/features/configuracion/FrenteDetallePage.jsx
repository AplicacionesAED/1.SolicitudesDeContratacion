// Detalle de un frente: datos propios, usuarios asignados (FrenteUsuario), y
// AprobadorFrente -- los "roles de responsabilidad" (personas y/o roles de
// sistema) que el motor de aprobación de Solicitudes usa para decidir quién
// puede actuar en cada paso (ver backend/src/modules/solicitud/solicitud.autorizacion.js).
//
// 2026-09-02 "eliminar permisos de rol para solicitudes": cada slot pasa de
// un array plano de usuario_id a `{ usuarios: [ids], roles: [nombresDeRol] }`
// -- alguien califica si está en `usuarios` O si tiene alguno de los `roles`.
// Se agregaron 2 slots nuevos (Director Técnico, Controles/ADPRO) que antes
// eran un chequeo de rol hardcodeado en el backend, sin ningún alcance por
// frente configurable.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getFrente, updateFrente, setFrenteUsuarios, getAprobadorFrente, updateAprobadorFrente } from '../../api/frentes.js';
import { listUsuarios } from '../../api/usuarios.js';
import { listProyectos } from '../../api/proyectos.js';
import { listDesvios } from '../../api/workflows.js';
import { listRoles } from '../../api/roles.js';
import { ROL_LABELS } from '../../utils/permisos.js';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { CheckboxListSelect } from '../../components/ui/CheckboxListSelect.jsx';
import { CheckboxGroup } from '../../components/ui/CheckboxGroup.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import layoutStyles from '../../components/layout/WizardLayout.module.css';
import styles from './Usuarios.module.css';
import extra from './Estructura.module.css';

// Mismo orden que el flujo real de aprobación (ver EstadoTimeline.jsx#WORKFLOW_STEPS
// y solicitud.autorizacion.js#ACCION_SLOT_FIJO/SLOT_POR_ESTADO_ORIGEN), no el
// orden en que se agregaron los slots al modelo -- así el admin ve los 6
// roles de responsabilidad en el mismo orden en que efectivamente actúan
// sobre la solicitud, no salteado.
//
// `codigo`: el CÓDIGO ESTABLE (no el nombre actual) del rol de sistema
// esperado para ESTE slot -- usado para acotar el selector de personas
// (2026-09-02, pedido explícito: "que filtre los usuarios de ese frente y
// luego filtre por el rol de ese usuario"). No es una validación del
// backend (el backend acepta cualquier usuario_id sin mirar su rol, a
// propósito -- ver aprobadorFrente.schema.js), es solo una ayuda del
// selector para no ofrecer, por ejemplo, un SOLICITANTE como candidato a
// "Director Técnico". Se usa `codigo` y no el nombre actual porque un
// admin puede renombrar el rol desde /configuracion/roles (2026-09-18) --
// el nombre real para comparar se resuelve en el render contra
// `usuario.rolesPorCodigo` (ver GET /usuarios/me, backend
// utils/permisos.js#getRolesPorCodigo), nunca hardcodeado acá.
// El número de orden NO va hardcodeado en el label -- se calcula en el
// render a partir de la posición dentro de la lista ya FILTRADA (ver más
// abajo, `tecnicoActivoPara`), porque "Director Técnico" puede no
// mostrarse para una categoría -- si el "1." quedara fijo en el string, la
// lista arrancaría en "2." sin que exista un "1." a la vista.
// 2026-09-18 "flujo propio de Directa (Orden de Servicio)": Directa dejó de
// compartir exactamente los mismos 6 slots que Indirecta -- 3 de los
// viejos (`director_proyecto`/`controles_adpro`/`director_controles`) ya no
// aplican a Directa (se reemplazan por 3 de los 4 nuevos: "Director de
// Obra" es un rol/slot DISTINTO de "Director de Proyecto", confirmado con
// el usuario -- NO una etiqueta alternativa del mismo), y hay un slot
// totalmente nuevo sin equivalente en Indirecta (`controles_proyeccion`).
// `soloDirecta`/`soloIndirecta` filtran cada slot por la pestaña activa
// (mismo criterio que ya usaba `tecnicoActivoPara` para Director Técnico,
// generalizado). `labelDirecta` (solo en `contratos_minuta`) es el nombre
// que ESE MISMO slot/rol (Contratos) recibe en el vocabulario de Directa.
//
// `codigo` de "Director de Obra"/"Residente Administrativo" (DIRECTOR_OBRA/
// RESIDENTE_ADMINISTRATIVO) también apunta a un código estable propio,
// sembrado igual que los del scaffold original -- ver la migración
// 20260918150000-add-codigo-a-roles.js (backend).
const SLOTS = [
  { campo: 'director_tecnico', label: 'Director Técnico (desvío opcional, antes de Director de Proyecto)', codigo: 'DIRECTOR_TECNICO', soloIndirecta: true },
  { campo: 'director_proyecto', label: 'Director de Proyecto (aprueba la solicitud)', codigo: 'DIRECTOR_PROYECTO', soloIndirecta: true },
  { campo: 'director_obra', label: 'Director de Obra (aprueba la solicitud)', codigo: 'DIRECTOR_OBRA', soloDirecta: true },
  { campo: 'controles_proyeccion', label: 'Controles — Proyección (aprueba con fecha)', codigo: 'CONTROLES', soloDirecta: true },
  { campo: 'contratos_tramite', label: 'Contratos — Trámite', codigo: 'CONTRATOS' },
  { campo: 'contratos_minuta', label: 'Contratos — Creación de Minuta', labelDirecta: 'Contratos — Elaboración de Orden', codigo: 'CONTRATOS' },
  { campo: 'residente_administrativo', label: 'Residente Administrativo — Minuta de Adpro', codigo: 'RESIDENTE_ADMINISTRATIVO', soloDirecta: true },
  { campo: 'controles_adpro', label: 'Controles / N° Adpro', codigo: 'CONTROLES', soloIndirecta: true },
  { campo: 'director_controles', label: 'Director de Controles (aprobación final)', codigo: 'DIRECTOR_CONTROLES', soloIndirecta: true },
  { campo: 'controles_aprobacion_final', label: 'Director/a de Controles (aprueba el total)', codigo: 'CONTROLES', soloDirecta: true },
  // Paso nuevo AL FINAL del flujo Directa, 2026-10-09 -- aprueba después de
  // Director/a de Controles, antes de Completada.
  { campo: 'gerente_compras', label: 'Gerente de Compras (firma Compras y Contrataciones, antes de Residente Administrativo — Adpro)', codigo: 'GERENTE_COMPRAS', soloDirecta: true },
];

// Puerto de "asignar usuarios a un registro" con CheckboxListSelect en vez
// de un <select multiple> nativo -- ver la regla "Selección de uno a
// muchos" en ARQUITECTURA-FRONTEND.md (este era exactamente el gap real que
// esa regla cierra).
function SelectorUsuarios({ label, usuarios, seleccionados, onChange }) {
  return (
    <div>
      <p className={extra.fieldLabel}>{label}</p>
      <CheckboxListSelect
        searchPlaceholder="Buscar usuario..."
        options={usuarios.map((u) => ({ id: u.id, label: u.nombre }))}
        selectedIds={seleccionados}
        onChange={onChange}
      />
    </div>
  );
}

// Un slot de AprobadorFrente califica a alguien por persona especifica O por rol de sistema. `rolOpciones` viene
// de la tabla real (GET /roles), no de un mapa fijo.
function SelectorSlot({ numero, label, usuarios, slot, rolOpciones, onChangeUsuarios, onChangeRoles }) {
  return (
    <div className={extra.slot}>
      <p className={extra.slotLabel}>
        <span className={extra.slotNum}>{numero}</span>
        {label}
      </p>
      <SelectorUsuarios label="Personas" usuarios={usuarios} seleccionados={slot.usuarios} onChange={onChangeUsuarios} />
      <CheckboxGroup label="O cualquiera con estos roles" options={rolOpciones} value={slot.roles} onChange={onChangeRoles} />
    </div>
  );
}

export function FrenteDetallePage() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const rolesPorCodigo = usuario?.rolesPorCodigo ?? {};
  const [frente, setFrente] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [rolOpciones, setRolOpciones] = useState([]);
  // Un mismo frente puede tener aprobadores distintos para sus solicitudes
  // directas que para las indirectas -- se cargan las dos configs de una vez
  // y se edita/guarda una a la vez según la pestaña activa (categoriaTab).
  const [aprobadores, setAprobadores] = useState({ DIRECTA: null, INDIRECTA: null });
  const [categoriaTab, setCategoriaTab] = useState('INDIRECTA');
  const [datosForm, setDatosForm] = useState({ nombre: '', etapa: '', proyecto_id: '' });
  const [usuarioIds, setUsuarioIds] = useState([]);
  const [desvios, setDesvios] = useState([]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);

  function cargar() {
    Promise.all([getFrente(id), listUsuarios(), listProyectos(), getAprobadorFrente(id, 'DIRECTA'), getAprobadorFrente(id, 'INDIRECTA'), listDesvios(), listRoles()])
      .then(([frenteRes, usuariosRes, proyectosRes, aprobadorDirectaRes, aprobadorIndirectaRes, desviosRes, rolesRes]) => {
        setFrente(frenteRes.data);
        setDatosForm({ nombre: frenteRes.data.nombre, etapa: frenteRes.data.etapa ?? '', proyecto_id: frenteRes.data.proyecto_id });
        setUsuarioIds(frenteRes.data.usuarios.map((u) => u.id));
        setUsuarios(usuariosRes.data);
        setProyectos(proyectosRes.data);
        setAprobadores({ DIRECTA: aprobadorDirectaRes.data, INDIRECTA: aprobadorIndirectaRes.data });
        setDesvios(desviosRes.data);
        setRolOpciones(rolesRes.data.map((rol) => ({ value: rol.nombre, label: ROL_LABELS[rol.nombre] ?? rol.nombre })));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(cargar, [id]);

  // "Director Técnico" solo participa en una categoría si hay un desvío
  // ACTIVO que la lleve a PENDIENTE_DIRECTOR_TECNICO (hoy, solo
  // INDIRECTA+TECNICA) -- calculado en vivo contra los desvíos reales, no
  // hardcodeado, mismo criterio que WorkflowDiagramaPage.jsx (que por el
  // mismo motivo deja de dibujar ese nodo del todo para la categoría donde
  // no aplica). Antes de este fix, el slot de "Director Técnico" se
  // mostraba en las dos pestañas por igual, dejando configurar un
  // aprobador que la solicitud real nunca iba a consultar.
  function tecnicoActivoPara(categoria) {
    return desvios.some(
      (d) => d.activo && d.accion === 'ENVIAR' && d.estado_destino === 'PENDIENTE_DIRECTOR_TECNICO' && (!d.condicion_categoria || d.condicion_categoria === categoria)
    );
  }

  async function guardarDatos(e) {
    e.preventDefault();
    setGuardando('datos');
    setError(null);
    try {
      await updateFrente(id, { nombre: datosForm.nombre, etapa: datosForm.etapa ? Number(datosForm.etapa) : null, proyecto_id: Number(datosForm.proyecto_id) });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  async function guardarUsuarios() {
    setGuardando('usuarios');
    setError(null);
    try {
      await setFrenteUsuarios(id, usuarioIds);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  async function guardarAprobador() {
    const actual = aprobadores[categoriaTab];
    setGuardando('aprobador');
    setError(null);
    try {
      // Manda TODOS los campos de SLOTS (ya 9, no 6) en vez de listarlos a
      // mano acá -- evita mantener la misma lista de nombres en dos
      // lugares (ver SLOTS más arriba).
      const payload = {};
      for (const { campo } of SLOTS) payload[campo] = actual[campo];
      await updateAprobadorFrente(id, categoriaTab, payload);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  function actualizarSlot(campo, cambios) {
    setAprobadores((prev) => ({
      ...prev,
      [categoriaTab]: { ...prev[categoriaTab], [campo]: { ...prev[categoriaTab][campo], ...cambios } },
    }));
  }

  if (!frente || !aprobadores.DIRECTA || !aprobadores.INDIRECTA) return null;
  const aprobador = aprobadores[categoriaTab];

  const proyectoNombre = proyectos.find((pr) => pr.id === frente.proyecto_id)?.nombre ?? frente.proyecto?.nombre;
  const slotsVisibles = SLOTS.filter(({ campo, soloDirecta, soloIndirecta }) => {
    if (campo === 'director_tecnico') return tecnicoActivoPara(categoriaTab);
    if (soloDirecta) return categoriaTab === 'DIRECTA';
    if (soloIndirecta) return categoriaTab === 'INDIRECTA';
    return true;
  });

  return (
    <div className={styles.page}>
      <BackLink to="/configuracion/frentes">Frentes</BackLink>

      <section className={layoutStyles.hero}>
        <div className={layoutStyles.heroAvatar}>
          <Layers size={34} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className={layoutStyles.heroInfo}>
          <h1 className={layoutStyles.heroName}>{frente.nombre}</h1>
          <p className={layoutStyles.heroRole}>{proyectoNombre}</p>
          <p className={layoutStyles.heroMeta}>{frente.etapa != null ? `Etapa ${frente.etapa} · ` : ''}{frente.usuarios.length} persona(s) asignada(s)</p>
        </div>
        <div className={layoutStyles.heroSide}>
          <Badge variant="info">{frente.usuarios.length} persona(s)</Badge>
        </div>
      </section>

      {error && (
        <div className={styles.formError} role="alert">
          {error}
        </div>
      )}

      <div className={styles.formStack}>
        <form className={styles.sectionCard} onSubmit={guardarDatos}>
          <div>
            <h2 className={styles.sectionTitle}>Datos del frente</h2>
            <p className={styles.sectionHint}>Nombre, proyecto al que pertenece y etapa.</p>
          </div>
          <div className={styles.row}>
            <Field className="fieldMd" label="Nombre" required>
              {(p) => <TextInput {...p} value={datosForm.nombre} onChange={(e) => setDatosForm({ ...datosForm, nombre: e.target.value })} required />}
            </Field>
            <Field className="fieldMd" label="Proyecto" required>
              {(p) => (
                <Select {...p} value={datosForm.proyecto_id} onChange={(e) => setDatosForm({ ...datosForm, proyecto_id: e.target.value })} required>
                  {proyectos.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field className="fieldMd" label="Etapa">
              {(p) => <TextInput {...p} type="number" value={datosForm.etapa} onChange={(e) => setDatosForm({ ...datosForm, etapa: e.target.value })} />}
            </Field>
          </div>
          <div className={styles.actions}>
            <span />
            <Button type="submit" variant="primary" disabled={guardando === 'datos'}>
              {guardando === 'datos' ? 'Guardando...' : 'Guardar datos'}
            </Button>
          </div>
        </form>

        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>Personas asignadas al frente</h2>
            <p className={styles.sectionHint}>Solo ellas podrán elegirse como aprobadores de abajo.</p>
          </div>
          <SelectorUsuarios label="Personas" usuarios={usuarios} seleccionados={usuarioIds} onChange={setUsuarioIds} />
          <div className={styles.actions}>
            <span />
            <Button type="button" variant="primary" onClick={guardarUsuarios} disabled={guardando === 'usuarios'}>
              {guardando === 'usuarios' ? 'Guardando...' : 'Guardar asignación'}
            </Button>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div>
            <h2 className={styles.sectionTitle}>Aprobadores del frente</h2>
            <p className={styles.sectionHint}>Cada paso lo puede ejecutar una persona específica, cualquiera con un rol marcado, o ambos. Las solicitudes Directas e Indirectas se configuran por separado.</p>
          </div>
          <div className={extra.tabs} role="tablist">
            {['INDIRECTA', 'DIRECTA'].map((cat) => (
              <button key={cat} type="button" role="tab" aria-selected={categoriaTab === cat} className={`${extra.tab} ${categoriaTab === cat ? extra.tabActive : ''}`} onClick={() => setCategoriaTab(cat)}>
                {cat === 'DIRECTA' ? 'Directa' : 'Indirecta'}
              </button>
            ))}
          </div>
          <div className={extra.slots}>
            {slotsVisibles.map(({ campo, label, labelDirecta, codigo }, index) => {
              const labelEfectivo = categoriaTab === 'DIRECTA' && labelDirecta ? labelDirecta : label;
              const slot = aprobador[campo];
              // Nombre ACTUAL del rol de sistema esperado para este slot (resuelto por codigo estable, un admin puede
              // haber renombrado el rol). Solo se ofrece a quien ya esta asignado al frente Y tiene ese rol, mas
              // quien YA estaba elegido en el slot, para no esconder en silencio una seleccion guardada.
              const rolActual = rolesPorCodigo[codigo] ?? codigo;
              const usuariosElegibles = usuarios.filter((u) => (usuarioIds.includes(u.id) && (u.roles ?? []).includes(rolActual)) || slot.usuarios.includes(u.id));
              return (
                <SelectorSlot
                  key={campo}
                  numero={index + 1}
                  label={labelEfectivo}
                  usuarios={usuariosElegibles}
                  slot={slot}
                  rolOpciones={rolOpciones}
                  onChangeUsuarios={(ids) => actualizarSlot(campo, { usuarios: ids })}
                  onChangeRoles={(roles) => actualizarSlot(campo, { roles })}
                />
              );
            })}
          </div>
          <div className={styles.actions}>
            <span />
            <Button type="button" variant="primary" onClick={guardarAprobador} disabled={guardando === 'aprobador'}>
              {guardando === 'aprobador' ? 'Guardando...' : `Guardar aprobadores (${categoriaTab === 'DIRECTA' ? 'Directa' : 'Indirecta'})`}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
