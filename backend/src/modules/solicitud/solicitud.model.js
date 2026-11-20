// Puerto de `model Solicitud` (schema.prisma, ~40 columnas) -- el corazón del
// dominio. `frentes_ids`/`archivos_anexos` eran JSON-string-en-TEXT en Prisma
// (limitación sin adapter); acá son JSONB nativo, pero el filtrado de
// pertenencia sigue en memoria en solicitud.service.js (mismo criterio que
// AprobadorFrente en Fase 2) para no cambiar el comportamiento del motor de
// visibilidad/aprobaciones. La lógica de negocio (máquina de estados,
// consecutivo, visibilidad) vive en solicitud.estado.js/solicitud.service.js
// -- este archivo es solo schema + asociaciones.
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Solicitud = sequelize.define(
  'Solicitud',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    consecutivo: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    tipo: { type: DataTypes.STRING(40), allowNull: false },
    // 'DIRECTA' | 'INDIRECTA' -- mismo motor de aprobación para ambas, ver
    // solicitud.estado.js. Todo lo migrado en Fase 9 es INDIRECTA (default).
    categoria: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'INDIRECTA' },
    fecha_solicitud: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

    solicitante_id: { type: DataTypes.INTEGER, allowNull: false },
    proyecto_id: { type: DataTypes.INTEGER, allowNull: false },
    frentes_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    tercero_id: { type: DataTypes.INTEGER, allowNull: true },

    descripcion_actividad: { type: DataTypes.TEXT, allowNull: true },
    plazo_ejecucion: { type: DataTypes.STRING(255), allowNull: true },
    forma_pago: { type: DataTypes.TEXT, allowNull: true },
    valor_final: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    tipo_contrato: { type: DataTypes.STRING(40), allowNull: true },
    asunto: { type: DataTypes.TEXT, allowNull: true },

    creacion_tercero: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    contratante_nombre: { type: DataTypes.STRING(255), allowNull: true, defaultValue: 'AED CONSTRUCTORES S.A.S' },
    contratante_nit: { type: DataTypes.STRING(30), allowNull: true, defaultValue: '901237628-1' },
    alcance: { type: DataTypes.TEXT, allowNull: true },
    terminos_referencia: { type: DataTypes.TEXT, allowNull: true },
    condiciones_especiales: { type: DataTypes.TEXT, allowNull: true },
    valor_en_letras: { type: DataTypes.STRING(500), allowNull: true },

    doc_terminos_referencia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_camara_comercio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_estados_financieros: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_estado_resultados: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_sagrilaft: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_composicion_accionaria: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_rut: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_cedula_representante: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_certificacion_bancaria: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_cotizacion: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    archivo_cuadro_comparativo: { type: DataTypes.STRING(500), allowNull: true },
    archivo_cotizacion: { type: DataTypes.STRING(500), allowNull: true },
    archivo_formato_solicitud: { type: DataTypes.STRING(500), allowNull: true },
    archivo_pre_bep: { type: DataTypes.STRING(500), allowNull: true },
    archivo_generador_gastos: { type: DataTypes.STRING(500), allowNull: true },
    archivo_evaluacion_inicial: { type: DataTypes.STRING(500), allowNull: true },
    archivos_anexos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    aprobador_id: { type: DataTypes.INTEGER, allowNull: true },
    fecha_aprobacion_director: { type: DataTypes.DATE, allowNull: true },

    responsable_contratos_tramite_id: { type: DataTypes.INTEGER, allowNull: true },
    responsable_contratos_minuta_id: { type: DataTypes.INTEGER, allowNull: true },
    coordinador_controles_id: { type: DataTypes.INTEGER, allowNull: true },
    director_controles_id: { type: DataTypes.INTEGER, allowNull: true },
    // Flujo propio de Directa (Orden de Servicio), 2026-09-18 -- snapshots
    // de los 3 slots nuevos (ver solicitud.autorizacion.js#SNAPSHOT_POR_SLOT),
    // mismo criterio que los 4 de arriba.
    responsable_controles_proyeccion_id: { type: DataTypes.INTEGER, allowNull: true },
    responsable_residente_administrativo_id: { type: DataTypes.INTEGER, allowNull: true },
    responsable_controles_aprobacion_final_id: { type: DataTypes.INTEGER, allowNull: true },
    responsable_director_obra_id: { type: DataTypes.INTEGER, allowNull: true },
    fecha_aprobacion_controles_proyeccion: { type: DataTypes.DATE, allowNull: true },
    fecha_aprobacion_residente_administrativo: { type: DataTypes.DATE, allowNull: true },
    // Paso nuevo AL FINAL del flujo Directa, 2026-10-09 -- después de
    // Director/a de Controles (APROBACION_FINAL, sin cambios de estado
    // técnico, solo de etiqueta) aprueba el Gerente de Compras antes de
    // COMPLETADA. Mismo criterio de snapshot/fecha que los demás pasos.
    responsable_gerente_compras_id: { type: DataTypes.INTEGER, allowNull: true },
    fecha_aprobacion_gerente_compras: { type: DataTypes.DATE, allowNull: true },
    // Concepto del revisor de Compras (2026-11-20): 'OK' | 'NO_OK' | null. Solo informativo para el Gerente de Compras;
    // se limpia al (re)entrar al paso. Cada cambio queda en HistorialSolicitud.
    responsable_revisor_compras_id: { type: DataTypes.INTEGER, allowNull: true },
    concepto_compras: { type: DataTypes.STRING(10), allowNull: true },
    nota_concepto_compras: { type: DataTypes.TEXT, allowNull: true },
    fecha_concepto_compras: { type: DataTypes.DATE, allowNull: true },
    concepto_compras_por: { type: DataTypes.STRING(150), allowNull: true },

    nota_contratacion: { type: DataTypes.TEXT, allowNull: true },
    necesita_revision: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    numero_contrato_adpro: { type: DataTypes.STRING(100), allowNull: true },

    importado_historico: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    numero_otrosi: { type: DataTypes.INTEGER, allowNull: true },

    estado: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'BORRADOR' },

    solicitud_padre_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'solicitudes', underscored: true, createdAt: 'creado_en', updatedAt: 'actualizado_en' }
);

Solicitud.associate = (models) => {
  Solicitud.belongsTo(models.Usuario, { foreignKey: 'solicitante_id', as: 'solicitante' });
  Solicitud.belongsTo(models.Usuario, { foreignKey: 'aprobador_id', as: 'aprobador' });
  Solicitud.belongsTo(models.Proyecto, { foreignKey: 'proyecto_id', as: 'proyecto' });
  Solicitud.belongsTo(models.Tercero, { foreignKey: 'tercero_id', as: 'tercero' });
  Solicitud.belongsTo(models.Solicitud, { foreignKey: 'solicitud_padre_id', as: 'solicitudPadre' });
  Solicitud.hasMany(models.Solicitud, { foreignKey: 'solicitud_padre_id', as: 'otrosis' });
  Solicitud.hasMany(models.HistorialSolicitud, { foreignKey: 'solicitud_id', as: 'historial' });
  Solicitud.hasOne(models.CronogramaContrato, { foreignKey: 'solicitud_id', as: 'cronograma' });
  Solicitud.hasOne(models.CuadroComparativo, { foreignKey: 'solicitud_id', as: 'cuadroComparativo' });
  Solicitud.hasOne(models.Memoria, { foreignKey: 'solicitud_id', as: 'memoria' });
};

module.exports = Solicitud;
