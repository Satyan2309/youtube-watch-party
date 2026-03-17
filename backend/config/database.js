const mongoose = require('mongoose')

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI
    if (uri && uri.trim() !== '') {
      const conn = await mongoose.connect(uri)
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
      return
    }

    console.log('ℹ️ No MONGODB_URI provided — running with in‑memory Room model. Skipping DB connection.')
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`)
    process.exit(1)
  }
}

module.exports = connectDB
