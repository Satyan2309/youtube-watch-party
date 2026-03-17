// src/components/VideoPlayer.jsx
import { useState, useEffect, useRef } from 'react'
import styles from './VideoPlayer.module.css'

function VideoPlayer({ videoId, videoState, canControl, onPlay, onPause }) {
  const iframeRef = useRef(null)
  const isRemoteRef = useRef(false) // Prevents loop when server triggers action
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Refs for callbacks to avoid stale closures in event listeners
  const onPlayRef = useRef(onPlay)
  const onPauseRef = useRef(onPause)
  const canControlRef = useRef(canControl)

  useEffect(() => { onPlayRef.current = onPlay }, [onPlay])
  useEffect(() => { onPauseRef.current = onPause }, [onPause])
  useEffect(() => { canControlRef.current = canControl }, [canControl])

  // Reset ready state when video changes
  useEffect(() => {
    setIsReady(false)
    setIsLoading(!!videoId)
  }, [videoId])

  // Helper to send commands to YouTube iframe
  const sendCommand = (func, args = []) => {
    if (!iframeRef.current) return
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    )
  }

  // Listen for messages from YouTube iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.origin.includes('youtube.com')) return

      let data
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      // Player is ready to receive commands
      if (data.event === 'onReady') {
        console.log('[VideoPlayer] Player ready')
        setIsReady(true)
        setIsLoading(false)
      }

      // State changes: 1 = Playing, 2 = Paused, 3 = Buffering
      if (data.event === 'onStateChange') {
        // If the change was triggered by a remote command, ignore it to prevent loops
        if (isRemoteRef.current) return
        
        // If user is not allowed to control, ignore local changes
        if (!canControlRef.current) return

        if (data.info === 1) {
          onPlayRef.current?.()
        } else if (data.info === 2) {
          onPauseRef.current?.(0)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Sync effect: Applies server state to local player
  useEffect(() => {
    if (!videoId || !videoState || !isReady) return

    console.log('[VideoPlayer] Syncing state:', videoState)
    isRemoteRef.current = true

    // Apply Play/Pause
    if (videoState.playing) {
      sendCommand('playVideo')
    } else {
      sendCommand('pauseVideo')
    }

    // Apply Seek if time is provided
    // We send this every time to ensure sync, but only if it's > 0
    if (videoState.currentTime > 0) {
      sendCommand('seekTo', [videoState.currentTime, true])
    }

    // Reset remote flag after a short delay to allow events to settle
    const timer = setTimeout(() => {
      isRemoteRef.current = false
    }, 500)

    return () => clearTimeout(timer)
  }, [videoState, videoId, isReady])

  const iframeSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=1&rel=0&iv_load_policy=3&playsinline=1&modestbranding=1&origin=${encodeURIComponent(
        window.location.origin
      )}`
    : null

  return (
    <div className={styles.wrapper}>
      {videoId ? (
        <>
          <iframe
            key={videoId} // Re-mount iframe when video changes
            ref={iframeRef}
            className={styles.player}
            src={iframeSrc}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {/* Blocker prevents non-hosts from interacting with the iframe directly */}
          {!canControl && <div className={styles.blocker} />}
          
          {isLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner}></div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}>▶</div>
          <p className={styles.placeholderText}>No video selected</p>
          {canControl && (
            <p className={styles.placeholderHint}>
              Paste a YouTube URL below to start watching
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default VideoPlayer
