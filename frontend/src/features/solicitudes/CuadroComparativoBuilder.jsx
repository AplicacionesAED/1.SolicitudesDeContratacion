// Reemplaza al viejo "Cuadro Comparativo" (un archivo .xlsx/.pdf adjunto,
// ver CLAUDE.md 2026-09-09) -- acá se captura la comparación real: ítems
// presupuestales x proveedores/cotizaciones, con AIU (Administración/
// Imprevisto/Utilidad) + IVA sobre utilidad por proveedor para llegar a un
// costo total comparable. Mismo contrato de componente controlado que
// CronogramaBuilder.jsx (`{value, onChange}`, sin fetch/save propio -- el
// padre persiste vía guardarCuadroComparativo).
//
// 2026-09-09, segunda vuelta -- pedido explícito del usuario ("una tabla
// puede ser muy ancha"): en vez de UNA tabla con 2 columnas por proveedor
// (crece sin límite con cada proveedor agregado), la UI se separó en tres
// piezas que no dependen del número de proveedores para el ancho:
//   1. Una tabla de ÍTEMS (fija, sin columnas de precio) -- se edita una
//      sola vez, sin importar cuántos proveedores se comparen.
//   2. Tarjetas de comparación (una por proveedor, en fila/wrap) con el
//      Costo Total de cada uno lado a lado -- la vista rápida para decidir.
//   3. Pestañas por proveedor (mismo patrón "horizontal underline tabs"
//      que FrenteDetallePage.jsx#categoriaTab) -- cada pestaña edita SOLO
//      el precio unitario de ESE proveedor por ítem + su AIU/IVA, sin
//      repetir la descripción del ítem (ya está arriba, en la tabla fija).
//
// `valorTotal` por ítem/proveedor y los totales (subtotal, +AIU, +IVA, costo
// total) NUNCA se guardan -- se calculan acá mismo en cada render, mismo
// criterio que valorEnLetras en SolicitudForm.jsx (el backend solo guarda
// los datos crudos: cantidad, precios unitarios, porcentajes).
//
// Cada proveedor usa un `clientId` (string) como identidad estable durante
// la edición -- uno ya guardado normaliza `clientId: String(id)` al cargar
// (ver `normalizarCuadroComparativo`), uno nuevo usa `crypto.randomUUID()`.
// `item.precios` es un mapa `{ [clientId]: valorUnitario }` -- el backend
// remapea esas keys a los ids reales que crea al guardar
// (cuadroComparativo.js#upsertCuadroComparativo), así que acá nunca hace
// falta distinguir "proveedor nuevo" de "proveedor ya guardado".
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatearMiles, soloDigitos } from '../../utils/solicitudes.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import styles from './Solicitudes.module.css';

function nuevoClientId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyProveedor() {
  return { clientId: nuevoClientId(), nombre: '', seleccionado: false, administracionPct: 0, imprevistoPct: 0, utilidadPct: 0, ivaUtilidadPct: 0 };
}

function emptyItem() {
  // "La cantidad deben ser independiente" -- `cantidad` ("Pendiente por
  // consumir", tabla de arriba) y `cantidadReal` ("Cantidades reales",
  // tabla de abajo) son 2 campos DISTINTOS, ninguno se deriva del otro.
  // `valorUnitarioPendiente` ("VR. Unit" de Pendiente por consumir) es el
  // único precio nuevo que se guarda -- ver calcularValorTotalPendiente/
  // calcularValorTotalSegunPpto más abajo.
  return { codigoItem: '', codigoInsumo: '', actividad: '', alcance: '', unidad: '', cantidad: '', cantidadReal: '', valorUnitarioPendiente: '', observaciones: '', precios: {} };
}

// Unidades más comunes en un cuadro comparativo de obra/servicios -- el
// valor guardado sigue siendo texto libre (columna STRING), esto es solo un
// desplegable de conveniencia. Si un ítem ya tenía un valor que no está en
// esta lista (un dato viejo, o "UNIDAD" tal cual venía en la hoja Excel
// real), se agrega como primera opción para no perderlo/blanquearlo -- ver
// su uso en la celda de Unidad más abajo.
const UNIDADES_COMUNES = ['UND', 'GLB', 'ML', 'M2', 'M3', 'KG', 'TON', 'HR', 'DÍA', 'MES', 'PAR', 'JGO', 'VJE'];

// Normaliza lo que llega del backend (proveedores con `id` real, sin
// `clientId`) para que el resto del componente pueda tratar TODOS los
// proveedores igual -- ver el comentario grande de arriba. Se usa una sola
// vez al construir el estado inicial en SolicitudForm.jsx.
export function normalizarCuadroComparativo(cuadroComparativo) {
  if (!cuadroComparativo) return { proveedores: [], items: [] };
  const proveedores = (cuadroComparativo.proveedores ?? []).map((p) => ({ ...p, clientId: p.clientId ?? String(p.id) }));
  const items = (cuadroComparativo.items ?? []).map((it) => ({ ...it, precios: { ...(it.precios ?? {}) } }));
  return { proveedores, items };
}

// 2026-10-20: el borde/fondo ya NO van acá -- pasaron a la clase
// `styles.celdaInput` (Solicitudes.module.css), que sí puede tener
// `:hover`/`:focus` (un `style` inline no puede). `inputCellStyle()` se
// queda solo con el resto del box model puntual de cada celda.
function inputCellStyle(extra) {
  return { width: '100%', font: 'inherit', ...extra };
}

// Celda de texto largo (Actividad/Alcance/Observaciones) -- pedido explícito
// del usuario: "no me gusta que crezca a la derecha, la idea es que crezca
// hacia abajo". Un <input> de una sola línea desborda hacia el lado; esto es
// un <textarea> que crece de alto en vez de eso -- ver `.growWrap` en
// Solicitudes.module.css para el truco CSS-only (grid + ::after replicado,
// sin JS de medición). Exportada -- MemoriaBuilder.jsx la reusa tal cual
// para su columna de tipo TEXTO, misma necesidad exacta.
export function CeldaTextoLargo({ value, onChange, placeholder }) {
  return (
    <div className={styles.growWrap} data-replicated-value={value}>
      <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={1} />
    </div>
  );
}

// Única fuente de verdad para el cálculo de totales -- usada acá mismo (modo
// edición) Y en SolicitudDetallePage.jsx (modo solo lectura), para que las
// dos vistas nunca puedan mostrar un número distinto para lo mismo.
//
// Usa `cantidadReal` ("Cantidades reales"), NUNCA `cantidad` ("Pendiente
// por consumir") -- pedido explícito del usuario: "el valor total que se
// calcula del proveedor debe ser con la cantidad de cantidades reales, que
// es la cantidad que se va a comprar o contratar". `cantidad` (pendiente
// por consumir/inventario) no participa en absoluto de este cálculo.
export function calcularValorTotalItem(item, clientId) {
  const cantidad = Number(item.cantidadReal) || 0;
  const unitario = Number(item.precios?.[clientId]) || 0;
  return cantidad * unitario;
}

// "V. Total" de Pendiente por consumir -- fiel a la hoja Excel real
// (Cantidad × VR. Unit de esa misma sección). Nunca se guarda.
export function calcularValorTotalPendiente(item) {
  return (Number(item.cantidad) || 0) * (Number(item.valorUnitarioPendiente) || 0);
}

// "V. Total según PPTO" de Cantidades reales -- fiel a la hoja Excel
// real: reutiliza el MISMO "VR. Unit" presupuestado de Pendiente por
// consumir (Cantidades reales no tiene su propio precio unitario), pero
// multiplicado por la cantidad REAL (la que se va a comprar/contratar).
// Nunca se guarda.
export function calcularValorTotalSegunPpto(item) {
  return (Number(item.cantidadReal) || 0) * (Number(item.valorUnitarioPendiente) || 0);
}

// Totales de las 2 tablas de ítems (pedido explícito del usuario,
// 2026-09-21) -- "Pendiente por consumir" (Cantidad + V. Total) y
// "Cantidades reales" (Cantidad + V. Total según PPTO). Exportadas para que
// SolicitudDetallePage.jsx (modo solo lectura) muestre exactamente el mismo
// número, nunca uno recalculado aparte.
export function calcularTotalCantidadPendiente(items) {
  return items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
}

export function calcularTotalValorPendiente(items) {
  return items.reduce((acc, it) => acc + calcularValorTotalPendiente(it), 0);
}

export function calcularTotalCantidadReal(items) {
  return items.reduce((acc, it) => acc + (Number(it.cantidadReal) || 0), 0);
}

export function calcularTotalValorSegunPpto(items) {
  return items.reduce((acc, it) => acc + calcularValorTotalSegunPpto(it), 0);
}

export function calcularTotalesProveedor(items, proveedor) {
  const subtotal = items.reduce((acc, it) => acc + calcularValorTotalItem(it, proveedor.clientId), 0);
  const administracion = subtotal * ((Number(proveedor.administracionPct) || 0) / 100);
  const imprevisto = subtotal * ((Number(proveedor.imprevistoPct) || 0) / 100);
  const utilidad = subtotal * ((Number(proveedor.utilidadPct) || 0) / 100);
  const ivaUtilidad = utilidad * ((Number(proveedor.ivaUtilidadPct) || 0) / 100);
  const costoTotal = subtotal + administracion + imprevisto + utilidad + ivaUtilidad;
  return { subtotal, administracion, imprevisto, utilidad, ivaUtilidad, costoTotal };
}

// Exportado -- SolicitudDetallePage.jsx (modo solo lectura) lo reusa tal
// cual para mostrar los mismos 4 campos (% + su valor calculado) que el
// editor, en vez de repetir la lista a mano y arriesgarse a que las dos
// vistas queden desalineadas si se agrega un campo de AIU más adelante.
export const CAMPOS_AIU = [
  ['administracionPct', 'administracion', 'Administración'],
  ['imprevistoPct', 'imprevisto', 'Imprevisto'],
  ['utilidadPct', 'utilidad', 'Utilidad'],
  ['ivaUtilidadPct', 'ivaUtilidad', 'IVA sobre utilidad'],
];

function tabButtonStyle(activo) {
  return {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 4px',
    fontSize: 'var(--text-body-size)',
    fontWeight: activo ? 600 : 400,
    color: activo ? 'var(--color-primary)' : 'var(--color-ink-muted)',
    borderBottom: activo ? '2px solid var(--color-primary)' : '2px solid transparent',
    marginBottom: -1,
    whiteSpace: 'nowrap',
  };
}

// `proveedorUnico`/`nombreProveedorUnico` -- pedido explícito del usuario:
// "en el cuadro comparativo [de Directos] no se puede agregar más de un
// proveedor, debe ser uno y debe ser el tercero que se seleccione... que se
// coloque automáticamente". `SolicitudForm.jsx` pasa `proveedorUnico={true}`
// + `nombreProveedorUnico={terceroSeleccionado?.razonSocial}` cuando
// `categoriaEfectiva === 'DIRECTA'` -- en Indirecta el componente sigue
// exactamente igual (múltiples proveedores, nombre editable a mano).
export function CuadroComparativoBuilder({ value, onChange, proveedorUnico = false, nombreProveedorUnico = '' }) {
  const proveedores = value.proveedores ?? [];
  const items = value.items ?? [];
  const [tabPedido, setTabPedido] = useState(null);
  // Si el proveedor pedido ya no existe (se quitó) o todavía no se eligió
  // ninguno, cae al primero de la lista -- sin useEffect, se resuelve solo
  // en cada render.
  const tabActivo = proveedores.some((p) => p.clientId === tabPedido) ? tabPedido : proveedores[0]?.clientId ?? null;
  const proveedorActivo = proveedorUnico ? proveedores[0] ?? null : proveedores.find((p) => p.clientId === tabActivo) ?? null;

  // Garantiza que en modo `proveedorUnico` SIEMPRE haya EXACTAMENTE un
  // proveedor, con el nombre sincronizado al Tercero elegido como
  // contratista -- nunca lo edita el usuario a mano (no hay "Agregar
  // proveedor"/"Nombre del proveedor" en este modo, ver el render más
  // abajo). Si ya existían varios (dato viejo, o un cambio de categoría) se
  // colapsan a uno solo -- el marcado `seleccionado`, o si no el primero --
  // preservando su `clientId`/AIU para no romper los precios ya cargados en
  // `items.precios`.
  useEffect(() => {
    if (!proveedorUnico) return;
    const yaListo = proveedores.length === 1 && proveedores[0].nombre === nombreProveedorUnico && proveedores[0].seleccionado === true;
    if (yaListo) return;
    const base = proveedores.find((p) => p.seleccionado) ?? proveedores[0] ?? emptyProveedor();
    onChange({ ...value, proveedores: [{ ...base, nombre: nombreProveedorUnico, seleccionado: true }] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorUnico, nombreProveedorUnico, proveedores]);

  function setProveedores(next) {
    onChange({ ...value, proveedores: next });
  }

  function setItems(next) {
    onChange({ ...value, items: next });
  }

  function updateProveedor(clientId, campo, val) {
    setProveedores(proveedores.map((p) => (p.clientId === clientId ? { ...p, [campo]: val } : p)));
  }

  function seleccionarProveedor(clientId) {
    setProveedores(proveedores.map((p) => ({ ...p, seleccionado: p.clientId === clientId })));
  }

  function agregarProveedor() {
    const nuevo = emptyProveedor();
    setProveedores([...proveedores, nuevo]);
    setTabPedido(nuevo.clientId);
  }

  // OJO: `setProveedores`/`setItems` por separado NO sirve acá -- las dos
  // llaman a `onChange` con el mismo `value` (el de este render, ya
  // congelado en el closure), así que la segunda pisa a la primera con la
  // lista de proveedores SIN filtrar (bug real reportado: el proveedor no
  // desaparecía, solo se le vaciaban los precios). Un solo `onChange` con
  // las dos partes ya actualizadas evita la carrera.
  function quitarProveedor(clientId) {
    const nuevosItems = items.map((it) => {
      const { [clientId]: _quitado, ...resto } = it.precios ?? {};
      return { ...it, precios: resto };
    });
    onChange({ ...value, proveedores: proveedores.filter((p) => p.clientId !== clientId), items: nuevosItems });
  }

  function updateItem(idx, campo, val) {
    setItems(items.map((it, i) => (i === idx ? { ...it, [campo]: val } : it)));
  }

  function updatePrecio(idx, clientId, val) {
    setItems(items.map((it, i) => (i === idx ? { ...it, precios: { ...it.precios, [clientId]: val } } : it)));
  }

  function agregarItem() {
    setItems([...items, emptyItem()]);
  }

  function quitarItem(idx) {
    setItems(items.filter((_, i) => i !== idx));
  }

  return (
    <div className={styles.cuadro}>
      <div className={styles.cuadroLeyenda} aria-hidden="true">
        <span className={styles.leyendaItem}><span className={styles.leyendaMuestra} /> Campo editable</span>
        <span className={`${styles.leyendaItem}`}><span className={`${styles.leyendaMuestra} ${styles.leyendaMuestraRo}`} /> Calculado o solo lectura</span>
      </div>
      {/* 1. Ítems -- fijo, no crece con el número de proveedores. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <p style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, margin: 0 }}>Ítems a comparar</p>
        <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
          {/* `table-layout: fixed` es a propósito -- sin esto, un texto largo
              en Actividad/Observaciones "roba" ancho de las columnas cortas
              (Unidad/Cantidad) sin importar el `width` que se les declare
              (la tabla auto-layout solo los toma como sugerencia), y el
              desplegable de Unidad terminaba viéndose recortado en la
              práctica. Con layout fijo, cada columna respeta su % y el texto
              largo hace wrap en vez de empujar a las demás. */}
          <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '9%' }}>Código ítem</th>
                <th rowSpan={2} style={{ width: '8%' }}>Código insumo</th>
                <th colSpan={2}>Descripción de ítem</th>
                {/* "Pendiente por consumir" -- pedido explícito del usuario
                    (2026-09-09), fiel a la hoja Excel real: lo que esta
                    tabla captura es lo que TODAVÍA queda en inventario/
                    presupuesto sin consumir, no la cantidad realmente
                    ejecutada -- ESA vive en la segunda tabla de abajo (que
                    sigue diciendo "Cantidades reales", a propósito, para
                    diferenciarlas). Ganó VR. Unit/V. Total (2026-09-09,
                    "debo agregar tres columnas más") -- V. Total nunca se
                    guarda, se calcula (calcularValorTotalPendiente). */}
                <th colSpan={4}>Pendiente por consumir</th>
                <th rowSpan={2} style={{ width: '25%' }}>Observaciones</th>
                <th rowSpan={2} style={{ width: '4%' }}></th>
              </tr>
              <tr>
                <th style={{ width: '13%' }}>Actividad o insumo</th>
                <th style={{ width: '11%' }}>Alcance</th>
                <th style={{ width: '6%' }}>Unidad</th>
                <th style={{ width: '6%' }}>Cantidad</th>
                <th style={{ width: '9%' }}>VR. Unit</th>
                <th style={{ width: '9%' }}>V. Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td><CeldaTextoLargo value={it.codigoItem} onChange={(e) => updateItem(idx, 'codigoItem', e.target.value)} /></td>
                  <td><CeldaTextoLargo value={it.codigoInsumo} onChange={(e) => updateItem(idx, 'codigoInsumo', e.target.value)} /></td>
                  <td><CeldaTextoLargo value={it.actividad} onChange={(e) => updateItem(idx, 'actividad', e.target.value)} /></td>
                  <td><CeldaTextoLargo value={it.alcance} onChange={(e) => updateItem(idx, 'alcance', e.target.value)} /></td>
                  <td>
                    <select
                      className={`${styles.celdaInput} ${styles.celdaSelect}`}
                      value={it.unidad}
                      onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                      style={inputCellStyle({ minWidth: 0, padding: '2px 14px 2px 2px' })}
                    >
                      <option value="">Selecciona…</option>
                      {(it.unidad && !UNIDADES_COMUNES.includes(it.unidad) ? [it.unidad, ...UNIDADES_COMUNES] : UNIDADES_COMUNES).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" className={`${styles.celdaInput} ${styles.celdaNum}`} value={it.cantidad} onChange={(e) => updateItem(idx, 'cantidad', e.target.value)} style={inputCellStyle()} /></td>
                  <td>
                    {/* Dinero -- nunca type="number" (mismo motivo que
                        "Valor unitario" de la tabla de precios por
                        proveedor, más abajo). */}
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`${styles.celdaInput} ${styles.celdaNum}`}
                      value={formatearMiles(it.valorUnitarioPendiente)}
                      onChange={(e) => updateItem(idx, 'valorUnitarioPendiente', soloDigitos(e.target.value))}
                      style={inputCellStyle()}
                    />
                  </td>
                  <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalPendiente(it))}</td>
                  <td><CeldaTextoLargo value={it.observaciones} onChange={(e) => updateItem(idx, 'observaciones', e.target.value)} /></td>
                  <td>
                    <button type="button" className={styles.deleteRowButton} onClick={() => quitarItem(idx)} title="Quitar ítem" aria-label="Quitar ítem">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className={styles.emptyState}>Sin ítems todavía -- agrega al menos uno.</td>
                </tr>
              )}
              {items.length > 0 && (
                <tr style={{ fontWeight: 700, background: 'var(--color-surface-sunken)' }}>
                  <td colSpan={5}>TOTAL</td>
                  <td>{calcularTotalCantidadPendiente(items)}</td>
                  <td></td>
                  <td>{formatCurrency(calcularTotalValorPendiente(items))}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1b. Misma tabla de ítems, duplicada -- pedido explícito del
          usuario. Mismas filas que la tabla de arriba (es el MISMO array
          `items`, ningún estado propio) y mismos encabezados, pero sin
          repetir el título "Ítems a comparar" (queda solo en la de arriba,
          pedido explícito). El botón "Agregar ítem" también se movió acá
          abajo (pedido explícito) -- sigue siendo el único lugar para
          agregar/quitar filas, ninguna de las dos tablas gana un botón
          propio de "quitar" nuevo, el que ya tenía se mantiene. Todas las
          celdas son de solo lectura EXCEPTO Cantidad, que edita
          `items[idx].cantidadReal` -- "Cantidades reales", un campo
          INDEPENDIENTE de `items[idx].cantidad` ("Pendiente por consumir",
          tabla de arriba) -- pedido explícito del usuario tras la primera
          versión ("la cantidad deben ser independiente"): editar una NO
          afecta a la otra. Aplica a las dos categorías. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '10%' }}>Código ítem</th>
                <th rowSpan={2} style={{ width: '9%' }}>Código insumo</th>
                <th colSpan={2}>Descripción de ítem</th>
                {/* "V. Total según PPTO" (2026-09-09, "debo agregar tres
                    columnas más") -- fiel a la hoja Excel real: reutiliza
                    el VR. Unit de "Pendiente por consumir" (esta tabla no
                    tiene un precio unitario propio), multiplicado por la
                    Cantidad Real -- nunca se guarda, se calcula
                    (calcularValorTotalSegunPpto). */}
                <th colSpan={3}>Cantidades reales</th>
                <th rowSpan={2} style={{ width: '27%' }}>Observaciones</th>
                <th rowSpan={2} style={{ width: '4%' }}></th>
              </tr>
              <tr>
                <th style={{ width: '14%' }}>Actividad o insumo</th>
                <th style={{ width: '12%' }}>Alcance</th>
                <th style={{ width: '7%' }}>Unidad</th>
                <th style={{ width: '7%' }}>Cantidad</th>
                <th style={{ width: '10%' }}>V. Total según PPTO</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className={styles.celdaCalc}>{it.codigoItem}</td>
                  <td className={styles.celdaCalc}>{it.codigoInsumo}</td>
                  <td className={styles.celdaCalc}>{it.actividad}</td>
                  <td className={styles.celdaCalc}>{it.alcance}</td>
                  <td className={styles.celdaCalc}>{it.unidad}</td>
                  <td><input type="number" className={`${styles.celdaInput} ${styles.celdaNum}`} value={it.cantidadReal} onChange={(e) => updateItem(idx, 'cantidadReal', e.target.value)} style={inputCellStyle()} /></td>
                  <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalSegunPpto(it))}</td>
                  <td className={styles.celdaCalc}>{it.observaciones}</td>
                  <td>
                    <button type="button" className={styles.deleteRowButton} onClick={() => quitarItem(idx)} title="Quitar ítem" aria-label="Quitar ítem">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>Sin ítems todavía -- agrega al menos uno.</td>
                </tr>
              )}
              {items.length > 0 && (
                <tr style={{ fontWeight: 700, background: 'var(--color-surface-sunken)' }}>
                  <td colSpan={5}>TOTAL</td>
                  <td>{calcularTotalCantidadReal(items)}</td>
                  <td>{formatCurrency(calcularTotalValorSegunPpto(items))}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <Button type="button" variant="ghost" onClick={agregarItem}>
            <Plus size={14} />
            Agregar ítem
          </Button>
        </div>
      </div>

      {/* 2. Comparación -- una tarjeta por proveedor, siempre en fila/wrap
          (nunca una columna de tabla), con el número que de verdad importa
          para decidir: el Costo Total. Clic en la tarjeta abre esa pestaña.
          Se muestra IGUAL en modo `proveedorUnico` (pedido explícito del
          usuario: "que aparezca tal cual... como si fuese comparación") --
          con un solo proveedor es una tarjeta sola, no una comparación real,
          pero visualmente es la misma pieza. */}
      {proveedores.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <p style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, margin: 0 }}>Comparación</p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {proveedores.map((p) => {
              const totales = calcularTotalesProveedor(items, p);
              const activa = p.clientId === tabActivo;
              return (
                <button
                  key={p.clientId}
                  type="button"
                  onClick={() => setTabPedido(p.clientId)}
                  style={{
                    flex: '1 1 200px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: p.seleccionado ? '2px solid var(--color-success-ink)' : activa ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: p.seleccionado ? 'var(--color-success-surface)' : 'var(--color-surface)',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <strong style={{ fontSize: 'var(--text-body-size)' }}>{p.nombre || 'Proveedor sin nombre'}</strong>
                    {p.seleccionado && <Badge variant="success">Seleccionado</Badge>}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--text-title-size)', fontWeight: 700, color: 'var(--color-ink)' }}>{formatCurrency(totales.costoTotal)}</p>
                  <p style={{ margin: 0, fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)' }}>Subtotal {formatCurrency(totales.subtotal)}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Pestañas por proveedor -- cada una edita SOLO su precio por
          ítem + su AIU/IVA (mismo patrón de pestañas horizontales que
          FrenteDetallePage.jsx#categoriaTab). En modo `proveedorUnico` las
          pestañas se ven IGUAL (pedido explícito: "que aparezca tal cual...
          lo único es que solo acepte uno solo") -- lo único que cambia es
          que no hay botón "Agregar proveedor" (no se puede sumar un
          segundo). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          {proveedores.map((p) => (
            <button key={p.clientId} type="button" onClick={() => setTabPedido(p.clientId)} style={tabButtonStyle(p.clientId === tabActivo)}>
              {p.nombre || 'Nuevo proveedor'}
            </button>
          ))}
          {!proveedorUnico && (
            <button type="button" onClick={agregarProveedor} style={tabButtonStyle(false)}>
              <Plus size={14} />
              Agregar proveedor
            </button>
          )}
        </div>

        {proveedorActivo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* Nombre/"seleccionado"/"quitar" -- se ven igual que en modo
                comparación normal; en `proveedorUnico` el campo Nombre
                queda deshabilitado (el valor lo sincroniza el `useEffect`
                de arriba con el Tercero elegido como contratista, nunca se
                escribe a mano) y no hay botón "Quitar proveedor" (siempre
                debe quedar exactamente uno). "Proveedor seleccionado" se
                deja igual -- con uno solo, siempre queda marcado. */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Field className="fieldMd" label="Nombre del proveedor">
                {(p) => <TextInput {...p} value={proveedorActivo.nombre} disabled={proveedorUnico} onChange={(e) => updateProveedor(proveedorActivo.clientId, 'nombre', e.target.value)} />}
              </Field>
              {/* .actionRow/.actionRowSpacer (Solicitudes.module.css) --
                  reproduce el mismo alto de label+gap del <Field> de al lado
                  con un spacer oculto, para que estos dos controles sueltos
                  arranquen exacto a la altura del <input> real, no del
                  borde de abajo de toda la caja (align-items:flex-end no
                  alcanza, ver el comentario grande en esa clase). */}
              <div className={styles.actionRow}>
                <span className={styles.actionRowSpacer} aria-hidden="true">&nbsp;</span>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="radio" name="proveedorSeleccionado" checked={proveedorActivo.seleccionado} onChange={() => seleccionarProveedor(proveedorActivo.clientId)} />
                  Proveedor seleccionado
                </label>
              </div>
              {!proveedorUnico && (
                <div className={styles.actionRow}>
                  <span className={styles.actionRowSpacer} aria-hidden="true">&nbsp;</span>
                  <Button type="button" variant="danger" onClick={() => quitarProveedor(proveedorActivo.clientId)}>
                    <Trash2 size={14} />
                    Quitar proveedor
                  </Button>
                </div>
              )}
            </div>

            <div className={styles.card} style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table className={`${styles.table} ${styles.tableEditable}`} style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Ítem</th>
                    <th style={{ width: '18%' }}>Cantidad</th>
                    <th style={{ width: '21%' }}>Valor unitario</th>
                    <th style={{ width: '21%' }}>Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className={styles.celdaCalc}>
                        {it.actividad || <em style={{ color: 'var(--color-ink-muted)' }}>Sin actividad</em>}
                        {it.alcance && <><br /><span style={{ fontSize: 'var(--text-label-size)', color: 'var(--color-ink-muted)' }}>{it.alcance}</span></>}
                      </td>
                      {/* Cantidad Real (la que se compra/contrata), no
                          Pendiente por consumir -- coherente con
                          calcularValorTotalItem, que ya usa cantidadReal. */}
                      <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{it.cantidadReal || 0} {it.unidad}</td>
                      <td>
                        {/* Valor unitario es dinero -- NUNCA type="number":
                            un input numérico interpreta el primer "." como
                            separador decimal, así que pegar "1.500.000"
                            (formato con puntos de miles, el que la gente
                            realmente pega) lo trunca/rechaza. Texto +
                            inputMode="numeric" + soloDigitos()/formatearMiles()
                            (utils/solicitudes.js) -- mismo patrón ya usado
                            para "Valor total (COP)" en SolicitudForm.jsx --
                            deja pegar CON o SIN puntos y siempre termina
                            guardado como dígitos crudos, mostrado con
                            separador de miles. */}
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`${styles.celdaInput} ${styles.celdaNum}`}
                          value={formatearMiles(it.precios?.[proveedorActivo.clientId])}
                          onChange={(e) => updatePrecio(idx, proveedorActivo.clientId, soloDigitos(e.target.value))}
                          style={inputCellStyle()}
                        />
                      </td>
                      <td className={`${styles.celdaCalc} ${styles.celdaNum}`}>{formatCurrency(calcularValorTotalItem(it, proveedorActivo.clientId))}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className={styles.emptyState}>Agrega ítems arriba primero.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {CAMPOS_AIU.map(([campoPct, , label]) => (
                <Field key={campoPct} className="fieldMd" label={`${label} (%)`}>
                  {(p) => <TextInput {...p} type="number" value={proveedorActivo[campoPct]} onChange={(e) => updateProveedor(proveedorActivo.clientId, campoPct, e.target.value)} />}
                </Field>
              ))}
            </div>

            {items.length > 0 && (() => {
              const totales = calcularTotalesProveedor(items, proveedorActivo);
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md) var(--space-xl)', padding: 'var(--space-md)', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-data-size)' }}>
                  <span>Subtotal: <strong>{formatCurrency(totales.subtotal)}</strong></span>
                  {CAMPOS_AIU.map(([campoPct, campoValor, label]) => (
                    <span key={campoPct}>{label}: <strong>{formatCurrency(totales[campoValor])}</strong></span>
                  ))}
                  <span>Costo total: <strong>{formatCurrency(totales.costoTotal)}</strong></span>
                </div>
              );
            })()}
          </div>
        ) : (
          <p className={styles.emptyState}>
            {proveedorUnico ? 'Selecciona un contratista arriba para empezar a cotizar.' : 'Agrega un proveedor para empezar a cotizar.'}
          </p>
        )}
      </div>
    </div>
  );
}
