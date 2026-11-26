// Cuadro comparativo de una solicitud DIRECTA como una sola cuadrícula tipo hoja de cálculo (paso "Valor y soporte" del
// formulario V2). Hay UN solo contratista (no se comparan proveedores): se compara lo pendiente por consumir
// (presupuesto) contra la cantidad real que se necesita y el precio que ofrece el contratista.
//
// Mismo contrato que CuadroComparativoBuilder.jsx (`value = { proveedores, items }`, `onChange`, sin fetch propio): el
// formulario sigue guardando con guardarCuadroComparativo y el backend no cambia. El valor ofertado de cada ítem vive en
// `item.precios[clientId]` del único proveedor, igual que en el Builder. Los totales NUNCA se guardan: se calculan acá
// con las mismas funciones del Builder (calcularTotalesProveedor), así el costo total que usa el formulario y el que se
// ve acá son el mismo número.
//
// Rendimiento: cada fila es un React.memo (cambia solo la fila editada); los handlers son estables (leen el último
// `value` de una ref) y la navegación por teclado/pegado se delega en el <tbody> con data-row/data-col.
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardPaste, FileUp, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { FileField } from '../../components/ui/FileField.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { CAMPOS_AIU, calcularTotalesProveedor } from './CuadroComparativoBuilder.jsx';
import {
  COLUMNAS,
  UNIDADES,
  aplicarMatriz,
  calcularFila,
  esNum,
  faltantesCuadro,
  filaEmpezada,
  formatMoney,
  formatNum,
  getValor,
  limpiarMatrizPegada,
  parseNum,
  parseTSV,
  setValor,
  totalesCuadro,
} from '../../utils/cuadroComparativo.js';
import s from './CuadroComparativoGrid.module.css';
import fileStyles from '../../components/ui/FileField.module.css';

const AIU_POR_DEFECTO = { administracionPct: 5, imprevistoPct: 5, utilidadPct: 5, ivaUtilidadPct: 19 };
const AIU_EN_CERO = { administracionPct: 0, imprevistoPct: 0, utilidadPct: 0, ivaUtilidadPct: 0 };
const ACCEPT_COTIZACION = 'image/*,.pdf,.xls,.xlsx,.doc,.docx';
const ULTIMA_COLUMNA = COLUMNAS.length - 1;
const EJEMPLO = [
  '2520\t214010\tMuro en bloque No. 5\tIncluye mortero de pega\tM2\t120\t58.000\t140\t61.000',
  '2533\t214055\tPañete liso muros\tInterior, espesor 2 cm\tM2\t300\t24.500\t320\t26.000',
  '2610\t215300\tInstalación hidráulica\tPuntos de agua fría y caliente\tUNIDAD\t18\t185.000\t20\t198.000',
].join('\n');

let secuencia = 0;
const nuevaClave = () => `k${++secuencia}`;

function itemVacio() {
  return { _k: nuevaClave(), codigoItem: '', codigoInsumo: '', actividad: '', alcance: '', unidad: 'UNIDAD', cantidad: '', cantidadReal: '', valorUnitarioPendiente: '', observaciones: '', precios: {} };
}

// Input numérico en formato colombiano: al enfocar selecciona todo, mientras se escribe muestra lo tecleado y al salir
// (blur) reformatea. Hacia arriba solo informa el número ya leído ('' si no hay).
function NumInput({ value, onCommit, className, ...resto }) {
  const [borrador, setBorrador] = useState(null);
  const num = esNum(value) ? Number(value) : null;
  useEffect(() => {
    // Un cambio externo (Ctrl+D, pegado) mientras la celda tiene el foco reemplaza lo tecleado.
    if (borrador !== null && parseNum(borrador) !== num) setBorrador(formatNum(num));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num]);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      value={borrador ?? formatNum(value)}
      onFocus={(e) => {
        const el = e.target;
        const alEnfocar = el.value;
        el.select();
        setBorrador(formatNum(value));
        // Con el clic algunos navegadores (Safari) sueltan la selección al terminar: se repite solo si no se ha tecleado nada.
        requestAnimationFrame(() => {
          if (el.value === alEnfocar) el.select();
        });
      }}
      onChange={(e) => {
        setBorrador(e.target.value);
        onCommit(parseNum(e.target.value) ?? '');
      }}
      onBlur={() => setBorrador(null)}
      {...resto}
    />
  );
}

// `ro` (solo lectura, detalle de la solicitud): mismas celdas y estilos, pero los campos no se editan, no hay borrar fila
// ni avisos de dato faltante.
const Fila = memo(function Fila({ it, idx, pid, abierta, acc, ro }) {
  const c = calcularFila(it, pid);
  const empezada = filaEmpezada(it, pid);
  const sobre = esNum(it.cantidadReal) && esNum(it.cantidad) && Number(it.cantidadReal) > Number(it.cantidad);
  const unidades = it.unidad && !UNIDADES.includes(it.unidad) ? [...UNIDADES, it.unidad] : UNIDADES;
  const aria = (col) => `${col.largo}, fila ${idx + 1}`;
  const falta = (col, vacio) => (!ro && empezada && vacio ? s.falta : '');

  const texto = (col, clase) => (
    <input
      className={clase}
      data-row={idx}
      data-col={COLUMNAS.indexOf(col)}
      value={it[col.campo] ?? ''}
      onChange={(e) => acc.update(idx, col, e.target.value)}
      readOnly={ro}
      placeholder={ro ? undefined : col.key === 'codItem' ? 'Sub cap.-ítem' : col.key === 'codInsumo' ? 'Cód. insumo' : col.key === 'actividad' ? 'Actividad o insumo' : 'Alcance'}
      aria-label={aria(col)}
      autoComplete="off"
    />
  );
  const numero = (col, extra = '') => (
    <NumInput
      className={`${s.num} ${extra}`}
      data-row={idx}
      data-col={COLUMNAS.indexOf(col)}
      value={getValor(it, col, pid)}
      onCommit={(v) => acc.update(idx, col, v)}
      readOnly={ro}
      aria-label={aria(col)}
    />
  );
  const [cCodItem, cCodInsumo, cActividad, cAlcance, cUnd, cPendCant, cPendVr, cCantReal, cVrOferta] = COLUMNAS;

  return (
    <>
      <tr className={s.item}>
        <td className={`${s.sticky} ${s.s0} ${s.rn}`}>{idx + 1}</td>
        <td className={`${s.sticky} ${s.s1}`}>
          <div className={s.stack}>
            {texto(cCodItem, s.main)}
            {texto(cCodInsumo, s.sub)}
          </div>
        </td>
        <td className={`${s.sticky} ${s.s2}`}>
          <div className={s.stack}>
            <input
              className={`${s.main} ${falta(cActividad, !String(it.actividad ?? '').trim())}`}
              data-row={idx}
              data-col={2}
              value={it.actividad ?? ''}
              onChange={(e) => acc.update(idx, cActividad, e.target.value)}
              readOnly={ro}
              placeholder={ro ? undefined : 'Actividad o insumo'}
              aria-label={aria(cActividad)}
              aria-required="true"
              autoComplete="off"
            />
            {texto(cAlcance, s.sub)}
          </div>
        </td>
        <td className={s.gs}>
          {ro ? (
            <input data-row={idx} data-col={4} value={it.unidad ?? ''} readOnly aria-label={aria(cUnd)} />
          ) : (
            <select data-row={idx} data-col={4} value={it.unidad ?? ''} onChange={(e) => acc.update(idx, cUnd, e.target.value)} aria-label={aria(cUnd)}>
              {!it.unidad && <option value="">—</option>}
              {unidades.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
        </td>
        <td>{numero(cPendCant)}</td>
        <td>{numero(cPendVr)}</td>
        <td><div className={s.calc}>{esNum(it.cantidad) && esNum(it.valorUnitarioPendiente) ? formatMoney(c.pend) : null}</div></td>
        <td className={s.gs}>
          {numero(cCantReal, falta(cCantReal, !esNum(it.cantidadReal)))}
          {sobre && (
            <div className={s.flag} title="La cantidad real supera lo pendiente por consumir">
              +{formatNum(Number(it.cantidadReal) - Number(it.cantidad))} sobre pend.
            </div>
          )}
        </td>
        <td><div className={s.calc}>{esNum(it.cantidadReal) && esNum(it.valorUnitarioPendiente) ? formatMoney(c.ppto) : null}</div></td>
        <td className={s.gs}>{numero(cVrOferta, falta(cVrOferta, !esNum(it.precios?.[pid])))}</td>
        <td><div className={s.calc}>{esNum(it.cantidadReal) && esNum(it.precios?.[pid]) ? formatMoney(c.oferta) : null}</div></td>
        <td className={`${s.acts} ${s.gs}`}>
          <button type="button" className={`${s.ib} ${abierta ? s.ibOn : ''}`} onClick={() => acc.toggleObs(it._k, abierta)} title="Observaciones" aria-label={`Observaciones de la fila ${idx + 1}`} aria-expanded={abierta}>
            <MessageSquare size={16} aria-hidden="true" />
          </button>
          {!ro && (
            <button type="button" className={`${s.ib} ${s.ibDel}`} onClick={() => acc.borrar(idx)} title="Eliminar fila" aria-label={`Eliminar la fila ${idx + 1}`}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className={s.obsRow}>
          <td colSpan={12}>
            <div className={s.obsWrap}>
              <label htmlFor={`obs-${it._k}`}>Observaciones</label>
              <input id={`obs-${it._k}`} className={s.obsInput} value={it.observaciones ?? ''} onChange={(e) => acc.setObs(idx, it._k, e.target.value)} readOnly={ro} placeholder={ro ? undefined : 'Notas sobre este ítem'} autoComplete="off" />
              {!ro && <button type="button" className={s.linkbtn} onClick={() => acc.obsATodos(idx)} title="Copia este texto en las observaciones de todos los ítems">Aplicar a todos</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

// `soloLectura` (2026-11-26, detalle de la solicitud: "debe verse de la misma forma que el formulario"): el mismo cuadro
// del formulario, sin editar nada -- no normaliza ni llama a `onChange`, oculta agregar/pegar/borrar y el panel "Estado
// del paso", y la cotización se muestra con un enlace (`urlCotizacion`) en vez del botón de subir.
export function CuadroComparativoGrid({ value, onChange, nombreProveedor = '', nitProveedor = '', contexto = {}, cotizacion, onCotizacionChange, errorCotizacion, sinAiu = false, soloLectura = false, urlCotizacion, children }) {
  const aiuBase = sinAiu ? AIU_EN_CERO : AIU_POR_DEFECTO;
  const proveedor = value.proveedores?.[0] ?? null;
  const pid = proveedor?.clientId ?? '';
  // En solo lectura los ítems llegan sin clave `_k` (no se normalizan): se les da una estable para las observaciones.
  const items = useMemo(() => (soloLectura ? (value.items ?? []).map((it, i) => (it._k ? it : { ...it, _k: `r${it.id ?? i}` })) : value.items ?? []), [value.items, soloLectura]);
  const idBase = useId();

  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  const pidRef = useRef(pid);
  pidRef.current = pid;

  const rootRef = useRef(null);
  const focoPendiente = useRef(null);
  const [obsMapa, setObsMapa] = useState({});
  const [modalAbierto, setModalAbierto] = useState(false);
  const [textoPegado, setTextoPegado] = useState('');
  const [aviso, setAviso] = useState('');
  const avisoT = useRef(null);

  function mostrarAviso(t) {
    setAviso(t);
    clearTimeout(avisoT.current);
    avisoT.current = setTimeout(() => setAviso(''), 2600);
  }
  useEffect(() => () => clearTimeout(avisoT.current), []);

  // Siempre exactamente un proveedor (el contratista del paso 1, con los porcentajes A.I.U. por defecto si es nuevo), al
  // menos una fila y una clave estable por fila. Todo en una sola actualización para no pisar al resto.
  const necesitaNormalizar = !soloLectura && (!proveedor || proveedor.nombre !== nombreProveedor || proveedor.seleccionado !== true || value.proveedores.length !== 1 || items.length === 0 || items.some((it) => !it._k));
  useEffect(() => {
    if (!necesitaNormalizar) return;
    const v = valueRef.current;
    const base = v.proveedores?.find((p) => p.seleccionado) ?? v.proveedores?.[0] ?? { clientId: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`), ...aiuBase };
    const its = (v.items ?? []).map((it) => (it._k ? it : { ...it, _k: nuevaClave() }));
    onChangeRef.current({ ...v, proveedores: [{ ...base, nombre: nombreProveedor, seleccionado: true }], items: its.length ? its : [itemVacio()] });
  }, [necesitaNormalizar, nombreProveedor]);

  // Transporte no lleva A.I.U.: los porcentajes se guardan en 0 (así el valor final, el detalle y el PDF coinciden). Al
  // pasar a otro tipo se restauran los de defecto; el efecto solo corre cuando cambia `sinAiu`, no pisa lo editado luego.
  const sinAiuPrevio = useRef(sinAiu);
  useEffect(() => {
    if (soloLectura) return;
    const v = valueRef.current;
    const p = v.proveedores?.[0];
    if (!p) return;
    const cambio = sinAiuPrevio.current !== sinAiu;
    sinAiuPrevio.current = sinAiu;
    const objetivo = sinAiu ? AIU_EN_CERO : cambio ? AIU_POR_DEFECTO : null;
    if (!objetivo || CAMPOS_AIU.every(([c]) => Number(p[c] ?? 0) === objetivo[c])) return;
    onChangeRef.current({ ...v, proveedores: v.proveedores.map((x, i) => (i === 0 ? { ...x, ...objetivo } : x)) });
  }, [sinAiu, proveedor?.clientId]);

  const focusCell = useCallback((fila, col) => {
    const el = rootRef.current?.querySelector(`[data-row="${fila}"][data-col="${col}"]`);
    if (!el) return;
    el.focus();
    if (el.tagName === 'INPUT' && el.select) el.select();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  // Enfoca después del render que creó la fila / abrió las observaciones.
  useEffect(() => {
    const f = focoPendiente.current;
    if (!f) return;
    focoPendiente.current = null;
    if (f.obs) document.getElementById(`obs-${f.obs}`)?.focus();
    else focusCell(f.fila, f.col);
  });

  const acc = useMemo(() => {
    const setItems = (fn) => onChangeRef.current({ ...valueRef.current, items: fn(valueRef.current.items ?? []) });
    return {
      update: (idx, col, valor) => setItems((its) => its.map((it, i) => (i === idx ? setValor(it, col, pidRef.current, valor) : it))),
      toggleObs: (k, abierta) => {
        setObsMapa((m) => ({ ...m, [k]: !abierta }));
        if (!abierta) focoPendiente.current = { obs: k };
      },
      setObs: (idx, k, texto) => {
        setObsMapa((m) => (m[k] === undefined ? { ...m, [k]: true } : m));
        setItems((its) => its.map((it, i) => (i === idx ? { ...it, observaciones: texto } : it)));
      },
      obsATodos: (idx) => {
        const texto = valueRef.current.items[idx]?.observaciones ?? '';
        setItems((its) => its.map((it) => ({ ...it, observaciones: texto })));
        setObsMapa((m) => ({ ...m, ...Object.fromEntries(valueRef.current.items.map((it) => [it._k, true])) }));
        mostrarAviso(`Observación aplicada a ${valueRef.current.items.length} ítems`);
      },
      borrar: (idx) => setItems((its) => (its.length <= 1 ? [itemVacio()] : its.filter((_, i) => i !== idx))),
    };
  }, []);

  const agregarFila = useCallback((col = 0) => {
    const fila = (valueRef.current.items ?? []).length;
    focoPendiente.current = { fila, col };
    onChangeRef.current({ ...valueRef.current, items: [...(valueRef.current.items ?? []), itemVacio()] });
  }, []);

  function setPct(campo, v) {
    onChangeRef.current({ ...valueRef.current, proveedores: valueRef.current.proveedores.map((p, i) => (i === 0 ? { ...p, [campo]: v } : p)) });
  }

  function irA(fila, col, crear) {
    const n = (valueRef.current.items ?? []).length;
    if (fila < 0) return;
    if (fila >= n) {
      if (crear) agregarFila(col);
      return;
    }
    focusCell(fila, col);
  }

  function onKeyDown(e) {
    const t = e.target;
    if (t.dataset?.col === undefined) return;
    const fila = Number(t.dataset.row);
    const c = Number(t.dataset.col);
    const esSelect = t.tagName === 'SELECT';
    const n = (valueRef.current.items ?? []).length;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      irA(fila + 1, c, true);
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      irA(fila - 1, c, false);
    } else if (e.key === 'ArrowDown' && !esSelect) {
      e.preventDefault();
      irA(fila + 1, c, false);
    } else if (e.key === 'ArrowUp' && !esSelect) {
      e.preventDefault();
      irA(fila - 1, c, false);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (fila > 0) {
        const col = COLUMNAS[c];
        acc.update(fila, col, getValor(valueRef.current.items[fila - 1], col, pidRef.current));
      }
    } else if (e.key === 'Tab' && !e.shiftKey && c === ULTIMA_COLUMNA && fila === n - 1) {
      e.preventDefault();
      agregarFila(0);
    }
  }

  // Pegar desde Excel sobre cualquier celda: varias celdas (tabs / saltos de línea) se reparten desde esa celda hacia la
  // derecha y hacia abajo, creando filas si hace falta. Una sola celda se pega normal.
  function onPaste(e) {
    const t = e.target;
    if (t.dataset?.col === undefined) return;
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(txt.replace(/\n+$/, ''))) return;
    e.preventDefault();
    const matriz = parseTSV(txt);
    const desde = Number(t.dataset.row);
    const antes = valueRef.current.items.length;
    onChangeRef.current({ ...valueRef.current, items: aplicarMatriz(valueRef.current.items, desde, Number(t.dataset.col), matriz, pidRef.current, itemVacio) });
    mostrarAviso(`Pegadas ${matriz.length} ${matriz.length === 1 ? 'fila' : 'filas'}${desde + matriz.length > antes ? ' (se crearon filas nuevas)' : ''}`);
  }

  const matrizModal = useMemo(() => (textoPegado.trim() ? limpiarMatrizPegada(parseTSV(textoPegado)) : []), [textoPegado]);

  function agregarDesdeModal() {
    if (!matrizModal.length) return;
    const base = (valueRef.current.items ?? []).filter((it) => filaEmpezada(it, pidRef.current));
    onChangeRef.current({ ...valueRef.current, items: aplicarMatriz(base, base.length, 0, matrizModal, pidRef.current, itemVacio) });
    setModalAbierto(false);
    setTextoPegado('');
    mostrarAviso(`Agregadas ${matrizModal.length} ${matrizModal.length === 1 ? 'fila' : 'filas'}`);
  }

  const totales = useMemo(() => totalesCuadro(items, pid), [items, pid]);
  const costos = useMemo(() => calcularTotalesProveedor(items, { clientId: pid, ...aiuBase, ...(proveedor ?? {}), ...(sinAiu ? AIU_EN_CERO : {}) }), [items, pid, proveedor, aiuBase, sinAiu]);
  const faltas = useMemo(() => faltantesCuadro(items, pid), [items, pid]);
  const conDatos = useMemo(() => items.filter((it) => filaEmpezada(it, pid)).length, [items, pid]);

  const dif = totales.diferencia;
  const clasDif = dif > 0 ? s.chipMal : dif < 0 ? s.chipBien : s.chipNeutro;
  const signo = dif > 0 ? '+' : dif < 0 ? '-' : '';
  const difPct = totales.diferenciaPct != null ? ` (${signo}${formatNum(Math.abs(totales.diferenciaPct), 1)}%)` : '';

  return (
    <div id="sec-cuadro" ref={rootRef} className={s.root}>
      <div className={s.kpiWrap}>
        <div className={s.kpis} aria-live="polite">
          <div className={s.kpi}>
            <div className={s.kpiL}>Pendiente por consumir</div>
            <div className={s.kpiV}>{formatMoney(totales.pend)}</div>
            <div className={s.kpiS}>Cant. pendiente × valor del presupuesto</div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiL}>Requerido a precio ppto.</div>
            <div className={s.kpiV}>{formatMoney(totales.ppto)}</div>
            <div className={s.kpiS}>Cant. real × valor del presupuesto</div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiL}>Oferta del contratista</div>
            <div className={s.kpiV}>{formatMoney(totales.oferta)}</div>
            <div className={s.kpiS}>
              {totales.comparables > 0 && (dif === 0 ? <span className={`${s.chip} ${s.chipNeutro}`}>Igual al presupuesto</span> : <span className={`${s.chip} ${clasDif}`}>{signo}{formatMoney(Math.abs(dif))}{difPct} vs. ppto.</span>)}
            </div>
          </div>
          <div className={`${s.kpi} ${s.kpiMain}`}>
            <div className={s.kpiL}>Costo total</div>
            <div className={s.kpiV}>{formatMoney(costos.costoTotal)}</div>
            <div className={s.kpiS}>{sinAiu ? 'A.I.U. e IVA sobre utilidad no aplican en Transporte' : 'Con A.I.U. e IVA sobre utilidad'}</div>
          </div>
        </div>
      </div>

      <section className={s.card} aria-label="Cotización y cuadro comparativo">
        <div className={s.ctx}>
          <div><div className={s.ctxL}>Proyecto</div><div className={s.ctxV}>{contexto.proyecto || '—'}</div></div>
          <div><div className={s.ctxL}>Tipo de contrato</div><div className={s.ctxV}>{contexto.tipoContrato || '—'}</div></div>
          <div className={s.ctxObjeto}><div className={s.ctxL}>Objeto</div><p className={s.ctxTexto}>{contexto.objeto || '—'}</p></div>
        </div>

        <div id="sec-docs" className={s.docrow}>
          <div className={`${s.cotizacion} ${cotizacion || soloLectura ? '' : s.cotizacionVacia}`}>
            {soloLectura ? (
              <Field label="Cotización">
                {() => (
                  <div className={`${fileStyles.control} ${cotizacion ? fileStyles.controlFilled : ''}`}>
                    <FileUp size={16} strokeWidth={1.75} className={cotizacion ? fileStyles.iconFilled : fileStyles.icon} aria-hidden="true" />
                    <span className={fileStyles.filename}>{cotizacion ? 'Archivo cargado' : 'Sin archivo'}</span>
                    {cotizacion && urlCotizacion && (
                      <a className={fileStyles.selectLabel} href={urlCotizacion} target="_blank" rel="noreferrer">
                        <span className={fileStyles.selectText}>Ver</span>
                      </a>
                    )}
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Cotización" required error={errorCotizacion} helper="Imagen, PDF, Excel o Word">
                {(p) => <FileField {...p} accept={ACCEPT_COTIZACION} value={cotizacion} onChange={onCotizacionChange} />}
              </Field>
            )}
          </div>
          <div className={s.contratista}>
            Contratista
            <b>{nombreProveedor || 'Sin seleccionar (paso 1)'}</b>
            {nitProveedor ? `NIT ${nitProveedor}` : nombreProveedor ? 'NIT sin información' : ''}
          </div>
        </div>

        <div className={s.toolbar}>
          <div className={s.tl}>
            <h2 className={s.h2}>Ítems a comparar</h2>
            <span className={s.legend} aria-hidden="true">
              {!soloLectura && <span><i className={`${s.sw} ${s.swEdit}`} />Editable</span>}
              <span><i className={`${s.sw} ${s.swCalc}`} />Calculado</span>
            </span>
            <span className={s.aviso} role="status">{aviso}</span>
          </div>
          {!soloLectura && (
            <div className={s.tr}>
              <button type="button" className={s.btn} onClick={() => setModalAbierto(true)}><ClipboardPaste size={16} aria-hidden="true" />Pegar desde Excel</button>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => agregarFila(0)}><Plus size={16} aria-hidden="true" />Agregar ítem</button>
            </div>
          )}
        </div>

        <div className={s.gridwrap}>
          <table className={s.grid} aria-label="Ítems a comparar">
            <colgroup>
              <col style={{ width: 40 }} /><col style={{ width: 104 }} /><col style={{ width: 248 }} /><col style={{ width: 112 }} /><col style={{ width: 84 }} /><col style={{ width: 104 }} />
              <col style={{ width: 104 }} /><col style={{ width: 92 }} /><col style={{ width: 104 }} /><col style={{ width: 108 }} /><col style={{ width: 112 }} /><col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr className={s.grp}>
                <th className={`${s.sticky} ${s.edge}`} colSpan={3} style={{ left: 0 }}>Ítem</th>
                <th className={`${s.gPend} ${s.gs}`} colSpan={4}>Pendiente por consumir</th>
                <th className={`${s.gReq} ${s.gs}`} colSpan={2}>Requerido</th>
                <th className={`${s.gOfe} ${s.gs}`} colSpan={2}>Oferta del contratista</th>
                <th className={s.gs} />
              </tr>
              <tr>
                <th className={`${s.sticky} ${s.s0}`}>#</th>
                <th className={`${s.sticky} ${s.s1}`} title="Código sub capítulo - ítem presupuestal / código de insumo">Códigos</th>
                <th className={`${s.sticky} ${s.s2}`}>Actividad y alcance</th>
                <th className={s.gs}>Und.</th>
                <th className={s.r}>Cant.</th>
                <th className={s.r}>Vr. unit.</th>
                <th className={s.r}>Total</th>
                <th className={`${s.r} ${s.gs}`}>Cant. real</th>
                <th className={s.r}>Total ppto.</th>
                <th className={`${s.r} ${s.gs}`}>Vr. unit.</th>
                <th className={s.r}>Total</th>
                <th className={s.gs} />
              </tr>
            </thead>
            <tbody onKeyDown={soloLectura ? undefined : onKeyDown} onPaste={soloLectura ? undefined : onPaste}>
              {items.map((it, idx) => (
                <Fila key={it._k ?? `i${idx}`} it={it} idx={idx} pid={pid} abierta={obsMapa[it._k] ?? Boolean(it.observaciones)} acc={acc} ro={soloLectura} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${s.sticky} ${s.s0} ${s.tfootCell}`} colSpan={2}>TOTAL</td>
                <td className={`${s.sticky} ${s.s2} ${s.tfootCell}`} />
                <td colSpan={3} />
                <td className={s.tot}>{formatMoney(totales.pend)}</td>
                <td />
                <td className={s.tot}>{formatMoney(totales.ppto)}</td>
                <td />
                <td className={s.tot}>{formatMoney(totales.oferta)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {!soloLectura && <button type="button" className={s.addrow} onClick={() => agregarFila(0)}><Plus size={16} aria-hidden="true" />Agregar ítem</button>}
        {children}
      </section>

      <div className={s.bottom}>
        {/* En solo lectura no hay "Estado del paso" (es la guía para llenar el formulario): queda la celda vacía para que
            "Costo total de la oferta" conserve su lugar a la derecha. */}
        {soloLectura ? <div aria-hidden="true" /> : (
        <section className={`${s.card} ${s.panel}`} aria-label="Estado del paso">
          <h3>Estado del paso</h3>
          <ul className={s.status}>
            <li className={cotizacion ? s.stOk : s.stWarn}><span className={s.ic}>{cotizacion ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}</span>{cotizacion ? 'Cotización adjunta' : 'Falta adjuntar la cotización'}</li>
            <li className={conDatos ? s.stOk : s.stWarn}><span className={s.ic}>{conDatos ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}</span>{conDatos} {conDatos === 1 ? 'ítem con datos' : 'ítems con datos'}</li>
            {faltas.slice(0, 6).map((m) => (
              <li key={`${m.fila}-${m.campo}`} className={s.stWarn}>
                <span className={s.ic}><AlertTriangle size={12} aria-hidden="true" /></span>
                <button type="button" onClick={() => focusCell(m.fila, COLUMNAS.findIndex((c) => c.key === m.campo))}>{m.texto}</button>
              </li>
            ))}
            {faltas.length > 6 && <li className={s.stWarn}><span className={s.ic}>+</span>y {faltas.length - 6} más</li>}
            {cotizacion && conDatos > 0 && faltas.length === 0 && <li className={s.stOk}><span className={s.ic}><Check size={12} aria-hidden="true" /></span>Todo listo para continuar</li>}
          </ul>
        </section>
        )}

        <section className={`${s.card} ${s.panel}`} aria-label="Costo total de la oferta">
          <h3>Costo total de la oferta</h3>
          {sinAiu && <p className={s.sub}>A.I.U. e IVA sobre utilidad no aplican porque el tipo de contrato es Transporte.</p>}
          <table className={s.aiu}>
            <tbody>
              <tr><td>Subtotal oferta</td><td className={s.p} /><td>{formatMoney(costos.subtotal)}</td></tr>
              {sinAiu ? (
                <>
                  <tr className={s.noAplica}><td>A.I.U.</td><td className={s.p} /><td>No aplica</td></tr>
                  <tr className={s.noAplica}><td>IVA sobre utilidad</td><td className={s.p} /><td>No aplica</td></tr>
                </>
              ) : (
                CAMPOS_AIU.map(([campoPct, campoValor, etiqueta]) => (
                  <tr key={campoPct}>
                    <td>{etiqueta}</td>
                    <td className={s.p}>
                      <NumInput className={s.pct} value={proveedor?.[campoPct] ?? AIU_POR_DEFECTO[campoPct]} onCommit={(v) => setPct(campoPct, v)} readOnly={soloLectura} aria-label={`Porcentaje de ${etiqueta.toLowerCase()}`} id={`${idBase}-${campoPct}`} /> %
                    </td>
                    <td>{formatMoney(costos[campoValor])}</td>
                  </tr>
                ))
              )}
              <tr className={s.totalFila}><td>Costo total</td><td className={s.p} /><td>{formatMoney(costos.costoTotal)}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Pegar desde Excel"
        footer={
          <>
            <button type="button" className={s.linkbtn} onClick={() => setTextoPegado(EJEMPLO)}>Cargar ejemplo</button>
            <span className={s.modalCuenta} role="status">{matrizModal.length ? `${matrizModal.length} ${matrizModal.length === 1 ? 'fila detectada' : 'filas detectadas'}` : ''}</span>
            <Button type="button" variant="secondary" onClick={() => setModalAbierto(false)}>Cancelar</Button>
            <Button type="button" onClick={agregarDesdeModal} disabled={!matrizModal.length}>Agregar filas</Button>
          </>
        }
      >
        <p className={s.modalTexto}>Copia las filas en Excel y pégalas aquí. Las columnas deben ir en este orden:</p>
        <ol className={s.cols}>
          {COLUMNAS.map((c) => (
            <li key={c.key}>{c.etiqueta}</li>
          ))}
        </ol>
        <textarea className={s.modalArea} value={textoPegado} onChange={(e) => setTextoPegado(e.target.value)} aria-label="Filas copiadas de Excel" placeholder="Pega aquí (Ctrl+V)…" />
      </Modal>
    </div>
  );
}
