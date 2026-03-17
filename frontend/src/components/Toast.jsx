import styles from './Toast.module.css'

function Toast({ toasts }) {
  const icons = { error: '✕', success: '✓', info: 'ℹ' }
  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[`toast-${toast.type}`]}`}>
          <span className={styles.icon}>{icons[toast.type]}</span>
          <span className={styles.message}>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
export default Toast
