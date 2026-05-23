import styles from './HeroNotation.module.css'

export default function HeroNotation() {
  return (
    <div className={styles.notation}>
      <span className={styles.degree}>23°.85</span>
      <span className={styles.label}>LAHIRI OFFSET</span>
    </div>
  )
}
