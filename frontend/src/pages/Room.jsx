import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import socket from '../socket.js'
import VideoPlayer from '../components/VideoPlayer.jsx'
import Controls from '../components/Controls.jsx'
import ParticipantList from '../components/ParticipantList.jsx'
import Chat from '../components/Chat.jsx'
import Toast from '../components/Toast.jsx'
import styles from './Room.module.css'

function Room() {
  const { roomId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [participants, setParticipants] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [videoState, setVideoState] = useState({ playing: false, currentTime: 0 })
  const [currentVideoId, setCurrentVideoId] = useState('')
  const [duration, setDuration] = useState(0)
  const [toasts, setToasts] = useState([])
  const [connected, setConnected] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState('participants') 
  const [unreadCount, setUnreadCount] = useState(0)  
  const [roomError, setRoomError] = useState('')
 
  const [chatMessages, setChatMessages] = useState([])

  const currentUserIdRef = useRef(null)

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  useEffect(() => {
    currentUserIdRef.current = currentUser?.userId || null
  }, [currentUser])

  useEffect(() => {
    const savedUser = localStorage.getItem('watchParty_user')
    let initialUser = null

    // Determine user info first
    if (location.state?.roomData) {
      const { roomData } = location.state
      initialUser = { userId: roomData.userId, username: roomData.username, role: roomData.role }
      setCurrentUser(initialUser)
      currentUserIdRef.current = initialUser.userId
      setParticipants(roomData.participants || [])
      setCurrentVideoId(roomData.currentVideo || '')
      setVideoState(roomData.videoState || { playing: false, currentTime: 0 })
      setConnected(true)
    } else if (savedUser) {
      initialUser = JSON.parse(savedUser)
      setCurrentUser(initialUser)
      currentUserIdRef.current = initialUser.userId
    } else {
      navigate('/')
      return
    }

    // Register all listeners before connecting to ensure no events are missed
    const handleUserJoined = (data) => {
      setParticipants(data.participants)
      addToast(`${data.username} joined the room`, 'info')
    }

    const handleUserLeft = (data) => {
      setParticipants(data.participants)
      if (data.username) addToast(`${data.username} left the room`, 'info')
    }

    const handleSyncState = (data) => {
      console.log('[Socket] sync_state received:', data)
      // Update videoId if provided - this triggers VideoPlayer to load new iframe
      if (data.videoId && data.videoId !== currentVideoId) {
        console.log('[Socket] Updating currentVideoId to:', data.videoId)
        setCurrentVideoId(data.videoId)
      }
      // Update videoState
      setVideoState({ playing: data.playState === 'playing', currentTime: data.currentTime })
    }

    const handleRoleAssigned = (data) => {
      setParticipants(data.participants)
      if (data.userId === currentUserIdRef.current) {
        setCurrentUser(prev => prev ? { ...prev, role: data.role } : null)
        localStorage.setItem('watchParty_user', JSON.stringify({
          ...JSON.parse(localStorage.getItem('watchParty_user') || '{}'),
          role: data.role
        }))
        addToast(`Your role changed to ${data.role}`, 'success')
      } else {
        addToast(`A participant's role was updated to ${data.role}`, 'info')
      }
    }

    const handleHostTransferred = (data) => {
      setParticipants(data.participants)
      if (data.newHostId === currentUserIdRef.current) {
        setCurrentUser(prev => prev ? { ...prev, role: 'host' } : null)
        localStorage.setItem('watchParty_user', JSON.stringify({
          ...JSON.parse(localStorage.getItem('watchParty_user') || '{}'),
          role: 'host'
        }))
        addToast('You are now the Host! ', 'success')
      } else if (data.previousHostId === currentUserIdRef.current) {
        setCurrentUser(prev => prev ? { ...prev, role: 'participant' } : null)
        localStorage.setItem('watchParty_user', JSON.stringify({
          ...JSON.parse(localStorage.getItem('watchParty_user') || '{}'),
          role: 'participant'
        }))
        addToast(`Host role transferred to ${data.newHostUsername}`, 'info')
      } else {
        addToast(`${data.newHostUsername} is the new Host `, 'info')
      }
    }

    const handleParticipantRemoved = (data) => {
      setParticipants(data.participants)
      addToast('A participant was removed', 'info')
    }

    const handleYouWereRemoved = (data) => {
      addToast(data.message, 'error')
      setTimeout(() => {
        localStorage.removeItem('watchParty_user')
        navigate('/')
      }, 2500)
    }

    const handleRoomJoined = (data) => {
      console.log('[Socket] room_joined received:', data)
      if (data.success) {
        setParticipants(data.participants)
        setCurrentVideoId(data.currentVideo || '')
        setVideoState(data.videoState || { playing: false, currentTime: 0 })
        setConnected(true)
        setCurrentUser(prev => {
          if (!prev) return prev
          const updated = { ...prev, role: data.role, userId: data.userId }
          currentUserIdRef.current = updated.userId
          // Update localStorage with new userId (socket.id)
          localStorage.setItem('watchParty_user', JSON.stringify({
            ...JSON.parse(localStorage.getItem('watchParty_user') || '{}'),
            userId: data.userId,
            role: data.role
          }))
          return updated
        })
      }
    }

    const handleError = (data) => {
      console.log('[Socket] error received:', data)
      addToast(data.message, 'error')
      
      // If room not found, redirect to home
      if (data.message && data.message.toLowerCase().includes('room not found')) {
        localStorage.removeItem('watchParty_user')
        setTimeout(() => navigate('/'), 2000)
      }
    }

    const handleDisconnect = () => {
      setConnected(false)
      addToast('Connection lost...', 'error')
    }

    const handleConnect = () => {
      console.log('[Socket] Connected, socket.id:', socket.id)
      setConnected(true)
      // Re-join room on reconnection to update socketId in backend
      if (initialUser) {
        socket.emit('join_room', { roomId, username: initialUser.username })
      }
    }

    const handleNewMessage = (data) => {
      console.log('[Socket] new_message received:', data)
      setChatMessages(prev => {
        const updated = [...prev, data]
        return updated.length > 200 ? updated.slice(-200) : updated
      })
      setSidebarTab(curr => {
        if (curr !== 'chat') setUnreadCount(c => c + 1)
        return curr
      })
    }

    // Register all listeners BEFORE connecting
    socket.on('user_joined', handleUserJoined)
    socket.on('user_left', handleUserLeft)
    socket.on('sync_state', handleSyncState)
    socket.on('role_assigned', handleRoleAssigned)
    socket.on('host_transferred', handleHostTransferred)
    socket.on('participant_removed', handleParticipantRemoved)
    socket.on('you_were_removed', handleYouWereRemoved)
    socket.on('room_joined', handleRoomJoined)
    socket.on('error', handleError)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)
    socket.on('new_message', handleNewMessage)

    // Connect the socket (listeners are already set up)
    if (!socket.connected) {
      socket.connect()
    } else {
      // Already connected, manually trigger join to ensure socket is in the room
      if (initialUser) {
        socket.emit('join_room', { roomId, username: initialUser.username })
      }
    }

    return () => {
      socket.off('user_joined', handleUserJoined)
      socket.off('user_left', handleUserLeft)
      socket.off('sync_state', handleSyncState)
      socket.off('role_assigned', handleRoleAssigned)
      socket.off('host_transferred', handleHostTransferred)
      socket.off('participant_removed', handleParticipantRemoved)
      socket.off('you_were_removed', handleYouWereRemoved)
      socket.off('room_joined', handleRoomJoined)
      socket.off('error', handleError)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
      socket.off('new_message', handleNewMessage)
      
      // Explicit "Leave" button handles leave_room.
      window._ytPlayer = null
    }
  }, [roomId])

  const handlePlay = () => socket.emit('play', { roomId })
  const handlePause = (time) => socket.emit('pause', { roomId, currentTime: time })
  const handleSeek = (time) => socket.emit('seek', { roomId, time })

  const handleLeave = () => {
    socket.emit('leave_room', { roomId })
    localStorage.removeItem('watchParty_user')
    window._ytPlayer = null
    navigate('/')
  }

 
  const handleSidebarTab = (tab) => {
    setSidebarTab(tab)
    if (tab === 'chat') setUnreadCount(0)
  }

  const canControl = currentUser?.role === 'host' || currentUser?.role === 'moderator'

  if (roomError) {
    return (
      <div className={styles.errorPage}>
        <div className={styles.errorCard}>
          <span className={styles.errorIcon}>⚠</span>
          <h2>Room Error</h2>
          <p>{roomError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <Toast toasts={toasts} />

      {/* TOP BAR */}
      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.brandMark}>🎬</span>
          <span className={styles.roomLabel}>Room</span>
          <span className={styles.roomCode}>{roomId}</span>
          <div className={`${styles.connStatus} ${connected ? styles.connOk : styles.connLost}`}>
            <span className={styles.connDot} />
            {connected ? 'Live' : 'Reconnecting...'}
          </div>
        </div>

        <div className={styles.topRight}>
          {currentUser && (
            <div className={styles.myInfo}>
              <span className={`badge badge-${currentUser.role}`}>
                {currentUser.role === 'host' ? '👑' : currentUser.role === 'moderator' ? '🛡' : '👤'} {currentUser.role}
              </span>
              <span className={styles.myName}>{currentUser.username}</span>
            </div>
          )}
          <button className={`btn btn-icon ${styles.sidebarToggle}`} onClick={() => setSidebarOpen(o => !o)}>👥</button>
          <button className="btn btn-danger" onClick={handleLeave}>Leave</button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className={styles.content}>

        {/* Video + Controls */}
        <div className={styles.videoSection}>
          <div className={styles.videoContainer}>
            <VideoPlayer
              videoId={currentVideoId}
              videoState={videoState}
              canControl={canControl}
              onPlay={handlePlay}
              onPause={handlePause}
              onDuration={setDuration}
            />
          </div>
          <Controls
            roomId={roomId}
            videoState={videoState}
            canControl={canControl}
            currentVideoId={currentVideoId}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
            duration={duration}
          />
        </div>

        {/* Sidebar — Participants + Chat */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
          {/* Tab switcher — Participants | Chat */}
          <div className={styles.sidebarTabs}>
            <button
              className={`${styles.sidebarTab} ${sidebarTab === 'participants' ? styles.sidebarTabActive : ''}`}
              onClick={() => handleSidebarTab('participants')}
            >
              👥 People
            </button>
            <button
              className={`${styles.sidebarTab} ${sidebarTab === 'chat' ? styles.sidebarTabActive : ''}`}
              onClick={() => handleSidebarTab('chat')}
            >
              💬 Chat
              {/* Unread badge */}
              {unreadCount > 0 && (
                <span className={styles.unreadBadge}>{unreadCount}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className={styles.sidebarContent}>
            {sidebarTab === 'participants' ? (
              <ParticipantList
                participants={participants}
                currentUser={currentUser}
                roomId={roomId}
              />
            ) : (
              <Chat roomId={roomId} currentUser={currentUser} messages={chatMessages} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default Room
