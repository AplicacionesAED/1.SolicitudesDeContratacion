# CLAUDE.md

Guía para Claude Code en este repositorio. Es la versión **condensada**: solo reglas vigentes. El detalle histórico de cada
decisión, bug y verificación (por fecha) está en [docs/HISTORIAL.md](docs/HISTORIAL.md) — **léelo solo cuando necesites el
porqué de algo** (ej. "¿por qué `fieldMd` es global?", "¿cómo se migraron los datos?"). Si algo de aquí contradice al
historial, manda este archivo.

## Proyecto

Solicitudes de Contratación AED (antes "Solicitudes Indirectos"): gestión de solicitudes de contratación **directa e
indirecta** de Baía Kristal. Express + Sequelize + PostgreSQL (`solicitudes_indirectos_v2`, servidor remoto) y React + Vite
(JavaScript plano, CSS Modules, sin Tailwind). Un solo contenedor: Express sirve también el build del frontend.

- Raíz del repo: `backend/`, `frontend/`, `Dockerfile`, `entrypoint.sh`, `README.md`, `DESIGN.md`, `docs/`.
- Ya no se usa `Plantilla-Arquitectura-AED` ni existe `plantilla-arquitectura/`; las referencias a rutas `SOLICITUDES/...`
  en el historial se leen como `backend/...` desde la raíz.
- Repo: `https://github.com/Gestion-servicios-TI-AED/SolicitudesDeContratacion`. Producción: `https://portal.aed-it.com/solicitudes/`
  (detrás del gateway del portal).

## Reglas de trabajo (importantes)

- Commits en español, autor `GEliasDev <gvaldelamar2003@outlook.com>`, **sin** trailer ni mención a Claude. Nunca
  `git push` (lo hace el usuario). No commitear sin que lo pida; `git add` de archivos específicos.
- Nunca editar `.env` ni escribir credenciales. La BD local de desarrollo es la real: pruebas en solo lectura; si hay que
  escribir, fixtures `ZTEST_*` y borrarlos al terminar (y devolver el contador `contador_consecutivos` que se haya consumido).
- No hay suite de tests: se verifica con `curl`, `node --check`, `esbuild --bundle src/App.jsx` y, si el usuario lo permite,
  navegador. Si el usuario dice "no uses Playwright", no usarlo.
- Responder en español, directo y conciso.
- Antes de tocar UI lee `DESIGN.md` (identidad igual al HRMS; tokens en `frontend/src/tokens.css`).

## Comandos

Desde la raíz: `npm run dev` (backend **3021** + frontend Vite **5193**), `npm run install:all`, `npm run db:migrate`.
Desde `backend/`: `npm run db:migrate` (sequelize-cli, idempotente), `npm run db:seed` (solo dev: admin + roles base; **nunca
en producción**), `npm run dev` (nodemon), `npm start` (migra y arranca; lo que corre el contenedor).
`.env` desde `.env.example`: `PG*`, `CORS_ORIGIN`, `FRONTEND_URL`, `PORT`, `JWT_SECRET`, `AZURE_*`, `SHAREPOINT_FILE_ID`,
`MASTER_KEY_HASH` (opcional, **sin escapar los `$`**: dotenv plano), `GOOGLE_DRIVE_*`. `LEGACY_DATABASE_URL` solo para scripts de
migración; **no** va en producción.

## Arquitectura del backend (`backend/src`)

- Módulos de 5 archivos (`model`, `schema` Zod, `service`, `controller`, `routes`); lógica de negocio **siempre** en el
  service; migraciones forward-only; `zDateOnly()` para `DATEONLY`.
- **Todas las rutas viven bajo `/api/*`** (`app.use('/api', routes)`). Cualquier fetch armado a mano debe llevar el prefijo;
  usar siempre `frontend/src/api/client.js`.
- Manejo de errores unificado de la familia (byte a byte igual en Solicitudes, Cartera, HRMS y Bases; **no se edita por
  proyecto**): `ApiError`, `ApiResponse`, `asyncHandler`, `zDateOnly`, `validate`, `errorHandler`, `notFoundHandler`. Contrato:
  `{ success:false, error:{ message, details? } }`. Errores propios = lanzar `ApiError` desde el service. El `ok(res, data)`
  envuelve en `{ data }`: cualquier endpoint que responda `res.json` directo rompe el cliente.
- Registro central de modelos: `backend/src/models/index.js` (asociaciones vía `associate(models)`); todo módulo con
  asociaciones se registra ahí.
- **Datos iniciales y cambios de datos van en migraciones, no en seeders** (producción solo corre `db:migrate`). Patrón
  idempotente (`SELECT COUNT(*)`, insertar solo si vacío).
- Cookies de sesión con prefijo `solind_` (`solind_access_token`, `solind_refresh_token`, `solind_ms_link_intent`). Solo
  `secure` si `FRONTEND_URL` es https.
- API en camelCase sobre columnas snake_case en `tercero` y `solicitud` (el service es el único que traduce, mapa
  `CAMPO_DB`/`_enrich()`); **excepción**: `GET /frentes` devuelve snake_case crudo. Campo nuevo de Tercero/Solicitud = modelo +
  migración + mapa.
- Fechas `DATEONLY`: nunca pasar un `Date` de JS (corre un día por zona horaria); pasar el string `'YYYY-MM-DD'`.
- Campos de dinero: nunca `<input type="number">`; texto + `inputMode="numeric"` con `soloDigitos`/`formatearMiles`
  (`frontend/src/utils/solicitudes.js`). `%`, cantidades y columnas Entero/Float sí admiten `type="number"`.

### Usuarios, roles y permisos

- `Usuario.roles` es un array JSONB (varios roles a la vez); `ADMIN` dentro de `roles` = bypass total. `Rol` (tabla editable en
  runtime): `permisos` JSONB + `alcance_solicitudes`. `funcionalidades_adicionales` concede slugs extra a un usuario.
- Slugs de módulo (`utils/permisos.js`, duplicado a mano en `frontend/src/utils/permisos.js`; mantener sincronizados):
  `ver_solicitudes_directas|indirectas`, `crear_solicitudes_directas|indirectas`, `ver_terceros`, `crear_terceros`,
  `ver_especialidades`, `gestionar_especialidades`. `editar_terceros` no está en la lista: solo ADMIN o concedido a mano.
- El frontend evalúa permisos con `usuarioTienePermiso(usuario, slug)`, que usa `usuario.funcionalidadesPorRol` (el mapa real
  de la tabla `Rol`, que manda `GET /usuarios/me`), nunca el mapa hardcodeado. El perfil se refresca cada 30 s.
- `ver_solicitudes_X` solo decide si se entra a la sección; **no** reemplaza la visibilidad por registro. `/solicitudes/:id`
  (detalle) no pide `ver_*` a propósito (links de notificación).
- **Alcance de listado** (`roles.alcance_solicitudes`): `PROPIAS` ⊂ `FRENTE` ⊂ `TODAS`; con varios roles gana el más permisivo.
  No afecta `getById` (acceso puntual vía dueño/frente/AprobadorFrente).
- Sidebar y editor de Roles salen de **una sola fuente**: `frontend/src/utils/navModulos.jsx` (`NAV_GROUPS`). Un ítem nuevo
  con `permiso` aparece en ambos solo.
- Se puede eliminar un rol solo si no es `es_admin`, sin cuentas y sin uso en `AprobadorFrente`/desvíos (409 si no). Usuarios:
  solo se inactivan; borrado definitivo (`DELETE /usuarios/:id/definitivo`) solo de inactivos sin FK (409 si no).
- Login: contraseña + SSO Azure AD (`@azure/msal-node`, `auth.azure.js`). El SSO exige `microsoft_id` vinculado; el
  `AZURE_REDIRECT_URI` (`.../api/auth/azure/callback`) debe estar registrado en el App Registration de Azure.

### Solicitudes (módulo núcleo, `modules/solicitud/`)

- Una sola `Solicitud` con `categoria` (`'DIRECTA'|'INDIRECTA'`, indexada, no parcheable tras crearse) y `tipo`
  (`CONTRATO`, `ORDEN_SERVICIO`, `OTROSI_TIEMPO`, `OTROSI_TIEMPO_CANTIDAD`). Un otrosí hereda siempre la categoría del padre.
- **Consecutivo**: INDIRECTA `SOL-{TIPO}-{PROY}-{FRENTE}-{NNN}` (formato histórico, no tocar); DIRECTA `SOL-D-{TIPO}-{PROY}-{FRENTE}-{NNN}`
  con contador propio (`DIRECTA-...`). Se genera con `INSERT ... ON CONFLICT DO UPDATE` atómico (`solicitud.consecutivo.js`).
- **Autorización de acciones** (`solicitud.autorizacion.js`, única fuente de verdad, usada por `solicitud.estado.js` y
  `getById`): se resuelve contra `AprobadorFrente` (6 columnas JSONB `{usuarios:[ids], roles:[nombres]}`: `director_proyecto`,
  `contratos_tramite`, `contratos_minuta`, `director_controles`, `director_tecnico`, `controles_adpro`, más los slots de
  Directa), no contra permisos de rol. `ENVIAR`/`REENVIAR` se gatean por `crear_solicitudes_X`. El frontend **lee**
  `solicitud.accionesDisponibles`, `puedeEditar`, `requiereMiAccion`, `enPoderDe`, `diasEnPaso`; no recalcula reglas.
  `AprobadorFrente` es una fila por (frente, categoría).
- **Máquina de estados** (`solicitud.estado.js`): la secuencia de estados/acciones está fija en código (`ESTADOS_ORIGEN`,
  `ESTADO_DESTINO`); lo configurable desde `/configuracion/workflows` son los **desvíos condicionales** (`workflow_desvios`:
  acción + rol/categoría opcionales → estado destino, activables). Los desvíos no tienen columna de estado origen (un desvío
  de `DEVOLVER` afectaría todos los orígenes). Resiliente: si falta la tabla, cae a un mapa hardcodeado.
  - INDIRECTA: ENVIADA → (PENDIENTE_DIRECTOR_TECNICO si solicitante TECNICA) → EN_TRAMITE_CONTRATOS → CREACION_MINUTA →
    EN_CONTROLES → APROBACION_FINAL → COMPLETADA.
  - DIRECTA: ENVIADA (Director de Obra) → PENDIENTE_RESIDENTE_ADMINISTRATIVO → EN_PROYECCION_CONTROLES → EN_TRAMITE_CONTRATOS →
    elaboración de orden → firma del Gerente de Compras (`PENDIENTE_GERENTE_COMPRAS`, desvío de `AVANZAR_CONTRATOS`) → N° Adpro → aprobación final → COMPLETADA. Sin Director Técnico.
  - `DEVOLVER` desde Proyección o Trámite en Directa vuelve a PENDIENTE_RESIDENTE_ADMINISTRATIVO; desde los demás pasos a
    DEVUELTA. `REVISAR` (nota obligatoria) y `ANULAR` (motivo obligatorio, desde cualquier estado enviado salvo COMPLETADA;
    estado terminal ANULADA, slot `controles_adpro`). `COMENTAR` (solo en EN_PROYECCION_CONTROLES, no cambia estado, nota
    obligatoria, va al historial).
  - Notificaciones: best-effort fuera de la transacción (`notificacion.service.js`); un fallo nunca tumba la transición.
- **Tipos de contrato** (`tipo_contrato`, STRING(40)): DIRECTA → `TODO_COSTO`, `SUMINISTRO_MATERIALES`, `MANO_OBRA`,
  `SERVICIOS`, `TRANSPORTE`, `ALQUILER`; INDIRECTA → `OTROS_SERVICIOS`, `DISENO`. Validado en `ENVIAR`
  (`TIPOS_CONTRATO_VALIDOS_POR_CATEGORIA`). En DIRECTA la Orden de Servicio usa el mismo formulario que Contrato
  (`tratarComoContrato`) y también exige `tipoContrato`; el plazo mínimo del cronograma sigue distinto (2 vs 13 días hábiles).
  El label vive duplicado en `frontend/src/utils/solicitudes.js` y `documento.js`. `Tercero.tipo_contrato` es otro concepto.
- **Tope Directa**: la Orden de Servicio en Directa tiene tope de 50 millones (bloquea el envío y exige adelantar licitación si
  el cuadro comparativo lo supera).
- **Cuadro Comparativo** (CONTRATO/ORDEN_SERVICIO, obligatorio para `ENVIAR`, validado también en backend): tablas
  `cuadros_comparativos` / `..._proveedores` / `..._items`, upsert transaccional borra-y-recrea (`cuadroComparativo.js`, con
  `clientId` temporales remapeados a ids reales). Cada ítem tiene `cantidad` (**Pendiente por consumir**, informativa) y
  `cantidad_real` (**Cantidades reales**, la que se compra y alimenta el valor total) más `valor_unitario_pendiente`.
  Totales nunca se guardan: se calculan en frontend con las funciones exportadas de `CuadroComparativoBuilder.jsx`
  (`calcularValorTotalItem`, `calcularTotalesProveedor`, `calcularValorTotalPendiente`, `calcularValorTotalSegunPpto`,
  `CAMPOS_AIU`), reusadas tal cual en `SolicitudDetallePage.jsx`. En DIRECTA hay un único proveedor = el Tercero contratista
  (sincronizado, no editable, sin agregar/quitar). `archivo_cuadro_comparativo` está congelado (solo lectura de datos viejos).
- **Memoria** (solo DIRECTA, opcional): `memorias` / `memoria_columnas` / `memoria_filas`, columna 0 siempre IMAGEN, tipos
  Texto/Entero/Float/Fecha/Rango/Calculada (operandos solo Entero/Float; las calculadas nunca se guardan). `memoria.js` hace el
  upsert; `ImagenAutenticada` pide la imagen con cookie (un `<img>` cross-origin no la manda).
- **Cronograma** (`cronograma.js`, `cronogramaExport.js`): 13 días hábiles de anticipación (festivos Colombia en
  `utils/holidays.js`, copia exacta en frontend). `CronogramaBuilder` solo edita actividades, no crea fases.
- **Documentos**: Indirecta genera `.docx` (`documento.js`, `POST /solicitudes/:id/documento`); Directa genera la Orden de
  Compra/Servicios en **PDF** (`ordenServicio.js` con `pdfkit`, `POST /solicitudes/:id/orden-servicio`, nombre
  `Orden de Servicio {consecutivo}.pdf`). Para leer el nombre real el CORS debe exponer `Content-Disposition`
  (`exposedHeaders` en `app.js`). Para verificar un PDF con tildes, renderizarlo a imagen (PyMuPDF): `pdftotext` las muestra mal.
- Otrosí: `crearOtrosi` bloquea si el contrato ya venció (línea base = otrosí COMPLETADA más reciente por `numero_otrosi`) y
  si ya hay un otrosí activo (se ignoran COMPLETADA y ANULADA). Import histórico (`solicitud.importarHistorico.js`) crea
  registros ya COMPLETADA sin pasar por la máquina de estados.
- `remove()` (solo ADMIN) debe borrar a mano `HistorialSolicitud`, `CronogramaContrato`, `CuadroComparativo` y `Memoria` antes
  de la solicitud (esas FK no tienen cascade).
- Quirk portado (no corregir sin confirmar con el negocio): el selector de contratista exige `aprobadoDebidaDiligencia &&
  confidencialidad`. `contratanteNombre/Nit` son fijos (PROMOTORA BARLOVENTO DEL MAR S.A.S / 901307871).

### Terceros y Especialidades

- Datos de contacto los edita cualquier autenticado; el resto (`dd_*`, `tipoContrato`, `confidencialidad`) exige
  `editar_terceros`. **La debida diligencia no se gestiona aquí**: llega del sync de SharePoint (`tercero.sync.js`, upsert a
  mano que **no pisa el `nit`**); la UI solo muestra el estado.
- `GET /terceros` suma `totalSolicitudes`, `valorContratado`, `ultimaSolicitud`, `datosFaltantes`; la ficha lista solo las
  solicitudes visibles para el usuario. Disponible para contratar = debida diligencia + confidencialidad + SAGRILAFT vigente.
- Especialidades: `DELETE` no borra una en uso (409); se **fusiona** (`POST /especialidades/:id/fusionar`).

### Archivos y Drive

- `POST /upload` sube a Google Drive (`services/googleDrive.js`, cuenta de servicio) y devuelve `/files/drive/<fileId>`;
  `GET /files/drive/:fileId` los sirve autenticados. Estructura: `_Pendientes/` y `Directas|Indirectas/<consecutivo>/`
  (`organizarArchivos`, best-effort). El `GET /files/:filename` de disco se conserva para registros viejos.
- Bloquea 11 extensiones ejecutables; máximo 20 MB. Script `scripts/migrarArchivosADrive.js` (simulacro por defecto,
  `--aplicar`).

## Frontend (`frontend/src`)

- Rutas: `/solicitudes-directas` y `/solicitudes-indirectas` (listado y "Nueva solicitud"), detalle `/solicitudes/:id`,
  `/solicitudes/:id/editar`, `/solicitudes/importar-historico`, `/terceros`, `/terceros/especialidades`,
  `/configuracion/*` (solo admin: usuarios, roles, proyectos, frentes, workflows). Los wrappers `Nueva*Page` reciben
  `categoria` como prop.
- Componentes propios en `components/ui/` copiados del HRMS (`Button`, `Badge`, `Field`, `Modal` con `<dialog>`, `Combobox`,
  `CheckboxGroup`, `Pagination`, `SortHeader`, etc.). `Field` es el del HRMS **más** el `Textarea` que crece solo sin resize
  (conservar si se resincroniza). Selección de uno a muchos = checkboxes, nunca `<select multiple>`. Una tabla con
  encabezado ordenable usa `SortHeader`; acciones por fila = íconos (`RowIconButtons`).
- `.fieldMd`/`.fieldLg` son clases **globales** en `index.css` (se usan como string literal; en un CSS module no matchean).
- Al copiar CSS global de otro proyecto, revisar que no rompa librerías con SVG propio (React Flow, ApexCharts).
- `AuthContext`/`ProtectedRoute`: el usuario solo se borra con un 401 real; cualquier otro fallo (503 en un deploy, red caída)
  conserva la sesión, muestra "No se pudo conectar con el servidor" y reintenta cada 5 s.
- Inicio: `GET /dashboard/resumen?categoria=` (KPIs, gráficos con ApexCharts, "Requiere tu atención", por corregir). La bandeja
  de solicitudes usa `diasEnPaso`/`enPoderDe`/`requiereMiAccion` de `list()`.
- El detalle de solicitud: tarjeta de situación + pestañas (Resumen/Cuadro/Memoria/Cronograma/Documentos); el **stepper de
  progreso y el historial son siempre visibles** (pedido explícito, no esconderlos). `EstadoTimeline` oculta el paso Director
  Técnico en DIRECTA. La nota de devolución se oculta solo si la última acción de {DEVOLVER, REVISAR, ANULAR} fue DEVOLVER y
  ya fue reenviada.
- Workflows (`/configuracion/workflows`): lista por categoría + diagrama `@xyflow/react` (nodos arrastrables y guardables en
  `workflow_layouts`; no se puede cambiar la forma del flujo). El diagrama calcula en vivo qué nodos existen según los desvíos
  activos.
- Tipografía compacta (tokens en `tokens.css`); logo del sidebar **no** es link, "Inicio" es un módulo del menú.

## Despliegue

- Dockerfile en la raíz (3 stages; `VITE_BASE_PATH=/solicitudes/` es **build-arg**, no variable de runtime) y `entrypoint.sh`
  (`npm start`, nunca `db:seed`). `.gitattributes` fuerza LF en `*.sh`/`Dockerfile`.
- Detrás del gateway del portal: nginx quita el prefijo `/solicitudes/` y reescribe el path de cookies; la app ve `/` y `/api`.
  `client.js` deriva la API de `BASE_URL` (sin `VITE_API_URL`). `client_max_body_size 20m` en el gateway.
- Producción: variables en `backend/.env.production` (referencia, no editar desde aquí): `FRONTEND_URL=https://portal.aed-it.com/solicitudes`,
  `CORS_ORIGIN=https://portal.aed-it.com`, `JWT_SECRET` propio (nunca reciclar el de la app vieja), `DATABASE_URL` interna de
  Coolify.
- **Pendiente del usuario**: registrar el `AZURE_REDIRECT_URI` de producción en Azure; recuperar los 2 archivos perdidos de
  `SOL-ODS-BK-KALIZA1-001`; tras migrar a Drive, `UPLOADS_DIR` ya no hace falta.
- Datos: la base real es `solicitudes_indirectos_v2`; las solicitudes de la app vieja se cargaron con
  `scripts/importarDatosLegado.js` (corte único, **destructivo**) y `scripts/rehacerBaseProduccion.js` (una sola vez contra la
  base nueva). No volver a correrlos.
- Actividad/presencia fue eliminada (código y tablas); no reintroducir. Las notificaciones en vivo (SSE) siguen.
