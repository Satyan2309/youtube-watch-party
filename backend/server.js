require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const connectDB = require('./config/database')
const roomHandler = require('./socket/roomHandler')
const videoHandler = require('./socket/videoHandler')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

const cors = require('cors');

app.use(cors({
  origin: "https://youtube-watch-party-steel.vercel.app", 
  credentials: true
}));
app.use(express.json())

// Start server only after DB is connected
connectDB().then(async () => {
  // Clean up duplicate rooms on startup
  const Room = require('./models/Room')
  try {
    // Drop all existing rooms to ensure clean state (remove this in production)
    await Room.deleteMany({})
    console.log('[Startup] Cleaned old rooms')
    
    // Ensure unique index on roomId
    await Room.collection.createIndex({ roomId: 1 }, { unique: true, background: true })
    console.log('[Startup] Ensured unique index on roomId')
  } catch (err) {
    console.log('[Startup] Index setup:', err.message)
  }
  
  // NOW start listening for socket connections (after DB is ready)
  io.on('connection', (socket) => {
    console.log(` New user connected: ${socket.id}`)
    roomHandler(io, socket)
    videoHandler(io, socket)
    socket.on('disconnect', () => console.log(` User disconnected: ${socket.id}`))
  })
  
  console.log('[Startup] Socket.IO handlers registered')
})

app.get('/', (req, res) => res.json({ message: 'Watch Party backend is running.' }))

// DEV ONLY: Clear all rooms (remove in production)
app.delete('/api/rooms/clear', async (req, res) => {
  try {
    const Room = require('./models/Room')
    await Room.deleteMany({})
    console.log('[API] All rooms cleared')
    res.json({ success: true, message: 'All rooms cleared' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear rooms' })
  }
})

app.get('/api/room/:roomId', async (req, res) => {
  try {
    const Room = require('./models/Room')
    const room = await Room.findOne({ roomId: req.params.roomId })
    if (!room) {
      return res
        .status(404)
        .json({ exists: false, message: 'Room not found. Please check the code and try again.' })
    }
    res.json({
      exists: true,
      roomId: room.roomId,
      participantCount: room.participants.length
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(` Server listening on the  ${PORT} `)
})
