import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSolicitud } from '../../api/solicitudes.js';
import { SolicitudForm } from './SolicitudForm.jsx';
import { SolicitudFormV2 } from './SolicitudFormV2.jsx';

export function EditarSolicitudPage() {
  const { id } = useParams();
  const [solicitud, setSolicitud] = useState(null);

  useEffect(() => {
    getSolicitud(id).then((res) => setSolicitud(res.data));
  }, [id]);

  if (!solicitud) return null;
  // Directa se edita con el formulario V2 (mismo payload); los históricos importados siguen con el de siempre, igual que al importarlos.
  const Formulario = solicitud.categoria === 'DIRECTA' && !solicitud.importadoHistorico ? SolicitudFormV2 : SolicitudForm;
  return <Formulario tipoSolicitud={solicitud.tipo} categoria={solicitud.categoria} isEdit initialData={solicitud} />;
}
