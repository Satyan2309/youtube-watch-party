const mongoose = require('mongoose')

const useMemory = !process.env.MONGODB_URI || process.env.USE_MEMORY_DB === 'true'

if (!useMemory) {
  const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true, index: true },
    hostId: { type: String, required: true },
    participants: [
      {
        userId: { type: String, required: true },
        username: { type: String, required: true },
        role: { type: String, enum: ['host', 'moderator', 'participant'], default: 'participant' },
        socketId: String
      }
    ],
    currentVideo: { type: String, default: '' },
    videoState: {
      playing: { type: Boolean, default: false },
      currentTime: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
  })
  module.exports = mongoose.model('Room', roomSchema)
} else {
  const rooms = new Map()

  const clone = (obj) => JSON.parse(JSON.stringify(obj))
  const matches = (doc, query) => {
    for (const [k, v] of Object.entries(query)) {
      if (typeof v === 'object' && v !== null) {
        if (k.includes('.')) {
          const [root, sub] = k.split('.')
          if (!Array.isArray(doc[root])) return false
          if (!doc[root].some((item) => item[sub] === v)) return false
        } else {
          if (doc[k] !== v) return false
        }
      } else {
        if (doc[k] !== v) return false
      }
    }
    return true
  }

  class Room {
    constructor(data) {
      Object.assign(this, data)
      this._id = this._id || Math.random().toString(36).slice(2)
      this.createdAt = this.createdAt || new Date()
    }

    async save() {
      rooms.set(this.roomId, clone(this))
      return this
    }

    static get collection() {
      return {
        async createIndex() {}
      }
    }

    static async findOne(query) {
      if (query.roomId) {
        const doc = rooms.get(query.roomId)
        return doc ? clone(doc) : null
      }
      for (const doc of rooms.values()) {
        if (matches(doc, query)) return clone(doc)
      }
      return null
    }

    static async find(query) {
      const out = []
      for (const doc of rooms.values()) {
        if (matches(doc, query)) out.push(clone(doc))
      }
      return out
    }

    static async findOneAndUpdate(filter, update, options = {}) {
      const doc = await Room.findOne(filter)
      if (!doc) return null

      // $set, $push, $pull supported
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) {
          const path = k.split('.')
          let target = doc
          for (let i = 0; i < path.length - 1; i++) {
            target = target[path[i]]
          }
          target[path[path.length - 1]] = v
        }
      }
      if (update.$push) {
        for (const [k, v] of Object.entries(update.$push)) {
          if (!Array.isArray(doc[k])) doc[k] = []
          doc[k].push(v)
        }
      }
      if (update.$pull) {
        for (const [k, v] of Object.entries(update.$pull)) {
          if (Array.isArray(doc[k])) {
            doc[k] = doc[k].filter((item) => {
              for (const [kk, vv] of Object.entries(v)) {
                if (item[kk] === vv) return false
              }
              return true
            })
          }
        }
      }
      // direct set e.g., { currentVideo: ..., 'videoState.playing': false }
      for (const [k, v] of Object.entries(update)) {
        if (k.startsWith('$')) continue
        const path = k.split('.')
        let target = doc
        for (let i = 0; i < path.length - 1; i++) {
          target = target[path[i]]
        }
        target[path[path.length - 1]] = v
      }

      rooms.set(doc.roomId, clone(doc))
      return options.new ? clone(doc) : null
    }

    static async deleteMany() {
      rooms.clear()
    }
  }

  module.exports = Room
}
