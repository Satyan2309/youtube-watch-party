const Room = require('../models/Room')

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase()

const generateUniqueRoomId = async () => {
  let roomId
  let exists = true
  let attempts = 0
  while (exists && attempts < 10) {
    roomId = generateRoomId()
    const existing = await Room.findOne({ roomId })
    exists = !!existing
    attempts++
  }
  return roomId
}

const roomHandler = (io, socket) => {
  // CREATE ROOM
  socket.on('create_room', async (data) => {
    try {
      const { username } = data
      console.log(`[create_room] Received: username=${username}, socketId=${socket.id}`)
      
      if (!username || !username.trim()) {
        socket.emit('error', { message: 'Username required' })
        return
      }

      const roomId = await generateUniqueRoomId() 
      const userId = socket.id
      
      // Create room with participants
      const room = new Room({
        roomId,
        hostId: userId,
        participants: [{ userId, username: username.trim(), role: 'host', socketId: socket.id }],
        currentVideo: '',
        videoState: { playing: false, currentTime: 0 }
      })
      
      // Save with majority write concern
      await room.save({ w: 'majority', j: true })
      
      // Cache room data for immediate access
      if (!global.roomCache) global.roomCache = {}
      global.roomCache[roomId] = {
        _id: room._id,
        roomId: room.roomId,
        hostId: room.hostId,
        participants: [...room.participants],
        currentVideo: room.currentVideo,
        videoState: { ...room.videoState },
        createdAt: room.createdAt
      }

      socket.join(roomId)
      socket.emit('room_created', {
        success: true,
        roomId,
        userId,
        username: username.trim(),
        role: 'host',
        participants: room.participants,
        currentVideo: room.currentVideo,
        videoState: room.videoState
      })

      console.log(`[create_room] Room created: ${roomId} by ${username}`)
    } catch (error) {
      console.error('Room creation error:', error)
      socket.emit('error', { message: 'Something went wrong while creating the room. Please try again.' })
    }
  })

  // JOIN ROOM
  socket.on('join_room', async (data) => {
    try {
      const { roomId, username } = data
      console.log(`[join_room] Received: roomId=${roomId}, username=${username}, socketId=${socket.id}`)
      
      if (!roomId || !username) {
        socket.emit('error', { message: 'Room code and username are required.' })
        return
      }

      const newUserId = socket.id
      const room = await Room.findOne({ roomId })

      if (!room) {
        socket.emit('error', { message: 'Room not found. Please verify the code and try again.' })
        return
      }
      
      // Look for existing participant by USERNAME (handles reconnection with new socket.id)
      const existing = room.participants.find(p => p.username === username.trim())
      
      if (existing) {
        console.log(`[join_room] User ${username} reconnecting, updating socketId and userId`)
        // Update BOTH socketId AND userId (userId is the new socket.id)
        await Room.findOneAndUpdate(
          { roomId, 'participants.username': username.trim() },
          { $set: { 
            'participants.$.socketId': socket.id,
            'participants.$.userId': newUserId
          } }
        )
        
        // Update CACHE
        if (global.roomCache?.[roomId]) {
          const pIndex = global.roomCache[roomId].participants.findIndex(p => p.username === username.trim())
          if (pIndex !== -1) {
            global.roomCache[roomId].participants[pIndex].socketId = socket.id
            global.roomCache[roomId].participants[pIndex].userId = newUserId
          }
        }
        
        // Fetch updated room to return correct data
        const updatedRoom = await Room.findOne({ roomId })
        
        socket.join(roomId)
        console.log(`[join_room] Socket ${socket.id} joined room ${roomId}`)
        
        socket.emit('room_joined', {
          success: true, roomId, userId: newUserId,
          username: existing.username, role: existing.role,
          participants: updatedRoom.participants,
          currentVideo: updatedRoom.currentVideo,
          videoState: updatedRoom.videoState
        })
        return
      }

      // New participant joining
      console.log(`[join_room] New user ${username} joining room ${roomId}`)
      const newParticipant = { userId: newUserId, username: username.trim(), role: 'participant', socketId: socket.id }

      const updatedRoom = await Room.findOneAndUpdate(
        { roomId },
        { $push: { participants: newParticipant } },
        { new: true }
      )
      
      // Update CACHE
      if (global.roomCache?.[roomId]) {
        global.roomCache[roomId].participants.push(newParticipant)
      } else {
        // Cache miss? Fetch fresh
        const freshRoom = await Room.findOne({ roomId })
        if (freshRoom) {
          if (!global.roomCache) global.roomCache = {}
          global.roomCache[roomId] = {
            _id: freshRoom._id,
            roomId: freshRoom.roomId,
            hostId: freshRoom.hostId,
            participants: [...freshRoom.participants],
            currentVideo: freshRoom.currentVideo,
            videoState: { ...freshRoom.videoState },
            createdAt: freshRoom.createdAt
          }
        }
      }

      socket.join(roomId)
      console.log(`[join_room] Socket ${socket.id} joined room ${roomId}`)

      socket.emit('room_joined', {
        success: true, roomId, userId: newUserId,
        username: username.trim(), role: 'participant',
        participants: updatedRoom.participants,
        currentVideo: updatedRoom.currentVideo,
        videoState: updatedRoom.videoState
      })

      socket.to(roomId).emit('user_joined', {
        username: username.trim(), userId: newUserId, role: 'participant',
        participants: updatedRoom.participants
      })

      console.log(` ${username} joined room: ${roomId}`)
    } catch (error) {
      console.error('Join room error:', error)
      socket.emit('error', { message: 'Something went wrong while joining the room. Please try again.' })
    }
  })

  
  //Event 3 : LEAVE ROOM

  socket.on('leave_room', async (data) => {
    try {
      const { roomId } = data
      if (!roomId) return
      const userId = socket.id

      const room = await Room.findOne({ roomId })
      const participant = room?.participants.find(p => p.userId === userId)

      const updatedRoom = await Room.findOneAndUpdate(
        { roomId },
        { $pull: { participants: { userId } } },
        { new: true }
      )

      socket.leave(roomId)

      if (updatedRoom) {
        socket.to(roomId).emit('user_left', {
          userId,
          username: participant?.username,
          participants: updatedRoom.participants
        })
      }
    } catch (error) {
      console.error('Leave room error:', error)
    }
  })

  
  // Event 4 :DISCONNECT
  // NOTE: We should NOT remove participants on disconnect because:
  // 1. Page refresh causes disconnect/reconnect
  // 2. Navigation between pages causes disconnect/reconnect 
  // 3. Brief network issues cause disconnect/reconnect
  // Instead, we only mark them as offline and let them rejoin.
  // The leave_room event (triggered by explicit "Leave" button) handles actual removal.
 
  socket.on('disconnect', async () => {
    try {
      console.log(`[disconnect] User disconnected: ${socket.id}`)
      
      // Find rooms where this socket was participating
      const rooms = await Room.find({ 'participants.socketId': socket.id })

      for (const room of rooms) {
        const participant = room.participants.find(p => p.socketId === socket.id)
        if (!participant) continue

        console.log(`[disconnect] ${participant.username} disconnected from room ${room.roomId} - keeping in room for reconnection`)
        
        // Just notify others that user disconnected, but DON'T remove them
        // They can rejoin with the same username and regain their role
        io.to(room.roomId).emit('user_disconnected', {
          userId: socket.id,
          username: participant.username,
          message: `${participant.username} disconnected`
        })
      }
    } catch (error) {
      console.error('Disconnect cleanup error:', error)
    }
  })
}

module.exports = roomHandler
