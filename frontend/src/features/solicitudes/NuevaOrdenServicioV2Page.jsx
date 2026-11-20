import { SolicitudFormV2 } from './SolicitudFormV2.jsx';

export function NuevaOrdenServicioV2Page({ categoria }) {
  return <SolicitudFormV2 tipoSolicitud="ORDEN_SERVICIO" categoria={categoria} />;
}
