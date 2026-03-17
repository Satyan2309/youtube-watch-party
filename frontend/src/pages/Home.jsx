import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import socket from '../socket.js'
import styles from './Home.module.css'


function Home() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [username, setUsername] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [activeTab, setActiveTab] = useState('create')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

 
  useEffect(() => {
    const joinParam = searchParams.get('join')
    if (joinParam) {
      setActiveTab('join')
      setJoinCode(joinParam.toUpperCase())
    }
  }, [searchParams])

  const handleCreateRoom = () => {
    if (!username.trim()) { setError('Please enter your name before continuing.'); return }
    setLoading(true); setError('')
    if (!socket.connected) socket.connect()
    socket.emit('create_room', { username: username.trim() })
    socket.once('room_created', (data) => {
      if (data.success) {
        localStorage.setItem('watchParty_user', JSON.stringify({
          userId: data.userId, username: data.username, role: data.role
        }))
        navigate(`/room/${data.roomId}`, { state: { roomData: data } })
      }
    })
    socket.once('error', (err) => { setError(err.message); setLoading(false) })
  }

  const handleJoinRoom = async () => {
    if (!username.trim()) { setError('Please enter your name before continuing.'); return }
    if (!joinCode.trim()) { setError('Please enter a room code to join.'); return }
    setLoading(true); setError('')

    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/room/${joinCode.trim().toUpperCase()}`)
      const data = await res.json()
      if (!data.exists) {
        setError('That room could not be found. Please double‑check the code and try again.')
        setLoading(false)
        return
      }
    } catch {
      // If API fails (e.g. CORS or network error), we still try via socket
    }

    if (!socket.connected) socket.connect()
    socket.emit('join_room', { roomId: joinCode.trim().toUpperCase(), username: username.trim() })

    socket.once('room_joined', (data) => {
      if (data.success) {
        localStorage.setItem('watchParty_user', JSON.stringify({
          userId: data.userId, username: data.username, role: data.role
        }))
        navigate(`/room/${data.roomId}`, { state: { roomData: data } })
      }
    })
    socket.once('error', (err) => { setError(err.message); setLoading(false) })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') activeTab === 'create' ? handleCreateRoom() : handleJoinRoom()
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.logoIcon}>🎬</div>
          <h1 className={styles.logo}>WatchTogether</h1>
          <p className={styles.tagline}>Watch YouTube videos in sync with your friends.</p>
        </div>

        <div className={styles.card}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'create' ? styles.tabActive : ''}`}
              onClick={() => { setActiveTab('create'); setError('') }}>
              Create Room
            </button>
            <button className={`${styles.tab} ${activeTab === 'join' ? styles.tabActive : ''}`}
              onClick={() => { setActiveTab('join'); setError('') }}>
              Join Room
            </button>
          </div>

          <div className={styles.formBody}>
            <div className={styles.field}>
              <label className={styles.label}>Your Name</label>
              <input className="input" type="text" placeholder="Enter your name"
                value={username} onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown} maxLength={20} autoFocus />
            </div>

            {activeTab === 'join' && (
              <div className={styles.field}>
                <label className={styles.label}>Room Code</label>
                <input
                  className={`input ${styles.codeInput}`}
                  type="text"
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  maxLength={6}
                />
              </div>
            )}

            {error && (
              <div className={styles.errorMsg}><span>⚠</span> {error}</div>
            )}

            <button
              className={`btn btn-primary ${styles.submitBtn}`}
              onClick={activeTab === 'create' ? handleCreateRoom : handleJoinRoom}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" />{activeTab === 'create' ? 'Creating...' : 'Joining...'}</>
                : activeTab === 'create' ? 'Create Room' : 'Join Room'
              }
            </button>
          </div>
        </div>

        <div className={styles.features}>
          <div className={styles.feature}><span className={styles.featureIcon}>⚡</span><span>Real-time sync</span></div>
          <div className={styles.featureDivider} />
          <div className={styles.feature}><span className={styles.featureIcon}>👑</span><span>Host controls</span></div>
          <div className={styles.featureDivider} />
          <div className={styles.feature}><span className={styles.featureIcon}>💬</span><span>Live chat</span></div>
        </div>
      </div>
    </div>
  )
}

export default Home
