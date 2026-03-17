// src/components/Controls.jsx
//
// FIX: window._ytPlayer polling hataya (YT.Player API ab nahi hai)
// Ab currentTime videoState se aata hai (server se synced)
// Seek bar smooth dikhne ke liye local interpolation use karte hain

import { useState, useEffect, useRef } from 'react'
import socket from '../socket.js'
import styles from './Controls.module.css'

// More forgiving YouTube URL parsing so Load works
// for normal links, shorts, share links, etc.
const extractVideoId = (rawUrl) => {
  if (!rawUrl) return null
  const trimmed = rawUrl.trim()

  // If the user pasted just the 11‑character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

  // Try using URL parsing for common forms:
  // - https://www.youtube.com/watch?v=VIDEOID&...
  // - https://youtu.be/VIDEOID?...
  // - https://www.youtube.com/embed/VIDEOID
  try {
    const url = new URL(trimmed)

    const vParam = url.searchParams.get('v')
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam

    if (url.hostname.includes('youtu.be')) {
      const pathId = url.pathname.replace('/', '')
      if (/^[a-zA-Z0-9_-]{11}$/.test(pathId)) return pathId
    }

    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
  } catch {
    // If URL() fails, fall back to regex below
  }

  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  )
  return match ? match[1] : null
}

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Controls({ roomId, videoState, canControl, currentVideoId }) {
  const [videoUrl,   setVideoUrl]   = useState('')
  const [urlError,   setUrlError]   = useState('')
  const [copied,     setCopied]     = useState(false)
  const [localTime,  setLocalTime]  = useState(0)    // smooth seek bar ke liye
  const [duration,   setDuration]   = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const tickRef = useRef(null)  // local time ticker

  // ============================================================
  // Local time interpolation — seek bar smooth dikhne ke liye
  // Server har second sync bhejta hai — beech mein hum khud increment karte hain
  // ============================================================
  useEffect(() => {
    // videoState se time sync karo (jab server se aaye)
    if (videoState && !isDragging) {
      setLocalTime(videoState.currentTime || 0)
    }
  }, [videoState, isDragging])

  // Playing ho toh har second +1 karo locally (smooth progress)
  // Use requestAnimationFrame for smoother updates and less reflow
  useEffect(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current)

    if (videoState?.playing && !isDragging) {
      let lastTime = performance.now()
      
      const updateLocalTime = (currentTime) => {
        if (currentTime - lastTime >= 1000) {
          setLocalTime(t => t + 1)
          lastTime = currentTime
        }
        if (videoState?.playing && !isDragging) {
          tickRef.current = requestAnimationFrame(updateLocalTime)
        }
      }
      
      tickRef.current = requestAnimationFrame(updateLocalTime)
    }

    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current)
    }
  }, [videoState?.playing, isDragging])

  // Duration: YouTube embed ki duration pane ka reliable tarika nahi hai
  // isliye ek reasonable default rakhte hain
  // Jab seek karo toh percentage se calculate hoga
  // Duration ko videoState se estimate karte hain (agar available ho)
  useEffect(() => {
    // Duration set karo — agar koi realistic value nahi hai toh 600 (10 min default)
    if (!duration || duration === 0) setDuration(600)
  }, [currentVideoId, duration])

  const handlePlay  = () => {
    if (!socket.connected) {
      console.warn('[Controls] Socket not connected, cannot play')
      return
    }
    socket.emit('play',  { roomId })
  }
  
  const handlePause = () => {
    if (!socket.connected) {
      console.warn('[Controls] Socket not connected, cannot pause')
      return
    }
    socket.emit('pause', { roomId, currentTime: localTime })
  }

  const handleSeekChange = (e) => {
    const pct = parseFloat(e.target.value)
    setLocalTime((pct / 100) * duration)
    setIsDragging(true)
  }

  const handleSeekRelease = (e) => {
    const pct     = parseFloat(e.target.value)
    const newTime = (pct / 100) * duration
    if (socket.connected) {
      socket.emit('seek', { roomId, time: newTime })
    } else {
      console.warn('[Controls] Socket not connected, cannot seek')
    }
    setLocalTime(newTime)
    setIsDragging(false)
  }

  const handleChangeVideo = (e) => {
    e?.preventDefault()
    if (!videoUrl.trim()) return
    const videoId = extractVideoId(videoUrl.trim())
    if (!videoId) {
      setUrlError('That does not look like a valid YouTube URL. Please check and try again.')
      return
    }
    
    // Check socket connection before emitting
    if (!socket.connected) {
      setUrlError('Not connected to server. Please wait and try again.')
      console.warn('[Controls] Socket not connected, cannot change video')
      return
    }
    
    setUrlError('')
    setDuration(600) // reset duration
    console.log('[Controls] Emitting change_video:', { roomId, videoId })
    socket.emit('change_video', { roomId, videoId })
    
    // Listen for sync_state response (one-time listener)
    socket.once('sync_state', (data) => {
      console.log('[Controls] Received sync_state after change_video:', data)
      if (data.videoId === videoId) {
        console.log('[Controls] Video change confirmed by server')
      }
    })
    
    setVideoUrl('')
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?join=${roomId}`
    navigator.clipboard.writeText(link).catch(() => {
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const seekPct  = duration > 0 ? Math.min((localTime / duration) * 100, 100) : 0
  const isPlaying = videoState?.playing || false

  return (
    <div className={styles.controlsWrapper}>

      {/* SEEK BAR */}
      <div className={styles.seekContainer}>
        <span className={styles.timeLabel}>{formatTime(localTime)}</span>
        <input
          type="range" min="0" max="100" step="0.1"
          value={seekPct}
          onChange={canControl ? handleSeekChange : undefined}
          onMouseUp={canControl ? handleSeekRelease : undefined}
          onTouchEnd={canControl ? handleSeekRelease : undefined}
          className={styles.seekBar}
          disabled={!canControl || !currentVideoId}
          style={{ '--progress': `${seekPct}%` }}
          readOnly={!canControl}
        />
        <span className={styles.timeLabel}>{formatTime(duration)}</span>
      </div>

      {/* MAIN ROW */}
      <div className={styles.mainRow}>
        <div className={styles.leftControls}>
          <button
            className={`${styles.playBtn} ${!canControl ? styles.disabled : ''}`}
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={!canControl || !currentVideoId}
          >
            {isPlaying
              ? <span className={styles.pauseIcon}><span /><span /></span>
              : <span className={styles.playIcon}>▶</span>
            }
          </button>
          <div className={styles.statusDot}>
            <span className={`${styles.dot} ${isPlaying ? styles.dotPlaying : styles.dotPaused}`} />
            <span className={styles.statusText}>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
        </div>

        {canControl && (
          <div className={styles.urlInputGroup}>
            <input
              className={`input ${styles.urlInput}`}
              type="text"
              placeholder="Paste YouTube URL..."
              value={videoUrl}
              onChange={(e) => { setVideoUrl(e.target.value); setUrlError('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleChangeVideo(e)
                }
              }}
            />
            <button
              className={`btn btn-primary ${styles.loadBtn}`}
              onClick={handleChangeVideo}
              disabled={!videoUrl.trim()}
            >
              Load
            </button>
          </div>
        )}

        <div className={styles.rightControls}>
          <button className={`btn btn-secondary ${styles.inviteBtn}`} onClick={handleCopyLink}>
            {copied ? 'Copied' : 'Invite'}
          </button>
        </div>
      </div>

      {urlError && <div className={styles.urlError}>⚠ {urlError}</div>}
      {!canControl && (
        <div className={styles.viewerNotice}>
          👁 You are a Participant — only Host and Moderator can control playback
        </div>
      )}
    </div>
  )
}

export default Controls