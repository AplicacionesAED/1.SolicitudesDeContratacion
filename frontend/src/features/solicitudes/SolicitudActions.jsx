// Puerto de solicitudActions.tsx -- las reglas de visibilidad de cada botón
// son una copia literal de las del original (estado + rol + a veces "soy yo
// el responsable asignado"); el backend vuelve a validar todo esto de verdad
// en solicitud.estado.js, este componente solo evita mostrar un botón que
// fallaría igual. Los anexos por URL de CREACION_MINUTA se editan acá mismo
// (PATCH directo a archivosAnexos), no en un módulo aparte.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, ExternalLink } from 'lucide-react';
import { updateSolicitud, removeSolicitud, cambiarEstado } from '../../api/solicitudes.js';
import { categoriaSlug, formatCurrency } from '../../utils/solicitudes.js';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Field, TextInput, Textarea } from '../../components/ui/Field.jsx';
import styles from './Solicitudes.module.css';

// Espejo de MIN_NOTA_DEVOLVER en backend/src/modules/solicitud/solicitud.estado.js.
const MIN_NOTA_DEVOLVER = 30;

function detectPlatform(url) {
  if (/sharepoint\.com|1drv\.ms|onedrive\.live\.com/i.test(url)) return 'SharePoint';
  if (/drive\.google\.com|docs\.google\.com/i.test(url)) return 'Google Drive';
  if (/dropbox\.com/i.test(url)) return 'Dropbox';
  return 'Enlace';
}

export function SolicitudActions({ solicitud, usuario, onChange }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [nota, setNota] = useState('');
  const [contratosOpcion, setContratosOpcion] = useState('OK');
  const [adproNum, setAdproNum] = useState('');
  const [nombreAnexo, setNombreAnexo] = useState('');
  const [urlAnexo, setUrlAnexo] = useState('');

  const { estado } = solicitud;
  const isAdmin = usuario.esAdmin;
  const anexos = solicitud.archivosAnexos ?? [];

  // 2026-09-02 "eliminar permisos de rol para solicitudes": la autorización
  // real ya no se recalcula acá (eso fue justo el bug que motivó este
  // cambio -- este componente no pasaba por tienePermiso en absoluto y
  // podía mostrar un botón que el backend igual rechazaba). El backend
  // calcula `accionesDisponibles` con la MISMA función que usa para
  // autorizar de verdad (ver solicitud.autorizacion.js) y este componente
  // solo la lee -- una sola fuente de verdad.
  const disponibles = solicitud.accionesDisponibles ?? [];
  const puede = (accion) => disponibles.includes(accion);

  // Un borrador histórico (importadoHistorico=true) NUNCA se envía por acá
  // -- "Enviar solicitud" dispara la máquina de aprobaciones real
  // (solicitud.estado.js), y un registro histórico nunca pasa por eso; se
  // completa desde el propio formulario de edición ("Importar", ver
  // SolicitudForm.jsx#esHistorico -> completarHistorico()). Sin este
  // chequeo, `accionesDisponibles` igual incluiría ENVIAR (el permiso de
  // módulo no distingue histórico) y este botón dispararía el flujo
  // equivocado.
  const canEnviar = estado === 'BORRADOR' && !solicitud.importadoHistorico && puede('ENVIAR');
  const canAprobarDirectorTecnico = estado === 'PENDIENTE_DIRECTOR_TECNICO' && puede('APROBAR_DIRECTOR_TECNICO');
  const canDevolverTecnico = estado === 'PENDIENTE_DIRECTOR_TECNICO' && puede('DEVOLVER');
  const canAprobarDirector = estado === 'ENVIADA' && puede('APROBAR_DIRECTOR');
  const canDevolver = estado === 'ENVIADA' && puede('DEVOLVER');
  // Flujo propio de Directa (Orden de Servicio, 2026-09-18): "Controles
  // realiza proyección, debe dar su aprobado con fecha de aprobación" --
  // paso nuevo entre la aprobación del Director y Contratos-Trámite.
  const esDirecta = solicitud.categoria === 'DIRECTA';
  const canAprobarProyeccion = estado === 'EN_PROYECCION_CONTROLES' && puede('APROBAR_PROYECCION');
  const canDevolverProyeccion = estado === 'EN_PROYECCION_CONTROLES' && puede('DEVOLVER');
  // APROBAR_RESIDENTE_ADMINISTRATIVO (2026-09-21): paso nuevo de Directa
  // entre el Director de Obra y Controles — Proyección. El Residente
  // Administrativo (mismo slot que "Residente Administrativo — Adpro", 2
  // participaciones del mismo rol) aprueba para seguir a proyección.
  const canAprobarResidenteAdministrativo = estado === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO' && puede('APROBAR_RESIDENTE_ADMINISTRATIVO');
  // DEVOLVER desde Residente Administrativo (2026-09-22): el backend ya
  // contempla PENDIENTE_RESIDENTE_ADMINISTRATIVO como origen de DEVOLVER y
  // redirige el destino a ese mismo estado cuando se devuelve desde
  // EN_PROYECCION_CONTROLES o EN_TRAMITE_CONTRATOS (solo Directa).
  const canDevolverResidenteAdministrativo = estado === 'PENDIENTE_RESIDENTE_ADMINISTRATIVO' && puede('DEVOLVER');
  // COMENTAR (2026-09-21): comentar la proyección sin aprobarla ni devolverla
  // -- solo agrega una fila al historial con la `nota`, no cambia el estado.
  const canComentarProyeccion = estado === 'EN_PROYECCION_CONTROLES' && puede('COMENTAR');
  const canContratosAction = (estado === 'APROBADA_DIRECTOR' || estado === 'EN_TRAMITE_CONTRATOS') && (puede('TRAMITAR_OK') || puede('REVISAR'));
  // "Contratos elaboración de orden debe ser un check" -- en Directa este
  // paso ya no exige un anexo adjunto (solo Indirecta lo sigue exigiendo,
  // ver solicitud.estado.js).
  const showAnexosUpload = estado === 'CREACION_MINUTA' && puede('AVANZAR_CONTRATOS') && !esDirecta;
  const canAvanzarContratos = estado === 'CREACION_MINUTA' && puede('AVANZAR_CONTRATOS') && (esDirecta || anexos.length > 0);
  const canRegistrarAdpro = estado === 'EN_CONTROLES' && puede('REGISTRAR_ADPRO');
  const canAprobarFinal = estado === 'APROBACION_FINAL' && puede('APROBAR_FINAL');
  // Paso nuevo AL FINAL del flujo Directa (2026-10-09) -- tras la
  // aprobación de Director/a de Controles (canAprobarFinal), un desvío
  // redirige DIRECTA acá en vez de COMPLETADA directo (ver
  // solicitud.estado.js#desvios). INDIRECTA nunca alcanza este estado.
  const canAprobarGerenteCompras = estado === 'PENDIENTE_GERENTE_COMPRAS' && puede('APROBAR_GERENTE_COMPRAS');
  const canReenviar = (estado === 'DEVUELTA' || estado === 'EN_REVISION') && puede('REENVIAR');
  // 2026-09-21: el backend expone `solicitud.puedeEditar` (misma lógica que
  // `accionesDisponibles` -- una sola fuente de verdad: el backend calcula,
  // este componente solo lee). Incluye BORRADOR/DEVUELTA/EN_REVISION para el
  // solicitante, admin, y a quien gestiona la solicitud por rol según su
  // estado (p. ej. Residente Administrativo en PENDIENTE_RESIDENTE_
  // ADMINISTRATIVO) -- sin duplicar esa regla acá.
  const canEdit = solicitud.puedeEditar;
  // ANULAR (pedido explícito del usuario, 2026-09-09: "no quiero
  // eliminarlas directamente... la persona de Controles que registra el N°
  // Adpro tenga ese botón") -- a diferencia de las demás acciones de arriba,
  // NO se repite acá la lista de estados de origen (ver
  // solicitud.autorizacion.js#ESTADOS_NO_TERMINALES, son casi todos menos
  // BORRADOR/COMPLETADA/ANULADA): `disponibles` ya viene filtrada por eso
  // desde el backend, alcanza con `puede('ANULAR')` sin duplicar la regla acá.
  const canAnular = puede('ANULAR');

  const hasAnyAction = canEnviar || canAprobarDirectorTecnico || canDevolverTecnico || canAprobarDirector || canDevolver || canAprobarResidenteAdministrativo || canDevolverResidenteAdministrativo || canAprobarProyeccion || canDevolverProyeccion || canComentarProyeccion || canContratosAction || showAnexosUpload || canAvanzarContratos || canRegistrarAdpro || canAprobarFinal || canAprobarGerenteCompras || canReenviar || canEdit || canAnular || isAdmin;

  if (!hasAnyAction) return null;

  async function ejecutar(accion, extra = {}) {
    setLoading(true);
    setError(null);
    try {
      await cambiarEstado(solicitud.id, accion, extra);
      cerrarModal();
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function eliminar() {
    setLoading(true);
    setError(null);
    try {
      await removeSolicitud(solicitud.id);
      navigate(`/solicitudes-${categoriaSlug(solicitud.categoria)}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function abrirModal(tipo) {
    setModalType(tipo);
    setNota('');
    setContratosOpcion('OK');
    setAdproNum('');
    setError(null);
  }

  function cerrarModal() {
    if (loading) return;
    setModalType(null);
  }

  async function confirmarModal() {
    if (modalType === 'enviar') return ejecutar('ENVIAR');
    if (modalType === 'aprobar_tecnico') return ejecutar('APROBAR_DIRECTOR_TECNICO');
    if (modalType === 'aprobar_residente_administrativo') return ejecutar('APROBAR_RESIDENTE_ADMINISTRATIVO');
    if (modalType === 'devolver_tecnico' || modalType === 'devolver' || modalType === 'devolver_proyeccion' || modalType === 'devolver_residente_administrativo') {
      if (nota.trim().length < MIN_NOTA_DEVOLVER) return setError(`El motivo de la devolución debe tener al menos ${MIN_NOTA_DEVOLVER} caracteres`);
      return ejecutar('DEVOLVER', { nota });
    }
    if (modalType === 'aprobar') return ejecutar('APROBAR_DIRECTOR');
    if (modalType === 'aprobar_proyeccion') return ejecutar('APROBAR_PROYECCION');
    if (modalType === 'contratos') {
      if (contratosOpcion === 'OK') return ejecutar('TRAMITAR_OK', nota ? { nota } : {});
      if (!nota.trim()) return setError('La nota es obligatoria cuando se requiere revisión');
      return ejecutar('REVISAR', { nota });
    }
    if (modalType === 'adpro') {
      if (!adproNum.trim()) return setError('El número de contrato Adpro es obligatorio');
      return ejecutar('REGISTRAR_ADPRO', { numeroContratoAdpro: adproNum });
    }
    if (modalType === 'comentar_proyeccion') {
      if (!nota.trim()) return setError('El comentario es obligatorio');
      return ejecutar('COMENTAR', { nota });
    }
    if (modalType === 'aprobar_final') return ejecutar('APROBAR_FINAL');
    if (modalType === 'aprobar_gerente_compras') return ejecutar('APROBAR_GERENTE_COMPRAS');
    if (modalType === 'reenviar') return ejecutar('REENVIAR');
    if (modalType === 'anular') {
      if (!nota.trim()) return setError('El motivo es obligatorio para anular la solicitud');
      return ejecutar('ANULAR', { nota });
    }
    if (modalType === 'eliminar') return eliminar();
  }

  async function agregarAnexo(e) {
    e.preventDefault();
    if (!nombreAnexo.trim() || !/^https?:\/\/.+/i.test(urlAnexo.trim())) {
      setError('Nombre y una URL válida (https://...) son obligatorios');
      return;
    }
    setError(null);
    try {
      await updateSolicitud(solicitud.id, { archivosAnexos: [...anexos, { url: urlAnexo.trim(), nombre: nombreAnexo.trim() }] });
      setNombreAnexo('');
      setUrlAnexo('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitarAnexo(idx) {
    await updateSolicitud(solicitud.id, { archivosAnexos: anexos.filter((_, i) => i !== idx) });
    onChange();
  }

  const TITULOS = {
    enviar: 'Confirmar envío de solicitud',
    aprobar_tecnico: 'Aprobar — Director Técnico',
    aprobar_residente_administrativo: 'Aprobar — Residente Administrativo',
    devolver_tecnico: 'Devolver solicitud',
    aprobar: 'Aprobar solicitud',
    aprobar_proyeccion: 'Aprobar proyección — Controles',
    devolver_proyeccion: 'Devolver solicitud',
    devolver_residente_administrativo: 'Devolver solicitud',
    comentar_proyeccion: 'Agregar comentario',
    devolver: 'Devolver solicitud',
    contratos: 'Revisión de Contratos',
    adpro: 'Registrar Número Adpro',
    aprobar_final: 'Aprobación definitiva',
    aprobar_gerente_compras: 'Firmar — Gerente de Compras',
    reenviar: 'Reenviar solicitud',
    anular: 'Anular solicitud',
    eliminar: 'Eliminar solicitud',
  };

  return (
    <>
      {showAnexosUpload && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Anexos de la solicitud <span style={{ color: 'var(--color-danger-ink)', fontWeight: 400, fontSize: 'var(--text-data-size)' }}>* al menos 1 requerido</span></h3>
          {anexos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              {anexos.map((a, idx) => (
                <span key={idx} className={styles.tipoCard} style={{ flexDirection: 'row', alignItems: 'center', padding: '6px 12px', cursor: 'default', gap: 8 }}>
                  <Link2 size={13} />
                  <span style={{ fontSize: 'var(--text-label-size)' }}>{a.nombre} ({detectPlatform(a.url)})</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /></a>
                  <button type="button" onClick={() => quitarAnexo(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-danger-ink)' }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={agregarAnexo} style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field className="fieldMd" label="Nombre del documento" required>
              {(p) => <TextInput {...p} value={nombreAnexo} onChange={(e) => setNombreAnexo(e.target.value)} />}
            </Field>
            <Field className="fieldMd" label="URL" required helper="https://...">
              {(p) => <TextInput {...p} value={urlAnexo} onChange={(e) => setUrlAnexo(e.target.value)} />}
            </Field>
            <Button type="submit" variant="secondary">Agregar enlace</Button>
          </form>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Acciones disponibles</h3>
        {error && !modalType && <p className={styles.errorBanner}>{error}</p>}
        <div className={styles.actionsRow}>
          {canEnviar && <Button onClick={() => abrirModal('enviar')}>Enviar solicitud</Button>}
          {canAprobarDirectorTecnico && <Button onClick={() => abrirModal('aprobar_tecnico')}>Aprobar — Director Técnico</Button>}
          {canAprobarResidenteAdministrativo && <Button onClick={() => abrirModal('aprobar_residente_administrativo')}>Aprobar</Button>}
          {canDevolverResidenteAdministrativo && <Button variant="danger" onClick={() => abrirModal('devolver_residente_administrativo')}>Devolver</Button>}
          {canDevolverTecnico && <Button variant="danger" onClick={() => abrirModal('devolver_tecnico')}>Devolver</Button>}
          {canAprobarDirector && <Button onClick={() => abrirModal('aprobar')}>Aprobar</Button>}
          {canDevolver && <Button variant="danger" onClick={() => abrirModal('devolver')}>Devolver</Button>}
          {canAprobarProyeccion && <Button onClick={() => abrirModal('aprobar_proyeccion')}>Aprobar proyección</Button>}
          {canDevolverProyeccion && <Button variant="danger" onClick={() => abrirModal('devolver_proyeccion')}>Devolver</Button>}
          {canComentarProyeccion && <Button variant="secondary" onClick={() => abrirModal('comentar_proyeccion')}>Agregar comentario</Button>}
          {canContratosAction && <Button onClick={() => abrirModal('contratos')}>Revisar documentación</Button>}
          {showAnexosUpload && <Button onClick={() => ejecutar('AVANZAR_CONTRATOS')} disabled={anexos.length === 0 || loading}>Pasar a Controles</Button>}
          {canAvanzarContratos && esDirecta && <Button onClick={() => ejecutar('AVANZAR_CONTRATOS')} disabled={loading}>Confirmar elaboración de orden</Button>}
          {canRegistrarAdpro && <Button onClick={() => abrirModal('adpro')}>Registrar Número Adpro</Button>}
          {canAprobarFinal && <Button onClick={() => abrirModal('aprobar_final')}>Aprobar Definitivamente</Button>}
          {canAprobarGerenteCompras && <Button onClick={() => abrirModal('aprobar_gerente_compras')}>Firmar</Button>}
          {canReenviar && <Button onClick={() => abrirModal('reenviar')}>Reenviar</Button>}
          {canEdit && <Button variant="secondary" onClick={() => navigate(`/solicitudes/${solicitud.id}/editar`)}>Editar solicitud</Button>}
          {canAnular && <Button variant="danger" onClick={() => abrirModal('anular')}>Anular solicitud</Button>}
          {isAdmin && <Button variant="danger" onClick={() => abrirModal('eliminar')}>Eliminar</Button>}
        </div>
      </div>

      <Modal
        open={modalType != null}
        onClose={cerrarModal}
        title={TITULOS[modalType] ?? ''}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={cerrarModal} disabled={loading}>Cancelar</Button>
            <Button type="button" variant={['devolver', 'devolver_tecnico', 'devolver_proyeccion', 'devolver_residente_administrativo', 'anular', 'eliminar'].includes(modalType) ? 'danger' : 'primary'} onClick={confirmarModal} disabled={loading}>
              {loading ? 'Procesando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        {modalType === 'enviar' && <p>¿Confirmas que deseas enviar la solicitud <strong>{solicitud.consecutivo}</strong> para aprobación del director?</p>}
        {modalType === 'aprobar_tecnico' && <p>¿Confirmas la aprobación como Director Técnico? Pasará al Director de Proyecto.</p>}
        {modalType === 'aprobar_residente_administrativo' && <p>¿Confirmas la aprobación como Residente Administrativo? Pasará a Controles para su proyección.</p>}
        {(modalType === 'devolver_tecnico' || modalType === 'devolver') && (
          <Field label="Nota" required helper={`Mínimo ${MIN_NOTA_DEVOLVER} caracteres (${nota.trim().length}/${MIN_NOTA_DEVOLVER})`}>
            {(p) => <Textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe el motivo de la devolución..." />}
          </Field>
        )}
        {(modalType === 'aprobar' || modalType === 'aprobar_proyeccion') && (
          <>
            {/* "Debe poder ver los valores claritos de la solicitud" --
                pedido explícito del usuario (flujo de Directa, 2026-09-18).
                Se muestra en ambas aprobaciones (Director y Controles-
                Proyección) -- no hace daño mostrarlo también en Indirecta. */}
            {solicitud.valorFinal != null && (
              <div style={{ background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                <div style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: 'var(--text-label-tracking)' }}>Valor total de la solicitud</div>
                <div style={{ fontSize: 'var(--text-title-size)', fontWeight: 600 }}>{formatCurrency(solicitud.valorFinal)}</div>
                {solicitud.valorEnLetras && <div style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)', fontStyle: 'italic' }}>{solicitud.valorEnLetras}</div>}
              </div>
            )}
            <p>
              {modalType === 'aprobar'
                ? `¿Confirmas la aprobación? Pasará a ${esDirecta ? 'Controles para su proyección' : 'Contratos para su trámite'}.`
                : '¿Confirmas la aprobación de la proyección? Pasará a Contratos para su trámite.'}
            </p>
          </>
        )}
        {(modalType === 'devolver_proyeccion' || modalType === 'devolver_residente_administrativo') && (
          <Field label="Nota" required helper={`Mínimo ${MIN_NOTA_DEVOLVER} caracteres (${nota.trim().length}/${MIN_NOTA_DEVOLVER})`}>
            {(p) => <Textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe el motivo de la devolución..." />}
          </Field>
        )}
        {modalType === 'comentar_proyeccion' && (
          <Field label="Comentario" required>
            {(p) => <Textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Explica el motivo del retraso u otra observación..." />}
          </Field>
        )}
        {modalType === 'contratos' && (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" checked={contratosOpcion === 'OK'} onChange={() => setContratosOpcion('OK')} />
              <span>OK — Documentación completa</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="radio" checked={contratosOpcion === 'REVISAR'} onChange={() => setContratosOpcion('REVISAR')} />
              <span>Se debe revisar — hay observaciones</span>
            </label>
            <Field label="Nota" required={contratosOpcion === 'REVISAR'}>
              {(p) => <Textarea {...p} rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />}
            </Field>
          </>
        )}
        {modalType === 'adpro' && (
          <Field label="Número Adpro" required>
            {(p) => <TextInput {...p} value={adproNum} onChange={(e) => setAdproNum(e.target.value)} placeholder="Ej. ADPRO-2026-001" />}
          </Field>
        )}
        {modalType === 'aprobar_final' && (
          <p>
            ¿Confirmas la aprobación definitiva?{' '}
            <>El estado cambiará a <strong>Completada</strong>.</>
          </p>
        )}
        {modalType === 'aprobar_gerente_compras' && <p>¿Confirmas la firma como Gerente de Compras? La solicitud pasará al Residente Administrativo para registrar el N° Adpro.</p>}
        {modalType === 'reenviar' && <p>¿Confirmas que deseas reenviar la solicitud <strong>{solicitud.consecutivo}</strong>?</p>}
        {modalType === 'anular' && (
          <>
            <p>Estás a punto de <strong>anular por completo</strong> la solicitud <strong>{solicitud.consecutivo}</strong>. No se elimina ningún dato -- queda registrada como Anulada, con el motivo en su historial, y se notificará al solicitante. Esta acción no se puede deshacer.</p>
            <Field label="Motivo de la anulación" required>
              {(p) => <Textarea {...p} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe el motivo de la anulación..." />}
            </Field>
          </>
        )}
        {modalType === 'eliminar' && (
          <p>Estás a punto de eliminar permanentemente <strong>{solicitud.consecutivo}</strong>. Esta acción no se puede deshacer.
            {solicitud.tieneOtrosis && ' Todos los otrosís asociados también serán eliminados.'}
          </p>
        )}
        {error && <p className={styles.errorBanner}>{error}</p>}
      </Modal>
    </>
  );
}
