const { verifySocketToken } = require('../middleware/auth');
const db = require('../models/db');

// State trackers
// Map of userId -> Set of socketIds (for authenticated users)
const onlineDirectUsers = new Map();
// Map of socketId -> { name, id, avatarColor } (for public broadcast room)
const onlineBroadcastUsers = new Map();

function setupSocketIO(io) {
  io.on('connection', (socket) => {
    // Current socket context
    let authenticatedUser = null;
    let broadcastProfile = null;

    // ==========================================
    // 1. PUBLIC GROUP BROADCAST CHAT
    // ==========================================

    // Join broadcast room
    socket.on('join_broadcast', (data) => {
      const name = (data && data.name && data.name.trim()) ? data.name.trim() : 'Guest_' + socket.id.substring(0, 4);
      const avatarColor = data.avatarColor || '#4f46e5';

      broadcastProfile = {
        socketId: socket.id,
        name,
        avatarColor,
        joinedAt: new Date().toISOString()
      };

      onlineBroadcastUsers.set(socket.id, broadcastProfile);
      socket.join('broadcast_room');

      // Send confirmation to the joiner
      socket.emit('broadcast_joined_success', {
        profile: broadcastProfile,
        onlineCount: onlineBroadcastUsers.size,
        users: Array.from(onlineBroadcastUsers.values())
      });

      // Announce to everyone else in broadcast room
      socket.to('broadcast_room').emit('broadcast_system_announcement', {
        id: 'sys_' + Date.now(),
        type: 'system',
        content: `👋 ${name} joined the broadcast channel`,
        timestamp: new Date().toISOString()
      });

      // Update user count and member list for everyone in broadcast room
      io.to('broadcast_room').emit('broadcast_users_update', {
        onlineCount: onlineBroadcastUsers.size,
        users: Array.from(onlineBroadcastUsers.values())
      });
    });

    // Send broadcast message
    socket.on('send_broadcast_message', (data) => {
      if (!broadcastProfile) {
        return socket.emit('broadcast_error', { message: 'Please enter your name to participate in broadcast.' });
      }

      const content = (data && data.content) ? data.content.trim() : '';
      if (!content) return;

      const savedMsg = db.saveBroadcastMessage({
        senderName: broadcastProfile.name,
        senderId: broadcastProfile.socketId,
        content,
        type: 'chat'
      });

      // Broadcast to all clients in broadcast_room (including sender)
      io.to('broadcast_room').emit('new_broadcast_message', {
        ...savedMsg,
        avatarColor: broadcastProfile.avatarColor
      });
    });

    // Typing in broadcast room
    socket.on('broadcast_typing', (data) => {
      if (!broadcastProfile) return;
      socket.to('broadcast_room').emit('user_broadcast_typing', {
        socketId: socket.id,
        name: broadcastProfile.name,
        isTyping: !!data.isTyping
      });
    });

    // Delete broadcast message
    socket.on('delete_broadcast_message', ({ messageId }) => {
      if (!messageId) return;
      const deleted = db.deleteBroadcastMessage(messageId);
      if (deleted) {
        io.to('broadcast_room').emit('broadcast_message_deleted', { messageId });
      }
    });

    // Leave broadcast room explicitly
    socket.on('leave_broadcast', () => {
      handleBroadcastDisconnect(socket);
    });

    // ==========================================
    // 2. ONE-TO-ONE PERSONAL DIRECT CHAT
    // ==========================================

    // Authenticate socket for direct messaging & groups
    socket.on('auth_direct_user', (token) => {
      const user = verifySocketToken(token);
      if (!user) {
        return socket.emit('auth_error', { message: 'Invalid or expired session. Please log in again.' });
      }

      authenticatedUser = user;
      const userId = user.id;

      if (!onlineDirectUsers.has(userId)) {
        onlineDirectUsers.set(userId, new Set());
      }
      onlineDirectUsers.get(userId).add(socket.id);

      // Join user-specific socket room
      socket.join(`user_${userId}`);

      // Join all group rooms the user belongs to
      const userGroups = db.getUserGroups(userId);
      userGroups.forEach(g => {
        socket.join(`group_${g.id}`);
      });

      socket.emit('auth_direct_success', {
        user,
        onlineUserIds: Array.from(onlineDirectUsers.keys())
      });

      // Notify other users about this user coming online
      socket.broadcast.emit('user_status_change', {
        userId,
        status: 'online',
        lastSeen: new Date().toISOString()
      });
    });

    // Send 1-on-1 private message
    socket.on('send_direct_message', ({ recipientId, content }) => {
      if (!authenticatedUser) {
        return socket.emit('direct_error', { message: 'Authentication required for 1-to-1 personal chat.' });
      }

      if (!recipientId || !content || !content.trim()) {
        return socket.emit('direct_error', { message: 'Recipient and content are required.' });
      }

      const recipient = db.findUserById(recipientId);
      if (!recipient) {
        return socket.emit('direct_error', { message: 'Recipient user does not exist.' });
      }

      const savedMsg = db.saveDirectMessage({
        senderId: authenticatedUser.id,
        recipientId,
        senderName: authenticatedUser.name,
        content: content.trim()
      });

      // Send to recipient
      io.to(`user_${recipientId}`).emit('new_direct_message', {
        ...savedMsg,
        senderAvatarColor: authenticatedUser.avatarColor
      });

      // Send confirmation to sender
      io.to(`user_${authenticatedUser.id}`).emit('message_sent_confirm', savedMsg);
    });

    // Delete 1-on-1 private message
    socket.on('delete_direct_message', ({ messageId, contactId }) => {
      if (!authenticatedUser || !messageId) return;
      try {
        const deletedMsg = db.deleteDirectMessage(messageId, authenticatedUser.id);
        if (deletedMsg) {
          // Notify both sender and recipient
          io.to(`user_${authenticatedUser.id}`).emit('direct_message_deleted', {
            messageId,
            contactId: deletedMsg.recipientId
          });
          io.to(`user_${deletedMsg.recipientId}`).emit('direct_message_deleted', {
            messageId,
            contactId: authenticatedUser.id
          });
        }
      } catch (err) {
        socket.emit('direct_error', { message: err.message });
      }
    });

    // Typing indicator in 1-on-1 chat
    socket.on('direct_typing', ({ recipientId, isTyping }) => {
      if (!authenticatedUser || !recipientId) return;
      io.to(`user_${recipientId}`).emit('user_direct_typing', {
        senderId: authenticatedUser.id,
        senderName: authenticatedUser.name,
        isTyping: !!isTyping
      });
    });

    // Mark messages as read
    socket.on('mark_read', ({ contactId }) => {
      if (!authenticatedUser || !contactId) return;
      const updated = db.markConversationAsRead(authenticatedUser.id, contactId);
      if (updated) {
        io.to(`user_${contactId}`).emit('messages_marked_read', {
          readerId: authenticatedUser.id
        });
      }
    });

    // ==========================================
    // 3. CUSTOM GROUPS & GROUP MESSAGING
    // ==========================================

    // Create group via socket
    socket.on('create_group', ({ name, description, memberIds }) => {
      if (!authenticatedUser) return;
      try {
        const newGroup = db.createGroup({
          name,
          description,
          createdBy: authenticatedUser.id,
          memberIds
        });

        // Add creator socket to the new group room
        socket.join(`group_${newGroup.id}`);

        // Add any currently online members' sockets to this group room and notify them
        newGroup.memberIds.forEach(memberId => {
          if (onlineDirectUsers.has(memberId)) {
            const socketIds = onlineDirectUsers.get(memberId);
            socketIds.forEach(sId => {
              const s = io.sockets.sockets.get(sId);
              if (s) s.join(`group_${newGroup.id}`);
            });
          }
          // Notify member about the new group
          io.to(`user_${memberId}`).emit('group_created', { group: newGroup });
        });
      } catch (err) {
        socket.emit('direct_error', { message: 'Failed to create group: ' + err.message });
      }
    });

    // Send group message
    socket.on('send_group_message', ({ groupId, content }) => {
      if (!authenticatedUser || !groupId || !content || !content.trim()) return;

      const group = db.getGroupById(groupId);
      if (!group || !group.memberIds.includes(authenticatedUser.id)) {
        return socket.emit('direct_error', { message: 'You are not a member of this group.' });
      }

      const savedMsg = db.saveGroupMessage({
        groupId,
        senderId: authenticatedUser.id,
        senderName: authenticatedUser.name,
        content: content.trim()
      });

      // Broadcast to everyone in this group
      io.to(`group_${groupId}`).emit('new_group_message', {
        ...savedMsg,
        senderAvatarColor: authenticatedUser.avatarColor
      });
    });

    // Delete group message
    socket.on('delete_group_message', ({ messageId, groupId }) => {
      if (!authenticatedUser || !messageId) return;
      try {
        const deletedMsg = db.deleteGroupMessage(messageId, authenticatedUser.id);
        if (deletedMsg) {
          io.to(`group_${deletedMsg.groupId}`).emit('group_message_deleted', {
            messageId,
            groupId: deletedMsg.groupId
          });
        }
      } catch (err) {
        socket.emit('direct_error', { message: err.message });
      }
    });

    // Group typing indicator
    socket.on('group_typing', ({ groupId, isTyping }) => {
      if (!authenticatedUser || !groupId) return;
      socket.to(`group_${groupId}`).emit('user_group_typing', {
        groupId,
        senderId: authenticatedUser.id,
        senderName: authenticatedUser.name,
        isTyping: !!isTyping
      });
    });

    // Check online status of users
    socket.on('get_online_users', () => {
      socket.emit('online_users_list', Array.from(onlineDirectUsers.keys()));
    });

    // User logout
    socket.on('logout_direct_user', () => {
      handleDirectDisconnect(socket, authenticatedUser);
      authenticatedUser = null;
    });

    // ==========================================
    // 4. DISCONNECT CLEANUP
    // ==========================================
    socket.on('disconnect', () => {
      handleBroadcastDisconnect(socket);
      handleDirectDisconnect(socket, authenticatedUser);
    });
  });

  function handleBroadcastDisconnect(socket) {
    if (onlineBroadcastUsers.has(socket.id)) {
      const user = onlineBroadcastUsers.get(socket.id);
      onlineBroadcastUsers.delete(socket.id);

      socket.to('broadcast_room').emit('broadcast_system_announcement', {
        id: 'sys_' + Date.now(),
        type: 'system',
        content: `👋 ${user.name} left the broadcast channel`,
        timestamp: new Date().toISOString()
      });

      io.to('broadcast_room').emit('broadcast_users_update', {
        onlineCount: onlineBroadcastUsers.size,
        users: Array.from(onlineBroadcastUsers.values())
      });
    }
  }

  function handleDirectDisconnect(socket, user) {
    if (!user) return;
    const userId = user.id;

    if (onlineDirectUsers.has(userId)) {
      const socketSet = onlineDirectUsers.get(userId);
      socketSet.delete(socket.id);

      // If user has no more open tabs/connections, mark offline
      if (socketSet.size === 0) {
        onlineDirectUsers.delete(userId);
        db.updateUserLastSeen(userId);
        socket.broadcast.emit('user_status_change', {
          userId,
          status: 'offline',
          lastSeen: new Date().toISOString()
        });
      }
    }
  }
}

module.exports = setupSocketIO;
