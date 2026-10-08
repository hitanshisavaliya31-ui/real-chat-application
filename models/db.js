const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

// Helpers for read/write
function readJSON(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultVal;
  }
}

function writeJSON(filePath, data) {
  try {
    // Write atomically via temporary file to prevent corruption
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// Avatar color palette generator
const AVATAR_COLORS = [
  '#4f46e5', '#2563eb', '#0284c7', '#0d9488',
  '#059669', '#16a34a', '#d97706', '#dc2626',
  '#db2777', '#7c3aed', '#9333ea', '#475569'
];

function getRandomColor(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

// Ensure database files exist as empty arrays
function ensureFilesExist() {
  readJSON(config.USERS_FILE, []);
  readJSON(config.BROADCAST_MSGS_FILE, []);
  readJSON(config.DIRECT_MSGS_FILE, []);
  readJSON(config.GROUPS_FILE, []);
  readJSON(config.GROUP_MSGS_FILE, []);
}

ensureFilesExist();

// Repository layer
const db = {
  // ==========================================
  // USERS
  // ==========================================
  getAllUsers() {
    return readJSON(config.USERS_FILE, []);
  },

  findUserByEmail(email) {
    const users = this.getAllUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  findUserById(id) {
    const users = this.getAllUsers();
    return users.find(u => u.id === id);
  },

  createUser(userData) {
    const users = this.getAllUsers();
    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: userData.email.toLowerCase().trim(),
      name: userData.name.trim(),
      password: userData.password,
      avatarColor: getRandomColor(userData.email),
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    users.push(newUser);
    writeJSON(config.USERS_FILE, users);
    return newUser;
  },

  updateUserLastSeen(userId) {
    const users = this.getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users[index].lastSeen = new Date().toISOString();
      writeJSON(config.USERS_FILE, users);
    }
  },

  getSafeUser(user) {
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
  },

  getSafeUsersList() {
    return this.getAllUsers().map(this.getSafeUser);
  },

  // ==========================================
  // BROADCAST MESSAGES
  // ==========================================
  getBroadcastMessages(limit = 100) {
    const msgs = readJSON(config.BROADCAST_MSGS_FILE, []);
    return msgs.slice(-limit);
  },

  saveBroadcastMessage(message) {
    const msgs = readJSON(config.BROADCAST_MSGS_FILE, []);
    const newMsg = {
      id: 'bcast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      senderName: message.senderName || 'Anonymous',
      senderId: message.senderId || null,
      content: message.content,
      timestamp: new Date().toISOString(),
      type: message.type || 'chat',
      deleted: false
    };
    msgs.push(newMsg);
    const trimmed = msgs.slice(-300);
    writeJSON(config.BROADCAST_MSGS_FILE, trimmed);
    return newMsg;
  },

  deleteBroadcastMessage(messageId) {
    const msgs = readJSON(config.BROADCAST_MSGS_FILE, []);
    const index = msgs.findIndex(m => m.id === messageId);
    if (index === -1) return null;

    msgs[index].deleted = true;
    msgs[index].content = '🚫 This message was deleted';
    msgs[index].deletedAt = new Date().toISOString();
    writeJSON(config.BROADCAST_MSGS_FILE, msgs);
    return msgs[index];
  },

  // ==========================================
  // DIRECT MESSAGES (1-to-1)
  // ==========================================
  getConversation(user1Id, user2Id) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    return allMsgs.filter(m => 
      (m.senderId === user1Id && m.recipientId === user2Id) ||
      (m.senderId === user2Id && m.recipientId === user1Id)
    );
  },

  saveDirectMessage({ senderId, recipientId, senderName, content }) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    const newMsg = {
      id: 'dm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      senderId,
      recipientId,
      senderName,
      content,
      timestamp: new Date().toISOString(),
      read: false,
      deleted: false
    };
    allMsgs.push(newMsg);
    writeJSON(config.DIRECT_MSGS_FILE, allMsgs);
    return newMsg;
  },

  deleteDirectMessage(messageId, requesterUserId) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    const index = allMsgs.findIndex(m => m.id === messageId);
    if (index === -1) return null;

    const msg = allMsgs[index];
    // Only the sender can delete their message
    if (msg.senderId !== requesterUserId) {
      throw new Error('Unauthorized to delete this message.');
    }

    msg.deleted = true;
    msg.content = '🚫 This message was deleted';
    msg.deletedAt = new Date().toISOString();
    writeJSON(config.DIRECT_MSGS_FILE, allMsgs);
    return msg;
  },

  markConversationAsRead(readerId, senderId) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    let updated = false;
    allMsgs.forEach(m => {
      if (m.senderId === senderId && m.recipientId === readerId && !m.read) {
        m.read = true;
        updated = true;
      }
    });
    if (updated) {
      writeJSON(config.DIRECT_MSGS_FILE, allMsgs);
    }
    return updated;
  },

  getUnreadCount(userId) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    const unreadMap = {};
    allMsgs.forEach(m => {
      if (m.recipientId === userId && !m.read && !m.deleted) {
        unreadMap[m.senderId] = (unreadMap[m.senderId] || 0) + 1;
      }
    });
    return unreadMap;
  },

  getLastMessageForPair(user1Id, user2Id) {
    const allMsgs = readJSON(config.DIRECT_MSGS_FILE, []);
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      const m = allMsgs[i];
      if (
        (m.senderId === user1Id && m.recipientId === user2Id) ||
        (m.senderId === user2Id && m.recipientId === user1Id)
      ) {
        return m;
      }
    }
    return null;
  },

  // ==========================================
  // GROUPS & GROUP MESSAGES
  // ==========================================
  getAllGroups() {
    return readJSON(config.GROUPS_FILE, []);
  },

  getGroupById(groupId) {
    const groups = this.getAllGroups();
    return groups.find(g => g.id === groupId);
  },

  getUserGroups(userId) {
    const groups = this.getAllGroups();
    const groupMsgs = readJSON(config.GROUP_MSGS_FILE, []);
    const allUsers = this.getAllUsers();

    // Filter groups where the user is a member
    return groups
      .filter(g => Array.isArray(g.memberIds) && g.memberIds.includes(userId))
      .map(g => {
        // Find last message for group
        let lastMsg = null;
        for (let i = groupMsgs.length - 1; i >= 0; i--) {
          if (groupMsgs[i].groupId === g.id) {
            lastMsg = groupMsgs[i];
            break;
          }
        }

        // Hydrate members safe info
        const members = (g.memberIds || [])
          .map(mid => allUsers.find(u => u.id === mid))
          .filter(Boolean)
          .map(u => this.getSafeUser(u));

        return {
          ...g,
          membersCount: g.memberIds.length,
          members,
          lastMessage: lastMsg ? {
            content: lastMsg.content,
            senderName: lastMsg.senderName,
            timestamp: lastMsg.timestamp,
            deleted: !!lastMsg.deleted
          } : null
        };
      });
  },

  createGroup({ name, description = '', createdBy, memberIds = [] }) {
    const groups = this.getAllGroups();
    const safeMembers = Array.from(new Set([createdBy, ...memberIds]));

    const newGroup = {
      id: 'grp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: name.trim(),
      description: description.trim(),
      createdBy,
      adminIds: [createdBy],
      memberIds: safeMembers,
      avatarColor: getRandomColor(name),
      createdAt: new Date().toISOString()
    };

    groups.push(newGroup);
    writeJSON(config.GROUPS_FILE, groups);

    // Add creation system message
    const creator = this.findUserById(createdBy);
    const creatorName = creator ? creator.name : 'A member';
    const groupMsgs = readJSON(config.GROUP_MSGS_FILE, []);
    const sysMsg = {
      id: 'gmsg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      groupId: newGroup.id,
      senderId: 'system',
      senderName: 'System',
      content: `🎉 ${creatorName} created group "${newGroup.name}" with ${safeMembers.length} members.`,
      timestamp: new Date().toISOString(),
      type: 'system',
      deleted: false
    };
    groupMsgs.push(sysMsg);
    writeJSON(config.GROUP_MSGS_FILE, groupMsgs);

    return newGroup;
  },

  getGroupMessages(groupId, limit = 100) {
    const allMsgs = readJSON(config.GROUP_MSGS_FILE, []);
    return allMsgs.filter(m => m.groupId === groupId).slice(-limit);
  },

  saveGroupMessage({ groupId, senderId, senderName, content }) {
    const allMsgs = readJSON(config.GROUP_MSGS_FILE, []);
    const newMsg = {
      id: 'gmsg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      groupId,
      senderId,
      senderName,
      content,
      timestamp: new Date().toISOString(),
      type: 'chat',
      deleted: false
    };
    allMsgs.push(newMsg);
    writeJSON(config.GROUP_MSGS_FILE, allMsgs);
    return newMsg;
  },

  deleteGroupMessage(messageId, requesterUserId) {
    const allMsgs = readJSON(config.GROUP_MSGS_FILE, []);
    const index = allMsgs.findIndex(m => m.id === messageId);
    if (index === -1) return null;

    const msg = allMsgs[index];
    const group = this.getGroupById(msg.groupId);

    // Can delete if sender OR group admin
    const isAdmin = group && Array.isArray(group.adminIds) && group.adminIds.includes(requesterUserId);
    if (msg.senderId !== requesterUserId && !isAdmin) {
      throw new Error('Unauthorized to delete this group message.');
    }

    msg.deleted = true;
    msg.content = '🚫 This message was deleted';
    msg.deletedAt = new Date().toISOString();
    writeJSON(config.GROUP_MSGS_FILE, allMsgs);
    return msg;
  }
};

module.exports = db;
