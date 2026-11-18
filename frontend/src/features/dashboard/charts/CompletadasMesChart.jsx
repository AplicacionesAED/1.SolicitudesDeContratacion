import { ChartCard } from './ChartCard.jsx';
import styles from '../Dashboard.module.css';

// "Completadas por mes": columnas delgadas hechas con CSS (sin ApexCharts) -- son 6 cifras chicas, no hace falta un motor de
// graficos. El mes en curso va en el azul de marca y los anteriores en un tono suave, para que se lea de un vistazo como
// va el mes frente a los demas. `data`: [{ label, total }] en orden cronologico, el ultimo es el mes actual.
export function CompletadasMesChart({ title, hint, description, data }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const total = data.reduce((acc, d) => acc + d.total, 0);
  const resumen = data.map((d) => `${d.label}: ${d.total}`).join(', ');
  return (
    <ChartCard title={title} hint={`${hint} · ${total} en total`} description={description} ariaLabel={`Completadas por mes. ${resumen}.`} empty={total === 0}>
      <ul className={styles.mesColumnas} aria-hidden="true">
        {data.map((d, i) => {
          const actual = i === data.length - 1;
          return (
            <li key={d.label} className={styles.mesColumna}>
              <span className={`${styles.mesValor} ${d.total === 0 ? styles.mesValorCero : ''}`}>{d.total}</span>
              <span className={styles.mesPista}>
                <span className={`${styles.mesBarra} ${actual ? styles.mesBarraActual : ''}`} style={{ height: `${d.total === 0 ? 0 : Math.max(8, (d.total / max) * 100)}%` }} />
              </span>
              <span className={`${styles.mesLabel} ${actual ? styles.mesLabelActual : ''}`}>{d.label}</span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
