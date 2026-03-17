// src/components/VideoPlayer.jsx
import { useState, useEffect, useRef } from 'react'
import styles from './VideoPlayer.module.css'

function VideoPlayer({ videoId, videoState, canControl, onPlay, onPause, onDuration }) {
  const iframeRef = useRef(null)
  const isRemoteRef = useRef(false) // Prevents loop when server triggers action
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const lastKnownTimeRef = useRef(0)

  // Refs for callbacks to avoid stale closures in event listeners
  const onPlayRef = useRef(onPlay)
  const onPauseRef = useRef(onPause)
  const onDurationRef = useRef(onDuration)
  const canControlRef = useRef(canControl)

  useEffect(() => { onPlayRef.current = onPlay }, [onPlay])
  useEffect(() => { onPauseRef.current = onPause }, [onPause])
  useEffect(() => { onDurationRef.current = onDuration }, [onDuration])
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

  // Handle iframe load to tell YouTube we are listening for events
  const handleIframeLoad = () => {
    console.log('[VideoPlayer] Iframe loaded')
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening' }),
        '*'
      )
    }
    // As a fallback, ensure we drop the loading screen and consider it ready
    setIsReady(true)
    setIsLoading(false)
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
      if (data.event === 'onReady' || data.event === 'initialDelivery') {
        console.log('[VideoPlayer] Player ready/initialDelivery')
        setIsReady(true)
        setIsLoading(false)
      }

      // State changes: -1 = Unstarted, 0 = Ended, 1 = Playing, 2 = Paused, 3 = Buffering, 5 = Video cued
      if (data.event === 'onStateChange') {
        console.log('[VideoPlayer] State changed to:', data.info)
        // If it's buffering (3) or unstarted (-1) or playing (1) or paused (2), ensure we drop the loading screen
        if (data.info === 3 || data.info === -1 || data.info === 5 || data.info === 1 || data.info === 2) {
          setIsLoading(false) // ALWAYS drop loading screen if we get a state change
          if (!isReady) {
            console.log('[VideoPlayer] Player ready via state change:', data.info)
            setIsReady(true)
          }
        }
        
        // If the change was triggered by a remote command, ignore it to prevent loops
        if (isRemoteRef.current) return
        
        // If user is not allowed to control, ignore local changes
        if (!canControlRef.current) return

        if (data.info === 1) {
          onPlayRef.current?.()
        } else if (data.info === 2) {
          onPauseRef.current?.(lastKnownTimeRef.current)
        }
      }

      // Track duration and current time from YouTube's regular info delivery
      if (data.event === 'infoDelivery' && data.info) {
        // Drop loading screen on infoDelivery as well as a safety net
        if (isLoading) {
          setIsLoading(false)
          setIsReady(true)
        }

        if (data.info.duration) {
          if (onDurationRef.current) onDurationRef.current(data.info.duration)
        }
        
        if (data.info.currentTime !== undefined) {
          lastKnownTimeRef.current = data.info.currentTime
          
          // Also sync local time if we're drifting
          if (canControlRef.current && !isRemoteRef.current) {
             window.dispatchEvent(new CustomEvent('yt-time-update', { detail: data.info.currentTime }))
          }
        }
        
        // Safety net: if YouTube thinks it's playing but our state thinks it's loading, drop loading screen
        if (data.info.playerState === 1 && isLoading) {
          setIsLoading(false)
          setIsReady(true)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Sync effect: Applies server state to local player
  useEffect(() => {
    if (!videoId || !isReady) return;

    console.log('[VideoPlayer] Syncing state:', videoState);
    isRemoteRef.current = true;

    if (videoState) {
        const { currentTime, playing } = videoState;

        // Only seek if the difference is significant (> 2 seconds) or we are paused
        const timeDiff = Math.abs(lastKnownTimeRef.current - currentTime);
        if (timeDiff > 2 || !playing) {
            sendCommand('seekTo', [currentTime, true]);
        }

        // Play or pause after a short delay
        setTimeout(() => {
            if (playing) {
                sendCommand('playVideo');
            } else {
                sendCommand('pauseVideo');
            }
        }, 100);
    } else {
        // If no video state, pause the video
        sendCommand('pauseVideo');
    }

    const timer = setTimeout(() => {
        isRemoteRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
}, [videoState, videoId, isReady]);

  const iframeSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&controls=0&rel=0&iv_load_policy=3&playsinline=1&modestbranding=1&origin=${encodeURIComponent(
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
            onLoad={handleIframeLoad}
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
