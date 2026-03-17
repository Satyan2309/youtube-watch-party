import { useState, useEffect, useRef } from 'react'
import socket from '../socket.js'
import styles from './Chat.module.css'

const formatMsgTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function Chat({ roomId, currentUser, messages }) {
  const [inputText, setInputText] = useState('')  
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!inputText.trim()) return
    
    // Check socket connection before emitting
    if (!socket.connected) {
      console.warn('[Chat] Socket not connected, cannot send message')
      return
    }
    
    console.log('[Chat] Sending message:', { roomId, message: inputText.trim() })
    socket.emit('send_message', { roomId, message: inputText.trim() })
    setInputText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>Chat</span>
        <span className={styles.msgCount}>{messages.length}</span>
      </div>

      {/* Messages */}
      <div className={styles.messagesList}>
        {messages.length === 0 && (
          <div className={styles.emptyChat}>
            <span className={styles.emptyChatIcon}>💬</span>
            <p>No messages yet</p>
            <p className={styles.emptyChatHint}>Say hello!</p>
          </div>
        )}

        {messages.map((msg, index) => {
          const isMe = msg.userId === currentUser?.userId
          const prevMsg = messages[index - 1]
          const showAvatar = !prevMsg || prevMsg.userId !== msg.userId

          return (
            <div
              key={`${msg.timestamp}-${index}`}
              className={`${styles.messageRow} ${isMe ? styles.myMessage : ''}`}
            >
              {!isMe && showAvatar && (
                <div className={`${styles.msgAvatar} ${styles[`avatar_${msg.role}`]}`}>
                  {msg.username.charAt(0).toUpperCase()}
                </div>
              )}
              {!isMe && !showAvatar && <div className={styles.msgAvatarPlaceholder} />}

              <div className={styles.msgContent}>
                {!isMe && showAvatar && (
                  <span className={styles.msgUsername}>
                    {msg.username}
                    {msg.role === 'host' && <span className={styles.hostTag}> 👑</span>}
                    {msg.role === 'moderator' && <span className={styles.modTag}> 🛡</span>}
                  </span>
                )}
                <div className={styles.msgBubble}>
                  <span className={styles.msgText}>{msg.message}</span>
                  <span className={styles.msgTime}>{formatMsgTime(msg.timestamp)}</span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.chatInput}>
        <input
          className={styles.msgInput}
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          autoComplete="off"
        />
        <button className={styles.sendBtn} onClick={handleSend} disabled={!inputText.trim()}>
          ↑
        </button>
      </div>
    </div>
  )
}

export default Chat
