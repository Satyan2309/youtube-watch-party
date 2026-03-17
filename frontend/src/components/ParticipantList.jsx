

import { useState } from 'react'
import socket from '../socket.js'
import styles from './ParticipantList.module.css'

function ParticipantList({ participants, currentUser, roomId }) {
  const [openMenuId, setOpenMenuId] = useState(null)

  const handleAssignRole = (targetUserId, newRole) => {
    socket.emit('assign_role', { roomId, targetUserId, newRole })
    setOpenMenuId(null)
  }

  const handleRemove = (targetUserId) => {
    if (window.confirm('Are you sure you want to remove this participant from the room?')) {
      socket.emit('remove_participant', { roomId, targetUserId })
    }
    setOpenMenuId(null)
  }


  const handleTransferHost = (targetUserId, targetUsername) => {
    if (window.confirm(`Transfer host role to "${targetUsername}"? You will become a participant.`)) {
      socket.emit('transfer_host', { roomId, targetUserId })
    }
    setOpenMenuId(null)
  }

  const getBadgeClass = (role) => {
    if (role === 'host') return 'badge badge-host'
    if (role === 'moderator') return 'badge badge-moderator'
    return 'badge badge-participant'
  }

  const getRoleEmoji = (role) => {
    if (role === 'host') return '👑'
    if (role === 'moderator') return '🛡'
    return '👤'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Participants</span>
        <span className={styles.count}>{participants.length}</span>
      </div>
      <div className={styles.list}>
        {participants.map((participant) => {
          const isMe = participant.userId === currentUser?.userId
          const imHost = currentUser?.role === 'host'
          const isHost = participant.role === 'host'
          return (
            <div key={participant.userId} className={`${styles.participantRow} ${isMe ? styles.meRow : ''}`}>
              <div className={`${styles.avatar} ${styles[`avatar_${participant.role}`]}`}>
                {participant.username.charAt(0).toUpperCase()}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>
                  {participant.username}
                  {isMe && <span className={styles.meTag}> (You)</span>}
                </span>
                <span className={getBadgeClass(participant.role)}>
                  {getRoleEmoji(participant.role)} {participant.role}
                </span>
              </div>
              {imHost && !isMe && !isHost && (
                <div className={styles.menuWrapper}>
                  <button
                    className={`btn btn-icon ${styles.menuBtn}`}
                    onClick={() => setOpenMenuId(openMenuId === participant.userId ? null : participant.userId)}
                  >⋮</button>
                  {openMenuId === participant.userId && (
                    <div className={styles.dropdown}>
                      {participant.role === 'moderator' ? (
                        <button className={styles.dropdownItem} onClick={() => handleAssignRole(participant.userId, 'participant')}>
                          ↓ Demote to Participant
                        </button>
                      ) : (
                        <button className={styles.dropdownItem} onClick={() => handleAssignRole(participant.userId, 'moderator')}>
                          🛡 Make Moderator
                        </button>
                      )}
                      {/* Transfer Host — assignment requirement */}
                      <button className={styles.dropdownItem} onClick={() => handleTransferHost(participant.userId, participant.username)}>
                        👑 Transfer Host
                      </button>
                      <button className={`${styles.dropdownItem} ${styles.dropdownDanger}`} onClick={() => handleRemove(participant.userId)}>
                        ✕ Remove from Room
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {participants.length === 0 && <div className={styles.empty}>No participants yet</div>}
      </div>
    </div>
  )
}

export default ParticipantList
