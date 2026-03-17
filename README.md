# 🎬 WatchTogether — YouTube Watch Party System

A real-time YouTube watch party app. Create a room, invite friends, and watch videos in perfect sync — with role-based access control.

---

## 🌐 Live Deployment

- **Frontend (Vercel):** https://youtube-watch-party-steel.vercel.app
- **Backend (Render API):** https://youtube-watch-party-vfnq.onrender.com

---

## 🧪 Quick Test

1. Open the frontend:
   👉 https://youtube-watch-party-steel.vercel.app

2. Create a room

3. Open the same link in another tab/device

4. Join using the room code

5. Play / Pause → should sync in real-time

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
2. When Host presses Play → `play` event → server validates role → broadcasts `sync_state`  
3. All clients sync instantly with the same timestamp  
4. No polling. No refresh. Real-time experience  

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Fast, modern UI |
| Backend | Node.js + Express | Lightweight and scalable |
| Real-time | Socket.IO | Reliable WebSockets |
| Database | MongoDB Atlas | Flexible data model |
| Video | YouTube IFrame API | Embedded player |
| Deployment | Vercel + Render | Full-stack deployment |

---

## 🚀 Features

- ✅ Create / join rooms  
- ✅ Real-time sync (play, pause, seek)  
- ✅ YouTube video control  
- ✅ Role-based access (Host / Moderator / Participant)  
- ✅ Live participant list  
- ✅ Invite sharing  
- ✅ Mobile responsive  

---

## 🔗 Production URLs

- Frontend: https://youtube-watch-party-steel.vercel.app  
- Backend: https://youtube-watch-party-vfnq.onrender.com  

---

## 📡 WebSocket Events

- `create_room`
- `join_room`
- `play`, `pause`, `seek`
- `change_video`
- `assign_role`
- `sync_state`
