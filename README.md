# 🎬 WatchTogether — YouTube Watch Party System

A real-time YouTube watch party app. Create a room, invite friends, and watch videos in perfect sync — with role-based access control.

**Live Demo:** `https://your-app.onrender.com` *(update after deployment)*

---

## 🏗️ Architecture Overview

```
[Browser A]  ←──WebSocket──→  [Socket.IO Server]  ←──WebSocket──→  [Browser B]
                                      │
                               [Express REST API]
                                      │
                               [MongoDB Atlas]
```

### How WebSockets Enable Real-Time Sync

1. Every client opens a persistent WebSocket connection via Socket.IO on page load
2. When Host presses Play → `play` event → server validates role → broadcasts `sync_state` to all room members
3. All clients receive `sync_state` and call `player.playVideo()` at the same timestamp
4. No polling. No page refresh. Instant, bidirectional communication.

### Role-Based Logic (Backend)

- Every socket event handler calls `hasPermission(participant)` before processing
- `hasPermission` checks if role is `host` or `moderator` — rejects `participant`
- `assign_role` is exclusively checked for `role === 'host'`
- Roles are stored in MongoDB and re-broadcast after every change

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite (JavaScript) | Fast, component-based UI |
| Backend | Node.js + Express | Lightweight server, great WebSocket support |
| Real-time | Socket.IO | Reliable WebSockets with auto-reconnect |
| Database | MongoDB (Mongoose) | Flexible document model for room/participant data |
| Video | YouTube IFrame API | Free, controllable embedded player |
| Deployment | Render.com | Supports WebSocket servers, free tier |

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free at mongodb.com/atlas)

### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:
```
PORT=5000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:5173
```

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```
VITE_BACKEND_URL=http://localhost:5000
```

```bash
npm run dev
```

Open `http://localhost:5173`

---

## 📡 WebSocket Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `create_room` | Client→Server | `{username}` | Create new room, become Host |
| `join_room` | Client→Server | `{roomId, username}` | Join existing room |
| `leave_room` | Client→Server | `{roomId}` | Leave room |
| `play` | Client→Server | `{roomId}` | Play video (Host/Mod only) |
| `pause` | Client→Server | `{roomId, currentTime}` | Pause video (Host/Mod only) |
| `seek` | Client→Server | `{roomId, time}` | Seek to time (Host/Mod only) |
| `change_video` | Client→Server | `{roomId, videoId}` | Change video (Host/Mod only) |
| `assign_role` | Client→Server | `{roomId, targetUserId, newRole}` | Assign role (Host only) |
| `remove_participant` | Client→Server | `{roomId, targetUserId}` | Remove user (Host only) |
| `sync_state` | Server→Clients | `{playState, currentTime, videoId}` | Broadcast video state |
| `user_joined` | Server→Clients | `{username, userId, role, participants}` | New user joined |
| `user_left` | Server→Clients | `{userId, participants}` | User left |
| `role_assigned` | Server→Clients | `{userId, role, participants}` | Role was updated |
| `participant_removed` | Server→Clients | `{userId, participants}` | User was removed |
| `you_were_removed` | Server→User | `{message}` | You were kicked |

---

## 🌐 Deployment

### Option 1: Render.com (Recommended)
#### Backend
1. New Web Service → connect GitHub repo
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Environment Variables: `PORT`, `MONGODB_URI`, `CLIENT_URL`

#### Frontend
1. New Static Site → connect GitHub repo
2. Root Directory: `frontend`
3. Build Command: `npm run build`
4. Publish Directory: `dist`
5. Environment Variable: `VITE_BACKEND_URL=https://your-backend.onrender.com`

### Option 2: Railway
#### Backend
1. New Project → Deploy from GitHub repo
2. Settings → Root Directory: `backend`
3. Variables: `PORT`, `MONGODB_URI`, `CLIENT_URL`
4. Start Command: `npm start`

#### Frontend
1. New Project → Deploy from GitHub repo
2. Settings → Root Directory: `frontend`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Variables: `VITE_BACKEND_URL=https://your-backend.up.railway.app`

---

## 🎯 Features

- ✅ Create / join rooms with unique 6-character codes
- ✅ Real-time play, pause, seek synchronization
- ✅ YouTube video change (paste URL)
- ✅ Role-based access: Host / Moderator / Participant
- ✅ Host can promote participants to Moderator
- ✅ Host can remove participants
- ✅ Live participant list with roles
- ✅ Invite link copy
- ✅ Auto-disconnect handling
- ✅ Mobile responsive
