// Utilidades puras de la cuadrícula del cuadro comparativo (CuadroComparativoGrid.jsx): números en formato colombiano,
// cálculos por fila y lista de datos faltantes. Sin React ni DOM: el formulario usa `faltantesCuadro` para contar lo
// pendiente del paso (mismo número que ve el stepper) y la cuadrícula lo usa para marcar y enfocar cada celda.
//
// Los ítems tienen la misma forma que guarda el backend (cuadroComparativo.js): codigoItem, codigoInsumo, actividad,
// alcance, unidad, cantidad (pendiente por consumir), valorUnitarioPendiente, cantidadReal, observaciones y
// `precios[clientIdProveedor]` (valor unitario ofertado). Un número vacío se representa con '' (nunca null).

export const UNIDADES = ['UNIDAD', 'M2', 'M3', 'ML', 'KG', 'GL', 'HR', 'DÍA', 'MES'];

// Orden de columnas al pegar desde Excel; `campo` es el nombre del campo en el ítem y `precio` marca el valor ofertado.
export const COLUMNAS = [
  { key: 'codItem', campo: 'codigoItem', etiqueta: 'Cód. ítem', largo: 'Código sub capítulo - ítem presupuestal' },
  { key: 'codInsumo', campo: 'codigoInsumo', etiqueta: 'Cód. insumo', largo: 'Código de insumo' },
  { key: 'actividad', campo: 'actividad', etiqueta: 'Actividad', largo: 'Actividad o insumo' },
  { key: 'alcance', campo: 'alcance', etiqueta: 'Alcance', largo: 'Alcance' },
  { key: 'und', campo: 'unidad', etiqueta: 'Unidad', largo: 'Unidad' },
  { key: 'pendCant', campo: 'cantidad', numerico: true, etiqueta: 'Cant. pendiente', largo: 'Cantidad pendiente por consumir' },
  { key: 'pendVr', campo: 'valorUnitarioPendiente', numerico: true, etiqueta: 'Vr. unit. ppto.', largo: 'Valor unitario del presupuesto' },
  { key: 'cantReal', campo: 'cantidadReal', numerico: true, etiqueta: 'Cant. real', largo: 'Cantidad real requerida' },
  { key: 'vrOferta', campo: 'vrOferta', precio: true, numerico: true, etiqueta: 'Vr. unit. ofertado', largo: 'Valor unitario ofertado' },
];

// Acepta "$", espacios, "1.234.567,89", "1234567.89" y "100.000". Con punto y coma, el último separador es el decimal;
// solo coma = decimal; solo puntos con patrón de miles (1.234 / 12.345.678) = miles; si no, punto decimal.
export function parseNum(texto) {
  if (texto == null) return null;
  let s = String(texto).trim().replace(/[$\s ]/g, '');
  if (s === '') return null;
  const hayComa = s.includes(',');
  const hayPunto = s.includes('.');
  if (hayComa && hayPunto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hayComa) {
    s = s.replace(',', '.');
  } else if (hayPunto && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

// "1.234.567,5": miles con punto, decimal con coma, sin ceros sobrantes.
export function formatNum(n, decimales = 4) {
  if (n === '' || n == null || Number.isNaN(Number(n))) return '';
  const num = Number(n);
  const neg = num < 0;
  const [entera, dec = ''] = Math.abs(num).toFixed(decimales).split('.');
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decRecortado = dec.replace(/0+$/, '');
  return `${neg ? '-' : ''}${miles}${decRecortado ? `,${decRecortado}` : ''}`;
}

// "$ 1.234.567": se redondea al peso solo al mostrar.
export function formatMoney(n) {
  const num = Number(n) || 0;
  return `${num < 0 ? '-' : ''}$ ${formatNum(Math.round(Math.abs(num)), 0)}`;
}

export const esNum = (v) => v !== '' && v != null && !Number.isNaN(Number(v));
const N = (v) => (esNum(v) ? Number(v) : 0);

export function getValor(item, col, pid) {
  return col.precio ? item.precios?.[pid] ?? '' : item[col.campo] ?? '';
}

// Devuelve el ítem con `valor` aplicado (inmutable). Un número que no se pudo leer queda vacío.
export function setValor(item, col, pid, valor) {
  if (col.precio) {
    const precios = { ...(item.precios ?? {}) };
    if (valor === '' || valor == null) delete precios[pid];
    else precios[pid] = valor;
    return { ...item, precios };
  }
  return { ...item, [col.campo]: valor };
}

export function calcularFila(item, pid) {
  const pendVr = N(item.valorUnitarioPendiente);
  const real = N(item.cantidadReal);
  const oferta = N(item.precios?.[pid]);
  return { pend: N(item.cantidad) * pendVr, ppto: real * pendVr, oferta: real * oferta };
}

// Una fila "empezada" es la que tiene algo escrito (la unidad por defecto no cuenta).
export function filaEmpezada(item, pid) {
  return Boolean(
    String(item.codigoItem ?? '').trim() ||
      String(item.codigoInsumo ?? '').trim() ||
      String(item.actividad ?? '').trim() ||
      String(item.alcance ?? '').trim() ||
      esNum(item.cantidad) ||
      esNum(item.valorUnitarioPendiente) ||
      esNum(item.cantidadReal) ||
      esNum(item.precios?.[pid])
  );
}

// Datos obligatorios que faltan en las filas empezadas: actividad, cantidad real y valor unitario ofertado.
// `campo` es la `key` de COLUMNAS de la celda a enfocar.
export function faltantesCuadro(items, pid) {
  const faltas = [];
  items.forEach((it, i) => {
    if (!filaEmpezada(it, pid)) return;
    const nombre = String(it.actividad ?? '').trim() || 'sin actividad';
    const prefijo = `Fila ${i + 1} (${nombre}): `;
    if (!String(it.actividad ?? '').trim()) faltas.push({ fila: i, campo: 'actividad', texto: `Fila ${i + 1}: falta la actividad` });
    if (!esNum(it.cantidadReal)) faltas.push({ fila: i, campo: 'cantReal', texto: `${prefijo}falta la cantidad real` });
    if (!esNum(it.precios?.[pid])) faltas.push({ fila: i, campo: 'vrOferta', texto: `${prefijo}falta el valor unitario ofertado` });
  });
  return faltas;
}

// Totales de la tabla y diferencia contra el presupuesto (solo con las filas que ya tienen cantidad real y oferta).
export function totalesCuadro(items, pid) {
  let pend = 0;
  let ppto = 0;
  let oferta = 0;
  let pptoComparable = 0;
  let ofertaComparable = 0;
  let comparables = 0;
  for (const it of items) {
    const c = calcularFila(it, pid);
    pend += c.pend;
    ppto += c.ppto;
    oferta += c.oferta;
    if (esNum(it.cantidadReal) && esNum(it.precios?.[pid])) {
      pptoComparable += c.ppto;
      ofertaComparable += c.oferta;
      comparables += 1;
    }
  }
  const diferencia = ofertaComparable - pptoComparable;
  return {
    pend,
    ppto,
    oferta,
    comparables,
    diferencia,
    diferenciaPct: pptoComparable > 0 ? (diferencia / pptoComparable) * 100 : null,
  };
}

export function parseTSV(texto) {
  return texto.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
}

// Convierte el texto de una celda pegada al valor del campo (números parseados, unidad en mayúsculas).
export function valorDePegado(col, crudo) {
  const t = String(crudo ?? '').trim();
  if (col.numerico) {
    const n = parseNum(t);
    return n == null ? '' : n;
  }
  if (col.key === 'und') return t.toUpperCase() || 'UNIDAD';
  return t;
}

// Reparte una matriz de celdas desde (fila `desde`, columna `colDesde`) hacia la derecha y hacia abajo, creando filas
// con `nuevaFila()` si hacen falta. Inmutable.
export function aplicarMatriz(items, desde, colDesde, matriz, pid, nuevaFila) {
  const out = [...items];
  matriz.forEach((linea, i) => {
    let fila = out[desde + i] ?? nuevaFila();
    linea.forEach((crudo, j) => {
      const col = COLUMNAS[colDesde + j];
      if (col) fila = setValor(fila, col, pid, valorDePegado(col, crudo));
    });
    out[desde + i] = fila;
  });
  return out;
}

// Descarta una fila de encabezado (primera celda que empieza por "cód" o "ítem") y las filas totalmente vacías.
export function limpiarMatrizPegada(matriz) {
  const filas = matriz.map((l) => l.map((c) => c.trim()));
  if (filas.length && /^(c[oó]d|[ií]tem)/i.test(filas[0][0] ?? '')) filas.shift();
  return filas.filter((l) => l.some((c) => c !== ''));
}
