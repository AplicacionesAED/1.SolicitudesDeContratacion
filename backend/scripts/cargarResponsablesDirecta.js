'use strict';

// Carga única (2026-11-20, pedido explícito del usuario): deja la configuración de Solicitudes DIRECTAS según la tabla de
// responsables por frente (Director de Obra / Residente de Obra / Residente Administrativo):
//   - crea los usuarios que faltan (ingreso solo por Microsoft, sin contraseña conocida) y les suma el rol que les toca;
//   - crea los frentes nuevos (Club de Raqueta y Postventa en Baía Kristal; proyecto Almar con Matimba - Lotes y Amenidades);
//   - en cada frente asigna a esas personas SOLO para Directa (frente_usuarios.categoria = 'DIRECTA') y fija los slots
//     director_obra y residente_administrativo con personas puntuales (sin roles: ya no vale "cualquiera con el rol");
//   - Controles (Coordinador y Director de Controles) queda en todos los frentes;
//   - los frentes que no están en la tabla quedan solo con Controles en Directa;
//   - el rol Residente Administrativo pasa a alcance FRENTE para que vea las solicitudes de sus frentes.
// Indirecta no se toca. Simulacro por defecto: `node scripts/cargarResponsablesDirecta.js` solo muestra qué haría;
// `--aplicar` escribe todo en una sola transacción. Es repetible (idempotente).
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const sequelize = require('../src/config/db');
const m = require('../src/models');
const { hashPassword } = require('../src/utils/security');
const { generateRandomPassword } = require('../src/utils/passwordRules');
const { getRolesPorCodigo } = require('../src/utils/permisos');

const APLICAR = process.argv.includes('--aplicar');
const DOMINIO = '@aed.com.co';

const PERSONAS = {
  blopez: 'Brenda López',
  ccontreras: 'Carlos Contreras',
  lsalazar: 'Luis Salazar',
  esanchez: 'Emiro Sánchez',
  sgaravito: 'Sergio Garavito',
  lpereira: 'Leonardo Pereira',
  jadiaz: 'Jesus Diaz',
  wcancino: 'Walberto Cancino',
  lpuello: 'Luis Puello',
  laguas: 'Luis Aguas',
  jbustamante: 'José Bustamante',
  kjuvinao: 'Karen Juvinao',
  jgamba: 'José Gamba',
  mbarranco: 'Ma. Paz Montenegro',
  kfonseca: 'Katya Fonseca',
  cherrera: 'Carlos Herrera',
  rdelaossa: 'Rolando de la Ossa',
  gsanchez: 'Gustavo Sanchez Alonso',
  asalazar: 'Anabela Salazar Romero',
  jribon: 'Julio Ribon',
};

// `frentes`: nombres EXACTOS de la base (o a crear). Una fila de la tabla puede cubrir varios frentes (torres).
const TABLA = [
  { frentes: ['KALA 1', 'KALA 2'], director: ['blopez'], residente: ['ccontreras'], admin: ['lsalazar'] },
  { frentes: ['PRIVE 1', 'PRIVE 4'], director: ['esanchez'], residente: ['sgaravito', 'lpereira'], admin: ['jadiaz'] },
  { frentes: ['KALIZA 1', 'KALIZA 2'], director: ['wcancino'], residente: ['lpuello'], admin: ['laguas'] },
  { frentes: ['KALA 3', 'KALA 4'], director: ['jbustamante'], residente: ['kjuvinao'], admin: ['laguas'] },
  { frentes: ['THE PLAZA'], director: ['wcancino'], residente: ['wcancino'], admin: ['laguas'] },
  { frentes: ['KABO 3', 'KABO 4'], director: ['esanchez'], residente: ['sgaravito'], admin: ['jadiaz'] },
  { frentes: ['URBANISMO'], director: ['jgamba'], residente: ['mbarranco'], admin: ['jadiaz'] },
  { frentes: ['Club de Raqueta'], proyecto: 'Baia Kristal', director: ['jgamba'], residente: ['mbarranco'], admin: ['jadiaz'] },
  { frentes: ['Postventa'], proyecto: 'Baia Kristal', director: ['esanchez'], residente: ['kfonseca'], admin: ['jadiaz'] },
  { frentes: ['ISLA LAGUNA'], director: ['cherrera'], residente: ['rdelaossa', 'gsanchez'], admin: ['asalazar'] },
  { frentes: ['VELA VILLAGE'], director: ['esanchez'], residente: ['esanchez'], admin: ['asalazar', 'lsalazar'] },
  { frentes: ['Matimba - Lotes'], proyecto: 'Almar', director: ['jribon'], residente: ['jribon'], admin: ['asalazar'] },
  { frentes: ['Matimba - Amenidades'], proyecto: 'Almar', director: ['jribon'], residente: ['jribon'], admin: ['asalazar'] },
];

const ROL = { director: 'Director de Obra', residente: 'Residente de Obra', admin: 'Residente Administrativo' };
const SLOT_VACIO = () => ({ usuarios: [], roles: [] });

(async () => {
  const log = (...a) => console.log(...a);
  log(APLICAR ? '=== APLICANDO ===' : '=== SIMULACRO (no escribe nada) ===');

  // Roles de sistema esperados: si alguno no existe se detiene antes de tocar nada.
  const rolesDb = await m.Rol.findAll({ attributes: ['nombre'], raw: true });
  for (const r of Object.values(ROL)) if (!rolesDb.some((x) => x.nombre === r)) throw new Error(`No existe el rol "${r}"`);
  const rp = await getRolesPorCodigo();

  // 1) Roles que necesita cada persona según la tabla.
  const rolesPorEmail = {};
  for (const fila of TABLA) for (const tipo of ['director', 'residente', 'admin']) for (const k of fila[tipo]) (rolesPorEmail[k + DOMINIO] ??= new Set()).add(ROL[tipo]);

  const existentes = await m.Usuario.findAll({ where: { email: Object.keys(rolesPorEmail) } });
  const porEmail = Object.fromEntries(existentes.map((u) => [u.email, u]));
  const creados = [];
  const rolesAgregados = [];
  const t = await sequelize.transaction();
  try {
    for (const [email, roles] of Object.entries(rolesPorEmail)) {
      const k = email.replace(DOMINIO, '');
      let u = porEmail[email];
      if (!u) {
        creados.push(`${PERSONAS[k]} <${email}> [${[...roles].join(', ')}]`);
        if (APLICAR) u = await m.Usuario.create({ email, nombre: PERSONAS[k], hashed_password: await hashPassword(generateRandomPassword()), roles: [...roles], activo: true }, { transaction: t });
        else u = { id: `(nuevo ${k})`, email, roles: [...roles] };
        porEmail[email] = u;
      } else {
        const faltan = [...roles].filter((r) => !(u.roles ?? []).includes(r));
        if (faltan.length) {
          rolesAgregados.push(`${u.nombre}: +${faltan.join(', ')}`);
          if (APLICAR) await u.update({ roles: [...(u.roles ?? []), ...faltan] }, { transaction: t });
        }
        if (!u.activo) log(`  AVISO: ${u.nombre} está inactivo; se deja como está.`);
      }
    }
    log(`\nUsuarios nuevos (${creados.length}):\n  ${creados.join('\n  ') || '-'}`);
    log(`Roles agregados a usuarios existentes (${rolesAgregados.length}):\n  ${rolesAgregados.join('\n  ') || '-'}`);

    // 2) Proyectos y frentes nuevos.
    const frentes = await m.Frente.findAll({ transaction: t });
    const proyectos = await m.Proyecto.findAll({ transaction: t });
    const proyectoPorNombre = (n) => proyectos.find((p) => p.nombre === n);
    let almar = proyectoPorNombre('Almar');
    if (!almar) {
      log('\nProyecto nuevo: Almar (código de consecutivo ALM)');
      if (APLICAR) { almar = await m.Proyecto.create({ nombre: 'Almar', codigo_consecutivo: 'ALM', activo: true }, { transaction: t }); proyectos.push(almar); }
    }
    const frentePorNombre = {};
    for (const f of frentes) frentePorNombre[f.nombre] = f;
    for (const fila of TABLA) {
      for (const nombre of fila.frentes) {
        if (frentePorNombre[nombre]) continue;
        const proyecto = fila.proyecto === 'Almar' ? almar : proyectoPorNombre(fila.proyecto ?? 'Baia Kristal');
        log(`Frente nuevo: ${nombre} (proyecto ${fila.proyecto ?? 'Baia Kristal'})`);
        frentePorNombre[nombre] = APLICAR ? await m.Frente.create({ nombre, etapa: null, proyecto_id: proyecto.id }, { transaction: t }) : { id: `(nuevo ${nombre})`, nombre };
      }
    }
    for (const fila of TABLA) for (const n of fila.frentes) if (!frentePorNombre[n]) throw new Error(`No se encontró el frente "${n}"`);

    // 3) Controles: Coordinador y Director de Controles (por código de rol), en todos los frentes.
    const todos = await m.Usuario.findAll({ where: { activo: true }, attributes: ['id', 'nombre', 'roles'], transaction: t });
    const controles = todos.filter((u) => (u.roles ?? []).includes(rp.CONTROLES) || (u.roles ?? []).includes(rp.DIRECTOR_CONTROLES));
    log(`\nControles en todos los frentes: ${controles.map((u) => u.nombre).join(', ')}`);

    // 4) Por frente: personas de Directa + slots de Directa.
    const idsDe = (claves) => claves.map((k) => porEmail[k + DOMINIO].id);
    const plantilla = await m.AprobadorFrente.findOne({ where: { frente_id: frentePorNombre['KABO 1'].id, categoria: 'DIRECTA' }, raw: true, transaction: t });
    const COLUMNAS_SLOT = ['director_proyecto', 'contratos_tramite', 'contratos_minuta', 'director_controles', 'director_tecnico', 'controles_adpro', 'controles_proyeccion', 'residente_administrativo', 'controles_aprobacion_final', 'director_obra', 'gerente_compras', 'revisor_compras'];
    const filaPorFrente = {};
    for (const fila of TABLA) for (const n of fila.frentes) filaPorFrente[n] = fila;
    const todosLosFrentes = Object.values(frentePorNombre);

    if (APLICAR) await m.FrenteUsuario.destroy({ where: { categoria: 'DIRECTA' }, transaction: t });
    log('\nResultado por frente (Directa):');
    for (const f of todosLosFrentes) {
      const fila = filaPorFrente[f.nombre];
      const director = fila ? idsDe(fila.director) : [];
      const residAdmin = fila ? idsDe(fila.admin) : [];
      const personas = fila ? [...new Set([...director, ...idsDe(fila.residente), ...residAdmin])] : [];
      const usuarios = [...new Set([...personas, ...controles.map((u) => u.id)])];
      const nom = (ids) => ids.map((id) => todos.find((u) => u.id === id)?.nombre ?? Object.values(porEmail).find((u) => u.id === id)?.nombre ?? id).join(' + ') || '(nadie)';
      log(`  ${f.nombre.padEnd(22)} director: ${nom(director)} | resid. obra: ${fila ? nom(idsDe(fila.residente)) : '(nadie)'} | resid. admin: ${nom(residAdmin)}${fila ? '' : '   <- no está en la tabla'}`);
      if (!APLICAR) continue;
      await m.FrenteUsuario.bulkCreate(usuarios.map((usuario_id) => ({ usuario_id, frente_id: f.id, categoria: 'DIRECTA' })), { transaction: t });
      const config = await m.AprobadorFrente.findOne({ where: { frente_id: f.id, categoria: 'DIRECTA' }, transaction: t });
      const valores = { director_obra: { usuarios: director, roles: [] }, residente_administrativo: { usuarios: residAdmin, roles: [] } };
      if (config) await config.update(valores, { transaction: t });
      else {
        const base = Object.fromEntries(COLUMNAS_SLOT.map((c) => [c, plantilla[c] ?? SLOT_VACIO()]));
        await m.AprobadorFrente.create({ frente_id: f.id, categoria: 'DIRECTA', ...base, ...valores }, { transaction: t });
      }
    }

    // 5) Alcance del Residente Administrativo: debe ver las solicitudes de sus frentes (antes solo las propias).
    log(`\nRol "${ROL.admin}": alcance de listado PROPIAS -> FRENTE`);
    if (APLICAR) await m.Rol.update({ alcance_solicitudes: 'FRENTE' }, { where: { nombre: ROL.admin }, transaction: t });

    // 6) Aviso: solicitudes Directas en curso en frentes que se quedan sin Director de Obra.
    const enCurso = await m.Solicitud.findAll({ where: { categoria: 'DIRECTA' }, attributes: ['consecutivo', 'estado', 'frentes_ids'], raw: true, transaction: t });
    const sinDirector = enCurso.filter((s) => !['COMPLETADA', 'ANULADA', 'BORRADOR'].includes(s.estado) && (s.frentes_ids ?? []).some((id) => !filaPorFrente[todosLosFrentes.find((f) => f.id === id)?.nombre]));
    if (sinDirector.length) log(`\nAVISO: ${sinDirector.length} solicitud(es) Directa en curso en frentes que quedan sin Director de Obra: ${sinDirector.map((s) => `${s.consecutivo} (${s.estado})`).join(', ')}`);

    if (APLICAR) { await t.commit(); log('\nListo: cambios aplicados.'); } else { await t.rollback(); log('\nSimulacro terminado: no se escribió nada. Usa --aplicar para aplicar.'); }
  } catch (e) {
    await t.rollback();
    throw e;
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
