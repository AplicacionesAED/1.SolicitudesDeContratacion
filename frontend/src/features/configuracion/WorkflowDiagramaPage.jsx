// Diagrama de flujo del motor de aprobación de Solicitud, para UNA
// categoría (`/configuracion/workflows/:categoriaSlug` -- ver
// WorkflowsPage.jsx, ahora el listado de las 2 categorías). Canvas real con
// @xyflow/react (pan/zoom/arrastre de nodos), vertical. Cada caja es un
// ESTADO (fijo, ver solicitud.estado.js#ESTADOS_ORIGEN/ESTADO_DESTINO -- la
// FORMA del flujo no se edita acá, a propósito, y es la MISMA para las dos
// categorías: las 11 acciones son un solo motor compartido). Cada píldora
// sobre una flecha es una ACCIÓN (clickeable, navega al detalle de esa
// acción PARA ESTA categoría, ver WorkflowDetallePage.jsx).
//
// 2026-09-02 "dame acceso a modificar las líneas": el canvas pasó de
// solo-lectura (arrastrar un nodo era solo para leer más cómodo, se
// perdía al recargar) a editable -- un admin puede arrastrar los nodos
// para que las líneas no se crucen y guardarlo con el botón "Guardar
// posiciones" (`workflow.service.js#saveLayout`, compartido entre TODOS
// los admins, no por navegador). `nodesConnectable={false}` se mantiene --
// se puede reacomodar DÓNDE está cada estado, pero no dibujar una conexión
// nueva ni cambiar qué acción une a cuáles estados (eso queda para más
// adelante, pedido explícito: "de momento [las líneas], el flujo [la forma]
// después").
//
// 2026-09-02 "separar los workflows de Directas/Indirectas": lo único que
// de verdad cambia entre categorías es si hay un desvío ACTIVO que lleve a
// PENDIENTE_DIRECTOR_TECNICO para esa categoría (hoy solo existe uno, para
// INDIRECTA+TECNICA -- el negocio documentó que "el área de Técnica no
// participa en solicitudes directas"). Pedido explícito de seguimiento:
// "si en Directos no existe Director Técnico no debe aparecer... la idea es
// que sean dos workflows distintos" -- ese nodo y sus 3 aristas NO se
// dibujan en absoluto (no alcanza con atenuarlo) cuando la categoría actual
// no tiene un desvío activo que lo alcance, calculado en vivo a partir de
// los desvíos reales (`tecnicoActivo` más abajo), no hardcodeado por
// categoría -- así que si el negocio agrega un desvío nuevo para Directas
// más adelante, ESE diagrama empieza a mostrarlo solo, sin tocar código.
//
// `ENVIO_CONTRATO_POLIZAS`/`PASAR_CONTROLES` NO se muestran (2026-09-02,
// pedido explícito: "no existe, quitarlo de ambos") -- ningún
// ESTADO_DESTINO de ninguna otra acción produce ese estado, así que era un
// nodo fantasma sin ninguna solicitud real que pase por ahí. Se quitó del
// diagrama de las dos categorías; el estado/acción siguen existiendo en el
// motor (`solicitud.autorizacion.js`/`workflow.schema.js`) -- no se tocó
// ese código, solo se dejó de dibujar un camino que nunca se recorre.
//
// 2026-09-18 "flujo propio de Directa": mismo criterio que Director
// Técnico, pero con la polaridad invertida -- EN_PROYECCION_CONTROLES (el
// paso nuevo de "Controles realiza proyección") solo existe para Directa,
// nunca para Indirecta. Se calcula en vivo contra el desvío real
// (`proyeccionActiva` más abajo: ¿hay un desvío ACTIVO de APROBAR_DIRECTOR
// -> EN_PROYECCION_CONTROLES para esta categoría?), no hardcodeado por
// categoría -- si el negocio lo desactiva algún día, este diagrama deja de
// dibujarlo solo. Cuando está activo, la píldora de APROBAR_DIRECTOR deja
// de apuntar directo a EN_TRAMITE_CONTRATOS y pasa por este nodo nuevo
// primero (con su propia píldora APROBAR_PROYECCION y su propia salida de
// DEVOLVER hacia DEVUELTA).
//
// 2026-09-21 "Residente Administrativo — Revisión": MISMÍSIMO criterio,
// encadenado antes de la proyección -- PENDIENTE_RESIDENTE_ADMINISTRATIVO
// (paso nuevo de Directa entre Director de Obra y Controles-Proyección)
// también se calcula en vivo contra el desvío real (`residenteActivo` más
// abajo: ¿hay un desvío ACTIVO de APROBAR_DIRECTOR ->
// PENDIENTE_RESIDENTE_ADMINISTRATIVO para esta categoría?). Cuando está
// activo, la píldora de APROBAR_DIRECTOR apunta a este nodo primero, que
// lleva su propia píldora APROBAR_RESIDENTE_ADMINISTRATIVO hacia
// EN_PROYECCION_CONTROLES (o EN_TRAMITE_CONTRATOS si la proyección está
// desactivada).
//
// 2026-09-22 DEVOLVER a paso 3 (backend de Jim, en paralelo): este nodo YA
// tiene salida de DEVOLVER hacia DEVUELTA (el pedido original "solo aprobar
// + editar" se amplió -- la edición ya no reemplaza al devolver, ahora
// existe el botón Devolver en ese estado, ver SolicitudActions.jsx). Además,
// los DEVOLVER de EN_PROYECCION_CONTROLES (e-devolver-proyeccion) y de
// EN_TRAMITE_CONTRATOS (e-devolver-tramite) aparejan acá (a este nodo) en
// vez de a DEVUELTA cuando `residenteActivo` aplica, porque el backend
// redirige su destino a PENDIENTE_RESIDENTE_ADMINISTRATIVO (solo Directa);
// cuando el flag no aplica quedan apuntando a DEVUELTA como siempre.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, Position, useNodesState, applyNodeChanges, ViewportPortal } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Zap } from 'lucide-react';
import { listDesvios, getLayout, saveLayout } from '../../api/workflows.js';
import { ESTADO_LABELS, ESTADO_BADGE_VARIANT, CATEGORIA_LABELS, categoriaFromSlug } from '../../utils/solicitudes.js';
import { BackLink } from '../../components/ui/BackLink.jsx';
import { Button } from '../../components/ui/Button.jsx';
import styles from './Usuarios.module.css';
import diagramStyles from './Workflows.module.css';
import { EstadoNode } from './EstadoNode.jsx';
import { AccionEdge } from './AccionEdge.jsx';

const nodeTypes = { estado: EstadoNode };
const edgeTypes = { accion: AccionEdge };

const MARKER_COLOR = {
  edgeMain: '#232bed',
  edgeDanger: '#9f2b25',
  edgeWarning: '#8a5a00',
  edgeMuted: '#c3cbd6',
};

const SLUGS_VALIDOS = ['directas', 'indirectas'];

// 2026-09-02 "reorganizar para que no se crucen líneas" -- posiciones
// default rediseñadas de punta a punta (usadas solo mientras una categoría
// no tenga un layout guardado -- ver `getLayout()` en el componente). El
// problema real del diseño anterior: ENVIADA (el nodo con más relaciones --
// 6 aristas distintas) tenía TODAS sus conexiones de un mismo lado
// saliendo/entrando del mismo punto exacto (el centro del lado, default de
// React Flow sin `offset`), así que se cruzaban entre sí al abrirse en
// abanico hacia destinos a distinta altura -- y "Aprobar (Dir. Técnico)"
// salía por ARRIBA de Pendiente Director Técnico, obligándola a arquearse
// por encima de la línea de "Enviar" antes de bajar. Este rediseño separa
// el tronco principal (Enviar/Devolver/Revisar, x=300-680, tramos cortos)
// de la rama de excepción (Pendiente/Devuelta/En Revisión, x=680) y le da a
// cada handle que comparte lado con otro un `offset` propio (posición a lo
// largo del lado, ver EstadoNode.jsx) en vez de que todos caigan en el
// centro -- un admin puede seguir ajustando esto a mano arrastrando nodos
// (y guardándolo) si encuentra un acomodo mejor.
const NODOS_DEF = [
  { id: 'BORRADOR', x: 300, y: 0, handles: [{ id: 'out', type: 'source', position: Position.Bottom }, { id: 'out-tecnico', type: 'source', position: Position.Right, offset: 50 }] },
  {
    id: 'ENVIADA',
    x: 300,
    y: 260,
    handles: [
      { id: 'in-top', type: 'target', position: Position.Top },
      { id: 'out-devolver', type: 'source', position: Position.Right, offset: 25 },
      { id: 'in-aprobar', type: 'target', position: Position.Right, offset: 50 },
      { id: 'in-reenviar', type: 'target', position: Position.Right, offset: 75 },
      { id: 'out-bottom', type: 'source', position: Position.Bottom },
    ],
  },
  // Solo para Directa (`residenteActivo`, ver el comentario grande de
  // arriba) -- ubicado en el mismo tronco principal (x=300), entre ENVIADA
  // y EN_PROYECCION_CONTROLES. Mismo criterio visual que el nodo de la
  // proyección: no se movieron las posiciones del resto del tronco para no
  // afectar el diagrama de Indirecta (nunca dibuja este nodo) -- si queda
  // visualmente apretado, un admin puede arrastrarlo y guardarlo.
  {
    id: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
    x: 300,
    y: 335,
    handles: [
      { id: 'in-top', type: 'target', position: Position.Top },
      // 2026-09-22 DEVOLVER ya existe desde este paso (va a DEVUELTA) --
      // ver el comentario grande al inicio.
      { id: 'out-devolver', type: 'source', position: Position.Right },
      { id: 'out-bottom', type: 'source', position: Position.Bottom },
      // Destinos de los DEVOLVER redirigidos desde proyección/trámite
      // (solo cuando `residenteActivo`, ver el comentario grande al
      // inicio) -- offsets distintos para que las dos líneas no se pisen.
      { id: 'in-devolver-proyeccion', type: 'target', position: Position.Left, offset: 25 },
      { id: 'in-devolver-tramite', type: 'target', position: Position.Left, offset: 50 },
    ],
  },
  // Solo para Directa (`proyeccionActiva`, ver el comentario grande de
  // arriba) -- ubicado en el mismo tronco principal (x=300) que
  // ENVIADA/EN_TRAMITE_CONTRATOS, entre los dos. No se movieron las
  // posiciones y del resto del tronco para no afectar el diagrama de
  // Indirecta (que nunca dibuja este nodo) -- si queda visualmente
  // apretado, un admin puede arrastrarlo y guardarlo.
  {
    id: 'EN_PROYECCION_CONTROLES',
    x: 300,
    y: 410,
    handles: [
      { id: 'in-top', type: 'target', position: Position.Top },
      { id: 'out-bottom', type: 'source', position: Position.Bottom },
      { id: 'out-devolver', type: 'source', position: Position.Right },
    ],
  },
  {
    id: 'EN_TRAMITE_CONTRATOS',
    x: 300,
    y: 560,
    handles: [
      { id: 'in-top', type: 'target', position: Position.Top },
      { id: 'out-devolver', type: 'source', position: Position.Right, offset: 30 },
      { id: 'out-revisar', type: 'source', position: Position.Right, offset: 70 },
      { id: 'out-bottom', type: 'source', position: Position.Bottom },
    ],
  },
  { id: 'CREACION_MINUTA', x: 300, y: 860, handles: [{ id: 'in', type: 'target', position: Position.Top }, { id: 'out', type: 'source', position: Position.Bottom }] },
  {
    id: 'EN_CONTROLES',
    x: 300,
    y: 1080,
    handles: [
      { id: 'in', type: 'target', position: Position.Top },
      { id: 'out', type: 'source', position: Position.Bottom },
      { id: 'out-anular', type: 'source', position: Position.Right },
    ],
  },
  { id: 'APROBACION_FINAL', x: 300, y: 1300, handles: [{ id: 'in', type: 'target', position: Position.Top }, { id: 'out', type: 'source', position: Position.Bottom }] },
  // Solo para Directa (`gerenteComprasActivo`): firma del Gerente de Compras. Desde 2026-11-03 va entre
  // CREACION_MINUTA y EN_CONTROLES (antes de Adpro). Mismo criterio visual que los demás nodos condicionales de este
  // archivo: ubicado en el tronco principal, sin mover la posición de ningún otro nodo.
  { id: 'PENDIENTE_GERENTE_COMPRAS', x: 300, y: 970, handles: [{ id: 'in', type: 'target', position: Position.Top }, { id: 'out', type: 'source', position: Position.Bottom }] },
  { id: 'COMPLETADA', x: 300, y: 1520, handles: [{ id: 'in', type: 'target', position: Position.Top }] },

  // ANULAR (2026-09-09) es una acción bastante distinta del resto: puede
  // dispararse desde CASI CUALQUIER estado no-terminal (ver
  // solicitud.autorizacion.js#ESTADOS_NO_TERMINALES), no solo desde uno --
  // dibujar las ~8 flechas reales habría significado cruzar por encima del
  // tronco principal Y de la rama de excepción sin poder verificar a ojo
  // que no quedaran amontonadas (esta sesión no tiene navegador
  // disponible). Se optó por dibujar UNA sola flecha representativa, desde
  // EN_CONTROLES -- el estado ligado al ejemplo concreto que motivó el
  // pedido ("la persona de Controles que registra el N° Adpro") -- dejando
  // claro en el comentario que el motor real acepta más orígenes que los
  // que se ven acá. Mismo espíritu que el conector punteado
  // BORRADOR→PENDIENTE_DIRECTOR_TECNICO de más arriba (representa un
  // mecanismo más amplio sin dibujarlo completo).
  { id: 'ANULADA', x: 680, y: 1080, handles: [{ id: 'in', type: 'target', position: Position.Left }] },

  {
    id: 'PENDIENTE_DIRECTOR_TECNICO',
    x: 680,
    y: 90,
    handles: [
      { id: 'in', type: 'target', position: Position.Left, offset: 35 },
      { id: 'out-aprobar', type: 'source', position: Position.Right, offset: 50 },
      { id: 'out-devolver', type: 'source', position: Position.Bottom },
    ],
  },
  {
    id: 'DEVUELTA',
    x: 680,
    y: 340,
    handles: [
      { id: 'in-pendiente', type: 'target', position: Position.Top },
      { id: 'in-enviada', type: 'target', position: Position.Left, offset: 35 },
      { id: 'in-tramite', type: 'target', position: Position.Bottom },
      // Solo se conecta cuando `residenteActivo` (Directa) -- DEVOLVER desde
      // PENDIENTE_RESIDENTE_ADMINISTRATIVO (2026-09-22). Offset distinto de
      // in-enviada/in-proyeccion para que las líneas entrando por la
      // izquierda no se pisen.
      { id: 'in-residente', type: 'target', position: Position.Left, offset: 50 },
      // Solo se conecta cuando `proyeccionActiva` (Directa) -- ver
      // EN_PROYECCION_CONTROLES más arriba. Offset distinto de in-enviada
      // para que las dos líneas entrando por la izquierda no se pisen.
      { id: 'in-proyeccion', type: 'target', position: Position.Left, offset: 65 },
      { id: 'out-reenviar', type: 'source', position: Position.Right, offset: 50 },
    ],
  },
  {
    id: 'EN_REVISION',
    x: 680,
    y: 620,
    handles: [
      { id: 'in', type: 'target', position: Position.Left, offset: 35 },
      { id: 'out', type: 'source', position: Position.Right, offset: 50 },
    ],
  },
];

// Las aristas del "posible" desvío a Director Técnico (in/aprobar/devolver)
// se recalculan según si hay un desvío activo para la categoría actual --
// ver `tecnicoActivo` más abajo. El resto del diagrama es idéntico para las
// dos categorías. `data.centerX` (ver AccionEdge.jsx) permite forzar el
// punto de quiebre de una arista -- no se usa por default en ninguna de
// estas (el punto de quiebre se recalcula solo contra la posición ACTUAL de
// cada nodo, incluida una que el admin haya arrastrado y guardado), queda
// disponible por si hace falta ajustar una línea puntual más adelante.
function edgesDef(tecnicoActivo, proyeccionActiva, residenteActivo, gerenteComprasActivo) {
  return [
    { id: 'e-enviar', source: 'BORRADOR', sourceHandle: 'out', target: 'ENVIADA', targetHandle: 'in-top', accion: 'ENVIAR', pildora: 'ENVIAR', variant: 'edgeMain' },
    { id: 'e-borrador-tecnico', source: 'BORRADOR', sourceHandle: 'out-tecnico', target: 'PENDIENTE_DIRECTOR_TECNICO', targetHandle: 'in', variant: 'edgeMuted', dashed: true },
    {
      id: 'e-aprobar-tecnico',
      source: 'PENDIENTE_DIRECTOR_TECNICO',
      sourceHandle: 'out-aprobar',
      target: 'ENVIADA',
      targetHandle: 'in-aprobar',
      accion: 'APROBAR_DIRECTOR_TECNICO',
      pildora: 'APROBAR_DIRECTOR_TECNICO',
      variant: tecnicoActivo ? 'edgeMain' : 'edgeMuted',
      dashed: !tecnicoActivo,
    },
    {
      id: 'e-devolver-tecnico',
      source: 'PENDIENTE_DIRECTOR_TECNICO',
      sourceHandle: 'out-devolver',
      target: 'DEVUELTA',
      targetHandle: 'in-pendiente',
      accion: 'DEVOLVER',
      pildora: 'DEVOLVER',
      variant: tecnicoActivo ? 'edgeDanger' : 'edgeMuted',
      dashed: true,
    },
    // APROBAR_DIRECTOR: destino según la cadena de Directa activa
    // (`residenteActivo` -> `proyeccionActiva` -> default a trámite) -- ver
    // ESTADO_DESTINO/el desvío sembrado en solicitud.autorizacion.js.
    residenteActivo
      ? { id: 'e-aprobar-director', source: 'ENVIADA', sourceHandle: 'out-bottom', target: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO', targetHandle: 'in-top', accion: 'APROBAR_DIRECTOR', pildora: 'APROBAR_DIRECTOR', variant: 'edgeMain' }
      : proyeccionActiva
      ? { id: 'e-aprobar-director', source: 'ENVIADA', sourceHandle: 'out-bottom', target: 'EN_PROYECCION_CONTROLES', targetHandle: 'in-top', accion: 'APROBAR_DIRECTOR', pildora: 'APROBAR_DIRECTOR', variant: 'edgeMain' }
      : { id: 'e-aprobar-director', source: 'ENVIADA', sourceHandle: 'out-bottom', target: 'EN_TRAMITE_CONTRATOS', targetHandle: 'in-top', accion: 'APROBAR_DIRECTOR', pildora: 'APROBAR_DIRECTOR', variant: 'edgeMain' },
    // Completa el paso de Residente Administrativo. Antes solo avanzaba
    // (APROBAR_RESIDENTE_ADMINISTRATIVO) -- 2026-09-22 el backend agrega
    // DEVOLVER desde este estado (va a DEVUELTA, ver `e-devolver-residente`).
    ...(residenteActivo
      ? [
          {
            id: 'e-aprobar-residente',
            source: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
            sourceHandle: 'out-bottom',
            target: proyeccionActiva ? 'EN_PROYECCION_CONTROLES' : 'EN_TRAMITE_CONTRATOS',
            targetHandle: 'in-top',
            accion: 'APROBAR_RESIDENTE_ADMINISTRATIVO',
            pildora: 'APROBAR_RESIDENTE_ADMINISTRATIVO',
            variant: 'edgeMain',
          },
          {
            id: 'e-devolver-residente',
            source: 'PENDIENTE_RESIDENTE_ADMINISTRATIVO',
            sourceHandle: 'out-devolver',
            target: 'DEVUELTA',
            targetHandle: 'in-residente',
            accion: 'DEVOLVER',
            variant: 'edgeDanger',
            dashed: true,
          },
        ]
      : []),
    ...(proyeccionActiva
      ? [
          { id: 'e-aprobar-proyeccion', source: 'EN_PROYECCION_CONTROLES', sourceHandle: 'out-bottom', target: 'EN_TRAMITE_CONTRATOS', targetHandle: 'in-top', accion: 'APROBAR_PROYECCION', pildora: 'APROBAR_PROYECCION', variant: 'edgeMain' },
          // DEVOLVER desde la proyección: el backend lo redirige a
          // PENDIENTE_RESIDENTE_ADMINISTRATIVO cuando `residenteActivo`
          // (solo Directa, 2026-09-22) -- si el flag no aplica, DEVUELTA.
          { id: 'e-devolver-proyeccion', source: 'EN_PROYECCION_CONTROLES', sourceHandle: 'out-devolver', target: residenteActivo ? 'PENDIENTE_RESIDENTE_ADMINISTRATIVO' : 'DEVUELTA', targetHandle: residenteActivo ? 'in-devolver-proyeccion' : 'in-proyeccion', accion: 'DEVOLVER', variant: 'edgeDanger', dashed: true },
        ]
      : []),
    { id: 'e-devolver-enviada', source: 'ENVIADA', sourceHandle: 'out-devolver', target: 'DEVUELTA', targetHandle: 'in-enviada', accion: 'DEVOLVER', variant: 'edgeDanger', dashed: true },
    // DEVOLVER desde Trámite Contratos: mismo criterio que el de proyección
    // -- a PENDIENTE_RESIDENTE_ADMINISTRATIVO cuando `residenteActivo`
    // (solo Directa, 2026-09-22), DEVUELTA si el flag no aplica.
    { id: 'e-devolver-tramite', source: 'EN_TRAMITE_CONTRATOS', sourceHandle: 'out-devolver', target: residenteActivo ? 'PENDIENTE_RESIDENTE_ADMINISTRATIVO' : 'DEVUELTA', targetHandle: residenteActivo ? 'in-devolver-tramite' : 'in-tramite', accion: 'DEVOLVER', variant: 'edgeDanger', dashed: true },
    { id: 'e-revisar', source: 'EN_TRAMITE_CONTRATOS', sourceHandle: 'out-revisar', target: 'EN_REVISION', targetHandle: 'in', accion: 'REVISAR', pildora: 'REVISAR', variant: 'edgeWarning', dashed: true },
    { id: 'e-reenviar-devuelta', source: 'DEVUELTA', sourceHandle: 'out-reenviar', target: 'ENVIADA', targetHandle: 'in-reenviar', accion: 'REENVIAR', pildora: 'REENVIAR', variant: 'edgeMuted' },
    { id: 'e-reenviar-revision', source: 'EN_REVISION', sourceHandle: 'out', target: 'ENVIADA', targetHandle: 'in-reenviar', accion: 'REENVIAR', variant: 'edgeMuted' },
    { id: 'e-tramitar-ok', source: 'EN_TRAMITE_CONTRATOS', sourceHandle: 'out-bottom', target: 'CREACION_MINUTA', targetHandle: 'in', accion: 'TRAMITAR_OK', pildora: 'TRAMITAR_OK', variant: 'edgeMain' },
    // AVANZAR_CONTRATOS: EN_CONTROLES por default (INDIRECTA, sin cambios), o PENDIENTE_GERENTE_COMPRAS cuando
    // `gerenteComprasActivo` (Directa, firma del Gerente de Compras antes de Adpro) -- mismo criterio que
    // APROBAR_DIRECTOR más arriba.
    { id: 'e-avanzar', source: 'CREACION_MINUTA', sourceHandle: 'out', target: gerenteComprasActivo ? 'PENDIENTE_GERENTE_COMPRAS' : 'EN_CONTROLES', targetHandle: 'in', accion: 'AVANZAR_CONTRATOS', pildora: 'AVANZAR_CONTRATOS', variant: 'edgeMain' },
    { id: 'e-registrar-adpro', source: 'EN_CONTROLES', sourceHandle: 'out', target: 'APROBACION_FINAL', targetHandle: 'in', accion: 'REGISTRAR_ADPRO', pildora: 'REGISTRAR_ADPRO', variant: 'edgeMain' },
    { id: 'e-aprobar-final', source: 'APROBACION_FINAL', sourceHandle: 'out', target: 'COMPLETADA', targetHandle: 'in', accion: 'APROBAR_FINAL', pildora: 'APROBAR_FINAL', variant: 'edgeMain' },
    ...(gerenteComprasActivo
      ? [{ id: 'e-aprobar-gerente-compras', source: 'PENDIENTE_GERENTE_COMPRAS', sourceHandle: 'out', target: 'EN_CONTROLES', targetHandle: 'in', accion: 'APROBAR_GERENTE_COMPRAS', pildora: 'APROBAR_GERENTE_COMPRAS', variant: 'edgeMain' }]
      : []),
    { id: 'e-anular', source: 'EN_CONTROLES', sourceHandle: 'out-anular', target: 'ANULADA', targetHandle: 'in', accion: 'ANULAR', pildora: 'ANULAR', variant: 'edgeDanger', dashed: true },
  ];
}

export function WorkflowDiagramaPage() {
  const { categoriaSlug } = useParams();
  const navigate = useNavigate();
  const [desvios, setDesvios] = useState(null);
  // null = todavía no cargó; {} o el objeto real de la categoría una vez
  // carga (ver getLayout() -- devuelve null si esa categoría nunca se
  // guardó, acá se normaliza a {} para que el resto del componente no
  // tenga que distinguir "no cargó" de "cargó vacío").
  const [layoutGuardado, setLayoutGuardado] = useState(null);
  const [error, setError] = useState(null);
  const [guardandoLayout, setGuardandoLayout] = useState(false);
  const [layoutGuardadoOk, setLayoutGuardadoOk] = useState(false);

  const categoria = categoriaFromSlug(categoriaSlug);

  useEffect(() => {
    if (!SLUGS_VALIDOS.includes(categoriaSlug)) {
      navigate('/configuracion/workflows');
      return;
    }
    setLayoutGuardado(null);
    Promise.all([listDesvios(), getLayout(categoriaFromSlug(categoriaSlug))])
      .then(([desviosRes, layoutRes]) => {
        setDesvios(desviosRes.data);
        setLayoutGuardado(layoutRes.data ?? {});
      })
      .catch((err) => setError(err.message));
  }, [categoriaSlug, navigate]);

  // Un desvío con condicion_categoria=null aplica a las dos categorías --
  // por eso el filtro es "sin condición de categoría, O coincide" en vez de
  // una igualdad estricta.
  const desviosDeEstaCategoria = useMemo(() => (desvios ?? []).filter((d) => !d.condicion_categoria || d.condicion_categoria === categoria), [desvios, categoria]);

  const accionesConDesvio = useMemo(() => new Set(desviosDeEstaCategoria.filter((d) => d.activo).map((d) => d.accion)), [desviosDeEstaCategoria]);

  const tecnicoActivo = useMemo(
    () => desviosDeEstaCategoria.some((d) => d.activo && d.accion === 'ENVIAR' && d.estado_destino === 'PENDIENTE_DIRECTOR_TECNICO'),
    [desviosDeEstaCategoria]
  );

  // Flujo propio de Directa (2026-09-18) -- ver el comentario grande al
  // inicio del archivo.
  const proyeccionActiva = useMemo(
    () => desviosDeEstaCategoria.some((d) => d.activo && d.accion === 'APROBAR_DIRECTOR' && d.estado_destino === 'EN_PROYECCION_CONTROLES'),
    [desviosDeEstaCategoria]
  );

  // Residente Administrativo — Revisión (2026-09-21) -- mismo criterio que
  // `proyeccionActiva` (ver el comentario grande al inicio del archivo):
  // paso nuevo de Directa entre Director de Obra y Controles-Proyección,
  // activo solo si existe el desvío real sembrado en el backend.
  const residenteActivo = useMemo(
    () => desviosDeEstaCategoria.some((d) => d.activo && d.accion === 'APROBAR_DIRECTOR' && d.estado_destino === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO'),
    [desviosDeEstaCategoria]
  );

  // Firma Gerente de Compras -- mismo criterio que `residenteActivo`/`proyeccionActiva`: paso de Directa
  // (desde 2026-11-03 va antes de Adpro), activo solo si existe el desvío real sembrado en el backend.
  const gerenteComprasActivo = useMemo(
    () => desviosDeEstaCategoria.some((d) => d.activo && d.accion === 'AVANZAR_CONTRATOS' && d.estado_destino === 'PENDIENTE_GERENTE_COMPRAS'),
    [desviosDeEstaCategoria]
  );

  // "Dos workflows distintos" -- pedido explícito: si Director Técnico no
  // aplica a esta categoría (hoy, cualquiera que no sea INDIRECTA), el nodo
  // y sus 3 aristas NO se dibujan en absoluto -- no alcanza con atenuarlo
  // ("fantasma"), tiene que desaparecer del todo. Sigue siendo dinámico
  // (calculado contra los desvíos reales, `tecnicoActivo` arriba), así que
  // si el negocio agrega un desvío para Directas más adelante, ese diagrama
  // empieza a mostrarlo solo, sin tocar código.
  const EDGES_TECNICO = ['e-borrador-tecnico', 'e-aprobar-tecnico', 'e-devolver-tecnico'];

  // Posición: la guardada para este nodo si existe (`layoutGuardado`, ver
  // getLayout()), si no la default del código (`NODOS_DEF`). Solo se
  // recalcula cuando cambia la categoría o llega el layout -- una vez que
  // `nodes` (el estado real, `useNodesState` más abajo) ya se sembró con
  // esto, arrastrar un nodo lo actualiza a ÉL, no a este memo (por eso el
  // useEffect siguiente solo hace `setNodes` cuando este memo cambia de
  // identidad, no en cada render).
  const nodosIniciales = useMemo(() => {
    if (layoutGuardado == null) return null;
    return NODOS_DEF.filter(
      (n) =>
        (tecnicoActivo || n.id !== 'PENDIENTE_DIRECTOR_TECNICO') &&
        (residenteActivo || n.id !== 'PENDIENTE_RESIDENTE_ADMINISTRATIVO') &&
        (proyeccionActiva || n.id !== 'EN_PROYECCION_CONTROLES') &&
        (gerenteComprasActivo || n.id !== 'PENDIENTE_GERENTE_COMPRAS')
    ).map((n) => {
      const guardada = layoutGuardado.nodos?.[n.id];
      return {
        id: n.id,
        type: 'estado',
        position: { x: guardada?.x ?? n.x, y: guardada?.y ?? n.y },
        data: {
          label: ESTADO_LABELS[n.id] ?? n.id,
          variant: ESTADO_BADGE_VARIANT[n.id] ?? 'neutral',
          fantasma: n.fantasma,
          nota: n.nota,
          handles: n.handles,
        },
      };
    });
  }, [tecnicoActivo, residenteActivo, proyeccionActiva, gerenteComprasActivo, layoutGuardado]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  // Guías de alineación (2026-09-02, "que me diga que estoy alineado/
  // centrado") -- `x`/`y` son la coordenada del CANVAS (no de pantalla)
  // donde dibujar la guía, o `null` si el nodo que se está arrastrando no
  // coincide con ningún otro ahora mismo. Como todos los nodos miden 180px
  // (`.nodo` en Workflows.module.css), compartir la misma `x` ya significa
  // compartir el centro horizontal -- no hace falta una cuenta aparte para
  // "centrado" contra "alineado a la izquierda", son la misma cosa acá.
  const [guiaLineas, setGuiaLineas] = useState({ x: null, y: null });

  // Envuelve el `onNodesChange` de `useNodesState` para detectar, mientras
  // se arrastra, si el nodo quedó a `TOLERANCIA_IMAN` px o menos de la
  // posición de otro -- si sí, lo "engancha" exacto a esa posición (mismo
  // criterio que las guías de alineación de Figma/PowerPoint) y prende la
  // guía correspondiente; al soltar (o si no hay coincidencia) las guías se
  // apagan.
  const TOLERANCIA_IMAN = 6;
  function onNodesChange(changes) {
    const cambioDeArrastre = changes.find((c) => c.type === 'position' && c.position);
    if (!cambioDeArrastre) {
      onNodesChangeBase(changes);
      return;
    }

    setNodes((actuales) => {
      let siguientes = applyNodeChanges(changes, actuales);
      if (!cambioDeArrastre.dragging) {
        setGuiaLineas({ x: null, y: null });
        return siguientes;
      }

      const activo = siguientes.find((n) => n.id === cambioDeArrastre.id);
      let guiaX = null;
      let guiaY = null;
      let snapX = activo.position.x;
      let snapY = activo.position.y;
      for (const otro of siguientes) {
        if (otro.id === activo.id) continue;
        if (Math.abs(activo.position.x - otro.position.x) <= TOLERANCIA_IMAN) {
          guiaX = otro.position.x;
          snapX = otro.position.x;
        }
        if (Math.abs(activo.position.y - otro.position.y) <= TOLERANCIA_IMAN) {
          guiaY = otro.position.y;
          snapY = otro.position.y;
        }
      }
      setGuiaLineas({ x: guiaX, y: guiaY });
      if (snapX !== activo.position.x || snapY !== activo.position.y) {
        siguientes = siguientes.map((n) => (n.id === activo.id ? { ...n, position: { x: snapX, y: snapY } } : n));
      }
      return siguientes;
    });
  }

  // Solo (re)siembra el estado real cuando cambia la categoría o cuando
  // termina de cargar el layout guardado -- después de eso, arrastrar un
  // nodo actualiza `nodes` vía `onNodesChange` sin volver a pasar por acá.
  useEffect(() => {
    if (nodosIniciales) setNodes(nodosIniciales);
  }, [nodosIniciales, setNodes]);

  // Overrides del punto de quiebre de cada arista (2026-09-02, "¿puedo
  // mover las líneas también?") -- mismo criterio que `nodosIniciales`:
  // arranca desde lo guardado, y `onMoveBend` (pasado a cada arista vía
  // `data`, ver AccionEdge.jsx) lo actualiza en vivo mientras se arrastra
  // el grip.
  const [aristaOverrides, setAristaOverrides] = useState({});
  useEffect(() => {
    if (layoutGuardado) setAristaOverrides(layoutGuardado.aristas ?? {});
  }, [layoutGuardado]);

  function onMoveBend(edgeId, x, y) {
    setAristaOverrides((prev) => ({ ...prev, [edgeId]: { centerX: x, centerY: y } }));
  }

  // "usa el navegador para que vayas solucionando" -- el alto del canvas NO
  // se puede resolver con `height:100%` en cascada (ver el comentario grande
  // en Workflows.module.css sobre por qué: `<ReactLenis>`, en AppShell.jsx,
  // envuelve su contenido en un `<div>` interno que la librería no expone
  // por className/style, sin `height` propio -- cualquier `height:100%` que
  // intente atravesarlo desde un hijo se corta ahí, confirmado inspeccionando
  // el DOM real con Playwright). Se mide el alto disponible con JS en su
  // lugar: `window.innerHeight` menos dónde arranca el canvas en pantalla
  // menos lo que ocupa la leyenda de abajo (su alto real, no uno fijo --
  // varía si el texto de la leyenda hace wrap en una ventana angosta) menos
  // un respiro. Se re-mide en cada resize y cuando aparece/desaparece el
  // banner de error (desplaza el punto de arranque del canvas).
  const diagramWrapRef = useRef(null);
  const leyendaRef = useRef(null);
  const [altoDisponible, setAltoDisponible] = useState(null);

  useEffect(() => {
    function medir() {
      if (!diagramWrapRef.current) return;
      const top = diagramWrapRef.current.getBoundingClientRect().top;
      const altoLeyenda = leyendaRef.current?.offsetHeight ?? 0;
      const disponible = window.innerHeight - top - altoLeyenda - 40;
      // Minimo 860px: con menos alto el diagrama (13 estados en vertical) se ajusta a una escala tan chica que no se lee.
      setAltoDisponible(Math.max(disponible, 860));
    }
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [error]);

  const edges = useMemo(
    () =>
      edgesDef(tecnicoActivo, proyeccionActiva, residenteActivo, gerenteComprasActivo)
        .filter((e) => tecnicoActivo || !EDGES_TECNICO.includes(e.id))
        .map((e) => {
          const override = aristaOverrides[e.id];
          return {
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: e.target,
            targetHandle: e.targetHandle,
            type: 'accion',
            markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR[e.variant], width: 16, height: 16 },
            data: {
              pildora: e.pildora,
              variant: e.variant,
              dashed: e.dashed,
              centerX: override?.centerX ?? e.centerX,
              centerY: override?.centerY,
              tieneDesvio: e.accion ? accionesConDesvio.has(e.accion) : false,
              onNavigate: (accion) => navigate(`/configuracion/workflows/${categoriaSlug}/${accion}`),
              onMoveBend,
            },
          };
        }),
    [tecnicoActivo, proyeccionActiva, residenteActivo, gerenteComprasActivo, accionesConDesvio, aristaOverrides, navigate, categoriaSlug]
  );

  if (!SLUGS_VALIDOS.includes(categoriaSlug)) return null;

  // Lee `nodes`/`aristaOverrides` (el estado real -- ya incluye cualquier
  // arrastre en curso) y los guarda para ESTA categoría, compartido entre
  // todos los admins (ver workflow.service.js#saveLayout).
  async function guardarPosiciones() {
    setGuardandoLayout(true);
    setError(null);
    setLayoutGuardadoOk(false);
    try {
      const posiciones = {
        nodos: Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
        aristas: aristaOverrides,
      };
      await saveLayout(categoria, posiciones);
      setLayoutGuardado(posiciones);
      setLayoutGuardadoOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoLayout(false);
    }
  }

  return (
    <div className={diagramStyles.page}>
      <BackLink to="/configuracion/workflows">Workflows</BackLink>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.title}>Workflow — Solicitudes {CATEGORIA_LABELS[categoria]}s</h1>
          <p className={styles.subtitle}>
            Cada estado es fijo; cada acción (la píldora sobre la flecha) se puede reconfigurar con clic para ver o cambiar sus desvíos condicionales. Arrastra los nodos para acomodar el diagrama y guarda las posiciones para que quede igual para todos los admins.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          {layoutGuardadoOk && <span style={{ color: 'var(--color-success-ink)', fontSize: 'var(--text-data-size)' }}>Guardado</span>}
          <Button type="button" variant="secondary" onClick={guardarPosiciones} disabled={guardandoLayout}>
            {guardandoLayout ? 'Guardando…' : 'Guardar posiciones'}
          </Button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <div className={diagramStyles.diagramWrap} ref={diagramWrapRef} style={altoDisponible ? { height: `${altoDisponible}px` } : undefined}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          {/* Guías de alineación -- ver `guiaLineas`/`onNodesChange` arriba.
              `<ViewportPortal>` dibuja en el mismo espacio de coordenadas
              que los nodos (se pan/zoomea junto con el resto del canvas),
              a diferencia de un overlay HTML normal que quedaría fijo en
              pantalla. El rango (-2000 a 4000) es generoso a propósito --
              solo tiene que cubrir la zona visible del diagrama, no hace
              falta calcularlo exacto. */}
          <ViewportPortal>
            {guiaLineas.x != null && (
              <div className={diagramStyles.guiaVertical} style={{ left: guiaLineas.x, top: -2000, height: 6000 }} />
            )}
            {guiaLineas.y != null && (
              <div className={diagramStyles.guiaHorizontal} style={{ top: guiaLineas.y, left: -2000, width: 6000 }} />
            )}
          </ViewportPortal>
        </ReactFlow>
      </div>

      <div className={diagramStyles.leyenda} ref={leyendaRef}>
        <span className={diagramStyles.leyendaItem}><Zap size={12} className={diagramStyles.pildoraDesvio} aria-hidden="true" /> la acción tiene un desvío condicional activo para esta categoría</span>
        <span className={diagramStyles.leyendaItem}><span className={diagramStyles.leyendaSwatch} style={{ background: 'var(--color-danger-ink)' }} /> devuelta al solicitante / anulada</span>
        <span className={diagramStyles.leyendaItem}><span className={diagramStyles.leyendaSwatch} style={{ background: 'var(--color-warning-ink)' }} /> en revisión</span>
        <span className={diagramStyles.leyendaItem}><span className={diagramStyles.leyendaSwatch} style={{ background: 'var(--color-success-ink)' }} /> completada</span>
      </div>
    </div>
  );
}
