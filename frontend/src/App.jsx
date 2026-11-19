import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './features/auth/LoginPage.jsx';
import { DashboardPage } from './features/dashboard/DashboardPage.jsx';
import { PerfilPage } from './features/perfil/PerfilPage.jsx';
import { AccesosLayout } from './features/configuracion/AccesosLayout.jsx';
import { UsuariosPage } from './features/configuracion/UsuariosPage.jsx';
import { UsuarioFormPage } from './features/configuracion/UsuarioFormPage.jsx';
import { RolesPage } from './features/configuracion/RolesPage.jsx';
import { RolFormPage } from './features/configuracion/RolFormPage.jsx';
import { RolDetallePage } from './features/configuracion/RolDetallePage.jsx';
import { WorkflowsPage } from './features/configuracion/WorkflowsPage.jsx';
import { WorkflowDiagramaPage } from './features/configuracion/WorkflowDiagramaPage.jsx';
import { WorkflowDetallePage } from './features/configuracion/WorkflowDetallePage.jsx';
import { ProyectosPage } from './features/configuracion/ProyectosPage.jsx';
import { FrentesPage } from './features/configuracion/FrentesPage.jsx';
import { FrenteDetallePage } from './features/configuracion/FrenteDetallePage.jsx';
import { TercerosPage } from './features/terceros/TercerosPage.jsx';
import { NuevoTerceroPage } from './features/terceros/NuevoTerceroPage.jsx';
import { TerceroDetallePage } from './features/terceros/TerceroDetallePage.jsx';
import { EspecialidadesPage } from './features/terceros/EspecialidadesPage.jsx';
import { SolicitudesPage } from './features/solicitudes/SolicitudesPage.jsx';
import { SolicitudDetallePage } from './features/solicitudes/SolicitudDetallePage.jsx';
import { NuevaSolicitudTipoPage } from './features/solicitudes/NuevaSolicitudTipoPage.jsx';
import { NuevaContratoPage } from './features/solicitudes/NuevaContratoPage.jsx';
import { NuevaOrdenServicioPage } from './features/solicitudes/NuevaOrdenServicioPage.jsx';
import { NuevaOrdenServicioV2Page } from './features/solicitudes/NuevaOrdenServicioV2Page.jsx';
import { NuevoOtrosiTiempoPage } from './features/solicitudes/NuevoOtrosiTiempoPage.jsx';
import { NuevoOtrosiTiempoCantidadPage } from './features/solicitudes/NuevoOtrosiTiempoCantidadPage.jsx';
import { EditarSolicitudPage } from './features/solicitudes/EditarSolicitudPage.jsx';
import { ImportarHistoricoPage } from './features/solicitudes/ImportarHistoricoPage.jsx';
import { ImportarOtrosiHistoricoPage } from './features/solicitudes/ImportarOtrosiHistoricoPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="perfil" element={<PerfilPage />} />

          {/* Rutas top-level (no anidadas bajo /solicitudes/) a propósito --
              /solicitudes/directas colisionaría exactamente con el patrón
              /solicitudes/:id (mismo shape de 2 segmentos, React Router no
              distingue por contenido). El detalle/edición por id se queda
              intacto en /solicitudes/:id -- lo usan notificaciones reales ya
              guardadas con esa URL.

              2026-09-02 "desglose ver/crear": cada bloque de rutas exige el
              permiso correspondiente -- antes NINGUNA de estas rutas
              (Solicitudes ni Terceros) tenía `permiso`, solo requireAuth
              general, así que cualquier autenticado podía navegar a
              /solicitudes-directas/nueva/contrato a mano aunque el sidebar
              nunca la mostrara. El acceso a un registro puntual
              (/solicitudes/:id, la ruta sin categoría en la URL) sigue
              gateado solo por la visibilidad de ESE registro en el backend
              (dueño/frente/AprobadorFrente/ver_todas), sin pedir
              ver_solicitudes_X -- así alguien autorizado sobre una
              solicitud puntual (ej. por un link de notificación) no pierde
              acceso aunque un admin le revoque el "ver" general después. */}
          <Route element={<ProtectedRoute permiso="ver_solicitudes_directas" />}>
            <Route path="solicitudes-directas" element={<SolicitudesPage categoria="DIRECTA" />} />
          </Route>
          <Route element={<ProtectedRoute permiso="crear_solicitudes_directas" />}>
            <Route path="solicitudes-directas/nueva" element={<NuevaSolicitudTipoPage categoria="DIRECTA" />} />
            {/* En Directa ya no existe el tipo Contrato (2026-09-17, pedido
                explícito) -- esta ruta ya no tiene card en el picker de
                arriba, pero se deja un redirect (en vez de dejarla sin
                Route, que caería en blanco) por si alguien la tenía
                guardada a mano. El backend también rechaza el POST
                (crearNormal en solicitud.service.js) por si alguien la
                fuerza igual. */}
            <Route path="solicitudes-directas/nueva/contrato" element={<Navigate to="/solicitudes-directas/nueva" replace />} />
            {/* Directa usa el formulario V2 (cuadro comparativo tipo hoja de cálculo); Indirecta e importar histórico siguen con SolicitudForm. */}
            <Route path="solicitudes-directas/nueva/orden-servicio" element={<NuevaOrdenServicioV2Page categoria="DIRECTA" />} />
            <Route path="solicitudes-directas/nueva/otrosi-tiempo" element={<NuevoOtrosiTiempoPage categoria="DIRECTA" />} />
            <Route path="solicitudes-directas/nueva/otrosi-tiempo-cantidad" element={<NuevoOtrosiTiempoCantidadPage categoria="DIRECTA" />} />
            {/* "Importar histórico" es, en el fondo, otra forma de crear una
                solicitud (nace COMPLETADA en vez de BORRADOR) -- mismo
                permiso que "Nueva solicitud", mismo patrón categoria-aware
                (llega como prop de la ruta, no se pregunta acá). */}
            <Route path="solicitudes-directas/importar-historico" element={<ImportarHistoricoPage categoria="DIRECTA" />} />
          </Route>

          <Route element={<ProtectedRoute permiso="ver_solicitudes_indirectas" />}>
            <Route path="solicitudes-indirectas" element={<SolicitudesPage categoria="INDIRECTA" />} />
          </Route>
          <Route element={<ProtectedRoute permiso="crear_solicitudes_indirectas" />}>
            <Route path="solicitudes-indirectas/nueva" element={<NuevaSolicitudTipoPage categoria="INDIRECTA" />} />
            <Route path="solicitudes-indirectas/nueva/contrato" element={<NuevaContratoPage categoria="INDIRECTA" />} />
            <Route path="solicitudes-indirectas/nueva/orden-servicio" element={<NuevaOrdenServicioPage categoria="INDIRECTA" />} />
            <Route path="solicitudes-indirectas/nueva/otrosi-tiempo" element={<NuevoOtrosiTiempoPage categoria="INDIRECTA" />} />
            <Route path="solicitudes-indirectas/nueva/otrosi-tiempo-cantidad" element={<NuevoOtrosiTiempoCantidadPage categoria="INDIRECTA" />} />
            <Route path="solicitudes-indirectas/importar-historico" element={<ImportarHistoricoPage categoria="INDIRECTA" />} />
          </Route>

          {/* Importar un otrosí o un trámite viejo (sin formulario propio,
              ver ImportarOtrosiHistoricoPage.jsx) -- a diferencia de
              importar Contrato/Orden de Servicio (arriba), sigue sin ser
              categoria-aware por ruta: se enlaza desde OtrosiForm.jsx, que
              ya vive bajo /solicitudes-directas|indirectas/nueva/otrosi-*,
              y sigue preguntando Directa/Indirecta en la propia pantalla. */}
          <Route element={<ProtectedRoute permiso={['crear_solicitudes_directas', 'crear_solicitudes_indirectas']} />}>
            <Route path="solicitudes/importar-historico" element={<ImportarOtrosiHistoricoPage />} />
          </Route>
          <Route path="solicitudes/:id" element={<SolicitudDetallePage />} />
          <Route path="solicitudes/:id/editar" element={<EditarSolicitudPage />} />

          <Route element={<ProtectedRoute permiso="ver_terceros" />}>
            <Route path="terceros" element={<TercerosPage />} />
            <Route path="terceros/:id" element={<TerceroDetallePage />} />
          </Route>
          <Route element={<ProtectedRoute permiso="crear_terceros" />}>
            <Route path="terceros/nuevo" element={<NuevoTerceroPage />} />
          </Route>
          <Route element={<ProtectedRoute permiso="ver_especialidades" />}>
            <Route path="terceros/especialidades" element={<EspecialidadesPage />} />
          </Route>

          {/* Usuarios/Roles: ya no soloAdmin puro -- gateado por permiso
              granular ('ver_usuarios'/'ver_roles') para poder darle a un rol
              NO admin acceso a una seccion puntual de Configuracion en vez de
              ser todo o nada (puerto de HRMS, 2026-09-18, pedido explicito
              del usuario aplicado a los 3 proyectos). El resto de
              Configuracion (Workflows/Proyectos/Frentes) no se
              pidio desglosar -- sigue soloAdmin. */}
          <Route element={<ProtectedRoute permiso="ver_usuarios" />}>
            <Route path="configuracion/usuarios" element={<AccesosLayout><UsuariosPage /></AccesosLayout>} />
            <Route path="configuracion/usuarios/:id" element={<AccesosLayout><UsuarioFormPage /></AccesosLayout>} />
          </Route>
          <Route element={<ProtectedRoute permiso="ver_roles" />}>
            <Route path="configuracion/roles" element={<AccesosLayout><RolesPage /></AccesosLayout>} />
            <Route path="configuracion/roles/nuevo" element={<AccesosLayout><RolFormPage /></AccesosLayout>} />
            <Route path="configuracion/roles/:nombre" element={<AccesosLayout><RolDetallePage /></AccesosLayout>} />
          </Route>
          <Route element={<ProtectedRoute soloAdmin />}>
            <Route path="configuracion" element={<Navigate to="/configuracion/usuarios" replace />} />
            <Route path="configuracion/workflows" element={<AccesosLayout><WorkflowsPage /></AccesosLayout>} />
            <Route path="configuracion/workflows/:categoriaSlug" element={<AccesosLayout><WorkflowDiagramaPage /></AccesosLayout>} />
            <Route path="configuracion/workflows/:categoriaSlug/:accion" element={<AccesosLayout><WorkflowDetallePage /></AccesosLayout>} />
            <Route path="configuracion/proyectos" element={<AccesosLayout><ProyectosPage /></AccesosLayout>} />
            <Route path="configuracion/frentes" element={<AccesosLayout><FrentesPage /></AccesosLayout>} />
            <Route path="configuracion/frentes/:id" element={<AccesosLayout><FrenteDetallePage /></AccesosLayout>} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
