const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../models/db');
const { authenticateToken } = require('../middleware/auth');

// Helper to generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// REGISTER NEW USER (for 1-on-1 personal chat)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields (name, email, password) are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = db.createUser({
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword
    });

    const safeUser = db.getSafeUser(newUser);
    const token = generateToken(safeUser);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// LOGIN (for 1-on-1 personal chat)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    db.updateUserLastSeen(user.id);
    const safeUser = db.getSafeUser(user);
    const token = generateToken(safeUser);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
});

// GET CURRENT USER PROFILE
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// GET ALL USERS FOR 1-ON-1 DIRECT CHAT
router.get('/users', authenticateToken, (req, res) => {
  try {
    const allUsers = db.getSafeUsersList();
    const currentUserId = req.user.id;
    const unreadMap = db.getUnreadCount(currentUserId);

    // List all users except the logged-in user, decorated with unread count & last message
    const usersWithMeta = allUsers
      .filter(u => u.id !== currentUserId)
      .map(u => {
        const lastMsg = db.getLastMessageForPair(currentUserId, u.id);
        return {
          ...u,
          unreadCount: unreadMap[u.id] || 0,
          lastMessage: lastMsg ? {
            content: lastMsg.content,
            timestamp: lastMsg.timestamp,
            isSender: lastMsg.senderId === currentUserId
          } : null
        };
      });

    res.json({
      success: true,
      users: usersWithMeta
    });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contacts.' });
  }
});

// GET CONVERSATION HISTORY WITH A SPECIFIC CONTACT
router.get('/messages/direct/:contactId', authenticateToken, (req, res) => {
  try {
    const { contactId } = req.params;
    const currentUserId = req.user.id;

    const contact = db.findUserById(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found.' });
    }

    const messages = db.getConversation(currentUserId, contactId);
    // Mark messages from contact to current user as read
    db.markConversationAsRead(currentUserId, contactId);

    res.json({
      success: true,
      contact: db.getSafeUser(contact),
      messages
    });
  } catch (err) {
    console.error('Fetch conversation error:', err);
    res.status(500).json({ success: false, message: 'Failed to load conversation.' });
  }
});

// GET BROADCAST MESSAGES HISTORY (Public / Group broadcast)
router.get('/messages/broadcast', (req, res) => {
  try {
    const messages = db.getBroadcastMessages(100);
    res.json({
      success: true,
      messages
    });
  } catch (err) {
    console.error('Fetch broadcast messages error:', err);
    res.status(500).json({ success: false, message: 'Failed to load broadcast messages.' });
  }
});

// ==========================================
// GROUP ENDPOINTS
// ==========================================

// CREATE NEW GROUP
router.post('/groups', authenticateToken, (req, res) => {
  try {
    const { name, description, memberIds } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Group name is required.' });
    }

    const newGroup = db.createGroup({
      name: name.trim(),
      description: description || '',
      createdBy: req.user.id,
      memberIds: Array.isArray(memberIds) ? memberIds : []
    });

    res.status(201).json({
      success: true,
      message: 'Group created successfully!',
      group: newGroup
    });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ success: false, message: 'Failed to create group.' });
  }
});

// GET USER'S GROUPS
router.get('/groups', authenticateToken, (req, res) => {
  try {
    const groups = db.getUserGroups(req.user.id);
    res.json({
      success: true,
      groups
    });
  } catch (err) {
    console.error('Fetch groups error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch groups.' });
  }
});

// GET GROUP MESSAGES
router.get('/groups/:groupId/messages', authenticateToken, (req, res) => {
  try {
    const { groupId } = req.params;
    const group = db.getGroupById(groupId);

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found.' });
    }

    if (!group.memberIds.includes(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group.' });
    }

    const messages = db.getGroupMessages(groupId, 100);
    res.json({
      success: true,
      group,
      messages
    });
  } catch (err) {
    console.error('Fetch group messages error:', err);
    res.status(500).json({ success: false, message: 'Failed to load group conversation.' });
  }
});

// ==========================================
// MESSAGE DELETION ENDPOINTS
// ==========================================

// DELETE 1-ON-1 DIRECT MESSAGE
router.delete('/messages/direct/:messageId', authenticateToken, (req, res) => {
  try {
    const { messageId } = req.params;
    const deletedMsg = db.deleteDirectMessage(messageId, req.user.id);
    if (!deletedMsg) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    res.json({
      success: true,
      message: 'Direct message deleted successfully.',
      deletedMessage: deletedMsg
    });
  } catch (err) {
    res.status(403).json({ success: false, message: err.message || 'Cannot delete message.' });
  }
});

// DELETE GROUP MESSAGE
router.delete('/messages/group/:messageId', authenticateToken, (req, res) => {
  try {
    const { messageId } = req.params;
    const deletedMsg = db.deleteGroupMessage(messageId, req.user.id);
    if (!deletedMsg) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    res.json({
      success: true,
      message: 'Group message deleted successfully.',
      deletedMessage: deletedMsg
    });
  } catch (err) {
    res.status(403).json({ success: false, message: err.message || 'Cannot delete message.' });
  }
});

// DELETE BROADCAST MESSAGE
router.delete('/messages/broadcast/:messageId', (req, res) => {
  try {
    const { messageId } = req.params;
    const deletedMsg = db.deleteBroadcastMessage(messageId);
    if (!deletedMsg) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    res.json({
      success: true,
      message: 'Broadcast message deleted.',
      deletedMessage: deletedMsg
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete broadcast message.' });
  }
});

module.exports = router;
