const Room = require('../models/Room')

const hasPermission = (participant) =>
  participant.role === 'host' || participant.role === 'moderator'

const videoHandler = (io, socket) => {
  // PLAY
  socket.on('play', async (data) => {
    try {
      const { roomId } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const participant = room.participants.find(p => p.socketId === socket.id)
      if (!participant) return

      if (!hasPermission(participant)) {
        socket.emit('error', { message: 'Only Host/Moderator can play or pause!' })
        return
      }

      await Room.findOneAndUpdate({ roomId }, { 'videoState.playing': true })

      io.to(roomId).emit('sync_state', {
        playState: 'playing',
        currentTime: room.videoState.currentTime,
        videoId: room.currentVideo
      })
    } catch (error) {
      console.error('Play error:', error)
    }
  })

  // PAUSE
  socket.on('pause', async (data) => {
    try {
      const { roomId, currentTime } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const participant = room.participants.find(p => p.socketId === socket.id)
      if (!participant) return

      if (!hasPermission(participant)) {
        socket.emit('error', { message: 'Only Host/Moderator can play or pause!' })
        return
      }

      await Room.findOneAndUpdate(
        { roomId },
        { 'videoState.playing': false, 'videoState.currentTime': currentTime }
      )

      io.to(roomId).emit('sync_state', {
        playState: 'paused',
        currentTime,
        videoId: room.currentVideo
      })
    } catch (error) {
      console.error('Pause error:', error)
    }
  })

  // SEEK
  socket.on('seek', async (data) => {
    try {
      const { roomId, time } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const participant = room.participants.find(p => p.socketId === socket.id)
      if (!participant) return

      if (!hasPermission(participant)) {
        socket.emit('error', { message: 'Only the host or a moderator can seek in the video.' })
        return
      }

      await Room.findOneAndUpdate({ roomId }, { 'videoState.currentTime': time })

      io.to(roomId).emit('sync_state', {
        playState: room.videoState.playing ? 'playing' : 'paused',
        currentTime: time,
        videoId: room.currentVideo
      })
    } catch (error) {
      console.error('Seek error:', error)
    }
  })

  // CHANGE VIDEO
  socket.on('change_video', async (data) => {
    try {
      const { roomId, videoId } = data
      console.log(`[change_video] Received: roomId=${roomId}, videoId=${videoId}, socketId=${socket.id}`)
      
      // First check cache (avoids MongoDB replication lag)
      let room = global.roomCache?.[roomId]
      if (room) {
        console.log(`[change_video] Using cached room data, participants: ${room.participants.length}`)
      } else {
        // Fallback to database
        room = await Room.findOne({ roomId })
        console.log(`[change_video] Room from DB, participants: ${room?.participants?.length || 0}`)
      }
      
      if (!room) {
        console.log(`[change_video] Room not found: ${roomId}`)
        socket.emit('error', { message: 'Room not found.' })
        return
      }

      console.log(`[change_video] Looking for socketId ${socket.id} in ${room.participants.length} participants`)
      
      const participant = room.participants.find(p => p.socketId === socket.id)
      if (!participant) {
        console.log(`[change_video] Participant not found for socketId: ${socket.id}`)
        console.log(`[change_video] Available participants:`, room.participants.map(p => ({ socketId: p.socketId, name: p.username })))
        socket.emit('error', { message: 'You are not in this room. Please refresh the page.' })
        return
      }

      if (!hasPermission(participant)) {
        console.log(`[change_video] Permission denied for ${participant.username} (role: ${participant.role})`)
        socket.emit('error', { message: 'Only Host/Moderator can change video!' })
        return
      }

      // Update database
      await Room.findOneAndUpdate(
        { roomId },
        { currentVideo: videoId, 'videoState.playing': false, 'videoState.currentTime': 0 }
      )
      
      // Update cache
      if (global.roomCache?.[roomId]) {
        global.roomCache[roomId].currentVideo = videoId
        global.roomCache[roomId].videoState = { playing: false, currentTime: 0 }
      }

      console.log(`[change_video] Broadcasting sync_state with videoId: ${videoId}`)
      console.log(`[change_video] Socket.IO rooms in this server:`, Array.from(io.sockets.adapter.rooms.keys()))
      console.log(`[change_video] Broadcasting to room: ${roomId}`)
      
      io.to(roomId).emit('sync_state', {
        playState: 'paused',
        currentTime: 0,
        videoId
      })
      
      console.log(`[change_video] Broadcast complete`)
    } catch (error) {
      console.error('Change video error:', error)
      socket.emit('error', { message: 'Failed to change video. Please try again.' })
    }
  })

  // ASSIGN ROLE
  socket.on('assign_role', async (data) => {
    try {
      const { roomId, targetUserId, newRole } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const requester = room.participants.find(p => p.socketId === socket.id)
      if (!requester) return

      if (requester.role !== 'host') {
        socket.emit('error', { message: 'Only the host can assign roles.' })
        return
      }
      if (!['moderator', 'participant'].includes(newRole)) {
        socket.emit('error', { message: 'Selected role is not valid.' })
        return
      }

      await Room.findOneAndUpdate(
        { roomId, 'participants.userId': targetUserId },
        { $set: { 'participants.$.role': newRole } }
      )
      
      // Update cache
      if (global.roomCache?.[roomId]) {
        const pIndex = global.roomCache[roomId].participants.findIndex(p => p.userId === targetUserId)
        if (pIndex !== -1) {
          global.roomCache[roomId].participants[pIndex].role = newRole
        }
      }

      const updatedRoom = await Room.findOne({ roomId })

      io.to(roomId).emit('role_assigned', {
        userId: targetUserId,
        role: newRole,
        participants: updatedRoom.participants
      })
    } catch (error) {
      console.error('Assign role error:', error)
    }
  })


  // REMOVE PARTICIPANT
  socket.on('remove_participant', async (data) => {
    try {
      const { roomId, targetUserId } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const requester = room.participants.find(p => p.socketId === socket.id)
      if (!requester) return

      if (requester.role !== 'host') {
        socket.emit('error', { message: 'Only the host can remove participants.' })
        return
      }

      const target = room.participants.find(p => p.userId === targetUserId)
      if (!target) return

      const updatedRoom = await Room.findOneAndUpdate(
        { roomId },
        { $pull: { participants: { userId: targetUserId } } },
        { new: true }
      )
      
      // Update cache
      if (global.roomCache?.[roomId]) {
        global.roomCache[roomId].participants = global.roomCache[roomId].participants.filter(p => p.userId !== targetUserId)
      }

      if (target.socketId) {
        io.to(target.socketId).emit('you_were_removed', {
          message: 'You have been removed from this room by the host.'
        })
      }

      io.to(roomId).emit('participant_removed', {
        userId: targetUserId,
        participants: updatedRoom.participants
      })
    } catch (error) {
      console.error('Remove participant error:', error)
    }
  })

  // TRANSFER HOST
  socket.on('transfer_host', async (data) => {
    try {
      const { roomId, targetUserId } = data
      const room = await Room.findOne({ roomId })
      if (!room) return

      const requester = room.participants.find(p => p.socketId === socket.id)
      if (!requester) return

      if (requester.role !== 'host') {
        socket.emit('error', { message: 'Only the current host can transfer the host role.' })
        return
      }

      if (targetUserId === socket.id) {
        socket.emit('error', { message: 'Host role cannot be transferred to yourself.' })
        return
      }

      const target = room.participants.find(p => p.userId === targetUserId)
      if (!target) {
        socket.emit('error', { message: 'Target participant was not found in this room.' })
        return
      }

      await Room.findOneAndUpdate(
        { roomId, 'participants.userId': requester.userId },
        { $set: { 'participants.$.role': 'participant' } }
      )

      await Room.findOneAndUpdate(
        { roomId, 'participants.userId': targetUserId },
        {
          $set: {
            'participants.$.role': 'host',
            hostId: targetUserId           
          }
        }
      )
      
      // Update cache
      if (global.roomCache?.[roomId]) {
        const prevHostIdx = global.roomCache[roomId].participants.findIndex(p => p.userId === requester.userId)
        if (prevHostIdx !== -1) global.roomCache[roomId].participants[prevHostIdx].role = 'participant'
        
        const newHostIdx = global.roomCache[roomId].participants.findIndex(p => p.userId === targetUserId)
        if (newHostIdx !== -1) global.roomCache[roomId].participants[newHostIdx].role = 'host'
        
        global.roomCache[roomId].hostId = targetUserId
      }

      const updatedRoom = await Room.findOne({ roomId })

      io.to(roomId).emit('host_transferred', {
        previousHostId: requester.userId,
        newHostId: targetUserId,
        newHostUsername: target.username,
        participants: updatedRoom.participants
      })

    } catch (error) {
      console.error('Transfer host error:', error)
    }
  })


  // CHAT MESSAGE
  socket.on('send_message', async (data) => {
    try {
      const { roomId, message } = data
      console.log(`[send_message] Received: roomId=${roomId}, message="${message}", socketId=${socket.id}`)
      
      if (!message || !message.trim()) {
        console.log(`[send_message] Empty message, ignoring`)
        return
      }

      // First check cache
      let room = global.roomCache?.[roomId]
      if (room) {
        console.log(`[send_message] Using cached room data, participants: ${room.participants.length}`)
      } else {
        // Fallback to database
        room = await Room.findOne({ roomId })
        console.log(`[send_message] Room from DB, participants: ${room?.participants?.length || 0}`)
      }
      
      if (!room) {
        console.log(`[send_message] Room not found: ${roomId}`)
        socket.emit('error', { message: 'Room not found.' })
        return
      }

      const sender = room.participants.find(p => p.socketId === socket.id)
      if (!sender) {
        console.log(`[send_message] Sender not found for socketId: ${socket.id}`)
        console.log(`[send_message] Available participants:`, room.participants.map(p => ({ socketId: p.socketId, name: p.username })))
        socket.emit('error', { message: 'You are not in this room. Please refresh the page.' })
        return
      }

      const cleanMessage = message.trim().substring(0, 500)

      console.log(`[send_message] Broadcasting new_message from ${sender.username}`)
      io.to(roomId).emit('new_message', {
        userId: sender.userId,
        username: sender.username,
        role: sender.role,
        message: cleanMessage,
        timestamp: Date.now()
      })

    } catch (error) {
      console.error('Chat message error:', error)
      socket.emit('error', { message: 'Failed to send message. Please try again.' })
    }
  })
}

module.exports = videoHandler
