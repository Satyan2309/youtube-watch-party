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

function Controls({ roomId, videoState, canControl, currentVideoId, onSeek, onPlay, onPause, duration = 0 }) {
  const [videoUrl, setVideoUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [copied, setCopied] = useState(false)
  const [localTime, setLocalTime] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const tickRef = useRef(null)

  useEffect(() => {
    if (videoState && !isDragging) {
      setLocalTime(videoState.currentTime || 0)
    }
  }, [videoState, isDragging])

  useEffect(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current)

    if (videoState?.playing && !isDragging) {
      let lastTime = performance.now()
      
      const updateLocalTime = (currentTime) => {
        if (currentTime - lastTime >= 1000) {
          setLocalTime(t => {
            const next = t + 1;
            return duration > 0 ? Math.min(next, duration) : next;
          })
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
  }, [videoState?.playing, isDragging, duration])

  useEffect(() => {
    const handleTimeUpdate = (e) => {
      if (e.detail >= 0 && !isDragging) {
        setLocalTime((prevTime) => {
           if (Math.abs(prevTime - e.detail) > 2) {
             return e.detail
           }
           return prevTime
        })
      }
    }

    window.addEventListener('yt-time-update', handleTimeUpdate)
    return () => {
      window.removeEventListener('yt-time-update', handleTimeUpdate)
    }
  }, [isDragging])

  const handlePlay = () => {
    if (onPlay) onPlay()
  }
  
  const handlePause = () => {
    if (onPause) onPause(localTime)
  }

  const handleSeekChange = (e) => {
    const pct = parseFloat(e.target.value)
    // If duration is 0, use a fallback of 600 just for dragging UI
    const effectiveDuration = duration > 0 ? duration : 600
    setLocalTime((pct / 100) * effectiveDuration)
    setIsDragging(true)
  }

  const handleSeekRelease = (e) => {
    const pct = parseFloat(e.target.value)
    const effectiveDuration = duration > 0 ? duration : 600
    const newTime = (pct / 100) * effectiveDuration
    
    if (onSeek) {
      onSeek(newTime)
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