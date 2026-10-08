# 💬 PulseChat - Realtime Node.js & Socket.IO Chat Application

A full-featured, responsive realtime chat application built with **Node.js**, **Express**, and **Socket.IO**.

The application provides two distinct conversation modes:
1. 📢 **Public Group Broadcast Room**: Anyone can enter their display name and immediately participate in the live public broadcast stream without passwords.
2. 🔒 **1-on-1 Personal Chat**: Registered users log in with their **Email ID & Password** to engage in secure, private one-to-one direct conversations.

---

## ✨ Features

- **📢 Group Broadcast Channel**:
  - Enter any nickname/display name to instantly join.
  - Live broadcast messages stream to everyone in real-time.
  - Active online member counter & real-time member drawer.
  - Real-time typing indicators ("*Alex is typing...*").
  - System announcements when members join or leave.
  - Persistent message history so new joiners see previous conversation.

- **🔒 1-on-1 Personal Direct Chat**:
  - Secure authentication: User registration & login with **Email ID** and **Password**.
  - Password hashing with `bcryptjs` and session authentication with **JWT (JSON Web Tokens)**.
  - Multi-tab and multi-device connection support per user.
  - Live online/offline status indicator badges (🟢 Online, ⚪ Offline).
  - Searchable contacts list with snippet preview of the latest message and timestamp.
  - Unread message counter badges.
  - Private messaging isolation (messages are only delivered to the sender and intended recipient).
  - Read receipts (`✓` sent, `✓✓` read).
  - 1-on-1 typing indicator ("*Bob is typing...*").

- **👥 Group Creation & Team Group Chats ("Group Make")**:
  - Authenticated users can create custom groups with a name, description, and selected member checklist.
  - Sidebar filter tabs: **All**, **1-on-1**, and **Groups**.
  - Group messages show the sender's avatar, name, and timestamp.
  - Group typing indicators for active typing members.
  - Pre-seeded with a sample group: **"🚀 Project Developers"**.

- **🗑️ Real-Time Message Deletion ("Delete for Everyone")**:
  - Hover or tap on any sent message to reveal the trash can (🗑️) button.
  - Delete messages in 1-on-1 personal chats, custom group chats, and public broadcast rooms.
  - Updates in real-time on all participants' screens to show `🚫 This message was deleted`.

- **📱 Conversation Mode & Responsive Web Design**:
  - WhatsApp / Telegram / Discord style conversational layout.
  - Glassmorphism dark slate UI with smooth gradient accents.
  - Sent vs received message styling with distinct colored bubbles and avatars.
  - Built-in quick emoji reaction bar.
  - Notification audio effects generated with the **Web Audio API** (zero external MP3 assets, guaranteed to play without broken links, with mute/unmute toggle).
  - **100% Responsive Design**:
    - **Desktop**: Split-view layout (sidebar on left, conversation on right).
    - **Mobile/Tablet**: Adaptive view with mobile back navigation button (`←`) when in a conversation.

---

## 📁 Project Structure

```
realtime node/
├── package.json               # Dependencies and scripts (start, dev, test)
├── server.js                  # Main server entry (Express + HTTP + Socket.IO)
├── config.js                  # Configuration and environment setup
├── .env                       # Environment variables (PORT, JWT_SECRET)
├── .env.example               # Example environment template
├── .gitignore                 # Git ignore rules
├── test.js                    # Automated end-to-end test suite
├── middleware/
│   └── auth.js                # Express & Socket.IO JWT verification middleware
├── models/
│   └── db.js                  # Persistent file-based data layer & seed initializer
├── routes/
│   └── authRoutes.js          # REST API endpoints (register, login, users, history)
├── socket/
│   └── socketHandler.js       # Socket.IO logic for Broadcast & 1-on-1 messaging
├── data/                      # Auto-created JSON data storage
│   ├── users.json             # Registered users (bcrypt-hashed passwords)
│   ├── direct_messages.json   # 1-to-1 conversation history
│   └── broadcast_messages.json# Group broadcast history
└── public/                    # Frontend client
    ├── index.html             # Main responsive HTML single-page app
    ├── css/
    │   └── style.css          # Responsive design & conversational styling
    └── js/
        ├── sound.js           # Web Audio API notification synthesizer
        ├── api.js             # REST API client
        ├── broadcast.js       # Broadcast room client controller
        ├── direct.js          # 1-on-1 personal chat controller
        └── main.js            # App initialization, tabs, and socket connection
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** v18+ (tested on Node.js v22.x)
- **npm**

### 2. Install Dependencies
Run the following in the project root:
```bash
npm install
```
*(On Windows PowerShell where script execution policy is restricted, use `npm.cmd install`)*

### 3. Start the Server
```bash
npm start
```
*(Or for hot-reloading development mode: `npm run dev`)*

The server will start at:
```
http://localhost:3000
```

### 4. Run Automated End-to-End Tests
You can verify the entire API and Socket.IO real-time delivery with:
```bash
npm test
```

---

## 👥 Demo Accounts (Pre-seeded)

When the server starts for the first time, demo accounts are automatically prepared for immediate testing:

| Name | Email Address | Password |
|---|---|---|
| **Alice Johnson** | `alice@example.com` | `password123` |
| **Bob Smith** | `bob@example.com` | `password123` |
| **Charlie Brown** | `charlie@example.com` | `password123` |

*(You can also click the quick demo buttons on the login screen to autofill credentials in 1 click!)*

---

## 🧪 Testing Realtime Messaging

### Test Scenario A: Public Group Broadcast
1. Open `http://localhost:3000` in a browser window.
2. Under **Group Broadcast**, enter a name (e.g. `Alex`) and click **Enter Broadcast Chat**.
3. Open another browser tab or Incognito window at `http://localhost:3000`.
4. Enter another name (e.g. `Maria`) and join.
5. Send messages between both tabs — they will appear instantaneously on both screens with live user counts and typing indicators!

### Test Scenario B: 1-on-1 Personal Chat
1. In Window 1:
   - Click the **Personal 1-on-1** tab at the top.
   - Click **Alice Johnson** demo chip (or type `alice@example.com` / `password123`) and sign in.
2. In Window 2 (Incognito or different browser):
   - Navigate to `http://localhost:3000` and switch to **Personal 1-on-1**.
   - Click **Bob Smith** demo chip (or type `bob@example.com` / `password123`) and sign in.
3. Observe:
   - In Alice's contacts list, Bob shows **🟢 Online**.
   - In Bob's contacts list, Alice shows **🟢 Online**.
4. Click on the contact to open the conversation:
   - Send a direct message from Alice to Bob.
   - Bob receives the message immediately with a sound chime.
   - When Bob reads the message, Alice's checkmark changes from `✓` to double check `✓✓`.
   - Type in the input to see the live typing indicator (`... is typing`).

---

## 🔌 API & Socket Reference

### REST API Endpoints
- `POST /api/register` - Create a new account (`name`, `email`, `password`)
- `POST /api/login` - Authenticate (`email`, `password`), returns JWT token
- `GET /api/me` - Get profile for authenticated user
- `GET /api/users` - Get contacts list with unread counters & last message
- `GET /api/messages/direct/:contactId` - Get direct conversation history
- `GET /api/messages/broadcast` - Get recent broadcast messages

### Socket.IO Events
- **Broadcast Events**:
  - `join_broadcast` / `broadcast_joined_success`
  - `send_broadcast_message` / `new_broadcast_message`
  - `broadcast_typing` / `user_broadcast_typing`
  - `broadcast_users_update`
- **1-on-1 Direct Events**:
  - `auth_direct_user` / `auth_direct_success`
  - `send_direct_message` / `new_direct_message` / `message_sent_confirm`
  - `direct_typing` / `user_direct_typing`
  - `mark_read` / `messages_marked_read`
  - `user_status_change`
