// 1-on-1 Personal Chat and Group Chat Controller
class DirectChatController {
  constructor() {
    this.currentUser = null;
    this.contacts = [];
    this.groups = [];
    this.activeChat = null; // { type: 'direct' | 'group', data: contact | group }
    this.onlineUserIds = new Set();
    this.typingTimeout = null;
    this.activeFilter = 'all'; // 'all' | 'direct' | 'groups'

    // DOM Elements - Auth
    this.authOverlay = document.getElementById('directAuthOverlay');
    this.appLayout = document.getElementById('directAppLayout');
    this.authTabLogin = document.getElementById('authTabLogin');
    this.authTabRegister = document.getElementById('authTabRegister');
    this.loginForm = document.getElementById('loginForm');
    this.registerForm = document.getElementById('registerForm');
    this.loginEmail = document.getElementById('loginEmail');
    this.loginPassword = document.getElementById('loginPassword');
    this.loginAlert = document.getElementById('loginAlert');
    this.regName = document.getElementById('regName');
    this.regEmail = document.getElementById('regEmail');
    this.regPassword = document.getElementById('regPassword');
    this.registerAlert = document.getElementById('registerAlert');

    // DOM Elements - Profile & Sidebar
    this.myAvatar = document.getElementById('myProfileAvatar');
    this.myName = document.getElementById('myProfileName');
    this.myEmail = document.getElementById('myProfileEmail');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.contactSearchInput = document.getElementById('contactSearchInput');
    this.contactsList = document.getElementById('contactsList');
    this.filterTabs = document.querySelectorAll('.filter-tab');

    // DOM Elements - Group Creation Modal
    this.openCreateGroupBtn = document.getElementById('openCreateGroupBtn');
    this.createGroupModal = document.getElementById('createGroupModal');
    this.closeGroupModalBtn = document.getElementById('closeGroupModalBtn');
    this.cancelGroupBtn = document.getElementById('cancelGroupBtn');
    this.createGroupForm = document.getElementById('createGroupForm');
    this.newGroupName = document.getElementById('newGroupName');
    this.newGroupDesc = document.getElementById('newGroupDesc');
    this.groupMembersChecklist = document.getElementById('groupMembersChecklist');
    this.selectedMembersCount = document.getElementById('selectedMembersCount');
    this.createGroupAlert = document.getElementById('createGroupAlert');

    // DOM Elements - Active Conversation
    this.noConversationState = document.getElementById('noConversationSelected');
    this.activeConversation = document.getElementById('activeDirectConversation');
    this.activeAvatar = document.getElementById('activeContactAvatar');
    this.activeStatusDot = document.getElementById('activeContactStatusDot');
    this.activeName = document.getElementById('activeContactName');
    this.activeStatusText = document.getElementById('activeContactStatusText');
    this.activeTypeBadge = document.getElementById('activeConversationTypeBadge');
    this.activeTypeText = document.getElementById('activeConversationTypeText');
    this.mobileBackBtn = document.getElementById('directMobileBackBtn');
    this.messagesContainer = document.getElementById('directMessagesContainer');
    this.messagesList = document.getElementById('directMessagesList');
    this.typingBar = document.getElementById('directTypingIndicator');
    this.typingText = document.getElementById('directTypingText');
    this.messageForm = document.getElementById('directMessageForm');
    this.messageInput = document.getElementById('directMessageInput');
    this.emojiBar = document.getElementById('directEmojiBar');
    this.navUnreadBadge = document.getElementById('navDirectUnreadTotal');
  }

  init(socket) {
    this.socket = socket;
    this.bindEvents();
    this.checkExistingSession();
  }

  bindEvents() {
    // Auth Tab Switching
    this.authTabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    this.authTabRegister.addEventListener('click', () => this.switchAuthTab('register'));


    // Login submit
    this.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAlerts();
      const email = this.loginEmail.value.trim();
      const password = this.loginPassword.value;

      try {
        const res = await window.api.login(email, password);
        window.api.setToken(res.token);
        this.onLoginSuccess(res.user);
      } catch (err) {
        this.showAlert(this.loginAlert, err.message, 'error');
      }
    });

    // Register submit
    this.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearAlerts();
      const name = this.regName.value.trim();
      const email = this.regEmail.value.trim();
      const password = this.regPassword.value;

      try {
        const res = await window.api.register(name, email, password);
        window.api.setToken(res.token);
        this.onLoginSuccess(res.user);
      } catch (err) {
        this.showAlert(this.registerAlert, err.message, 'error');
      }
    });

    // Logout
    this.logoutBtn.addEventListener('click', () => {
      this.logout();
    });

    // Sidebar filter tabs (All | 1-on-1 | Groups)
    this.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.dataset.filter;
        this.renderSidebarList();
      });
    });

    // Search input
    this.contactSearchInput.addEventListener('input', () => {
      this.renderSidebarList();
    });

    // Group Creation Modal Controls
    this.openCreateGroupBtn.addEventListener('click', () => {
      this.openGroupModal();
    });

    this.closeGroupModalBtn.addEventListener('click', () => {
      this.createGroupModal.classList.add('hidden');
    });

    this.cancelGroupBtn.addEventListener('click', () => {
      this.createGroupModal.classList.add('hidden');
    });

    // Create Group Form Submit
    this.createGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = this.newGroupName.value.trim();
      const desc = this.newGroupDesc.value.trim();
      if (!name) return;

      const checkedBoxes = this.groupMembersChecklist.querySelectorAll('input[type="checkbox"]:checked');
      const memberIds = Array.from(checkedBoxes).map(cb => cb.value);

      try {
        const res = await window.api.createGroup(name, desc, memberIds);
        if (res && res.group) {
          this.createGroupModal.classList.add('hidden');
          this.newGroupName.value = '';
          this.newGroupDesc.value = '';

          // Inform socket room about new group
          this.socket.emit('create_group', {
            name: res.group.name,
            description: res.group.description,
            memberIds: res.group.memberIds
          });

          await this.loadGroups();
          this.selectGroup(res.group);
          if (window.soundManager) window.soundManager.playNotification();
        }
      } catch (err) {
        this.showAlert(this.createGroupAlert, err.message, 'error');
      }
    });

    // Mobile back button
    this.mobileBackBtn.addEventListener('click', () => {
      this.appLayout.classList.remove('conversation-active');
    });

    // Message submit (Handles both Direct and Group)
    this.messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const content = this.messageInput.value.trim();
      if (!content || !this.activeChat) return;

      if (this.activeChat.type === 'direct') {
        this.socket.emit('send_direct_message', {
          recipientId: this.activeChat.data.id,
          content
        });

        // Reset typing
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.socket.emit('direct_typing', {
          recipientId: this.activeChat.data.id,
          isTyping: false
        });
      } else if (this.activeChat.type === 'group') {
        this.socket.emit('send_group_message', {
          groupId: this.activeChat.data.id,
          content
        });

        // Reset typing
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.socket.emit('group_typing', {
          groupId: this.activeChat.data.id,
          isTyping: false
        });
      }

      this.messageInput.value = '';
      if (window.soundManager) window.soundManager.playSent();
    });

    // Typing emission
    this.messageInput.addEventListener('input', () => {
      if (!this.activeChat) return;

      if (this.activeChat.type === 'direct') {
        this.socket.emit('direct_typing', {
          recipientId: this.activeChat.data.id,
          isTyping: true
        });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          if (this.activeChat && this.activeChat.type === 'direct') {
            this.socket.emit('direct_typing', {
              recipientId: this.activeChat.data.id,
              isTyping: false
            });
          }
        }, 1500);
      } else if (this.activeChat.type === 'group') {
        this.socket.emit('group_typing', {
          groupId: this.activeChat.data.id,
          isTyping: true
        });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          if (this.activeChat && this.activeChat.type === 'group') {
            this.socket.emit('group_typing', {
              groupId: this.activeChat.data.id,
              isTyping: false
            });
          }
        }, 1500);
      }
    });

    // Quick emoji bar
    this.emojiBar.querySelectorAll('.emoji-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.messageInput.value += emoji;
        this.messageInput.focus();
      });
    });

    // ==========================================
    // Socket.IO Events
    // ==========================================
    this.socket.on('auth_direct_success', (data) => {
      this.onlineUserIds = new Set(data.onlineUserIds || []);
      this.updateOnlineIndicators();
    });

    this.socket.on('user_status_change', ({ userId, status }) => {
      if (status === 'online') {
        this.onlineUserIds.add(userId);
      } else {
        this.onlineUserIds.delete(userId);
      }
      this.updateOnlineIndicators();
    });

    // Direct message sent confirm
    this.socket.on('message_sent_confirm', (msg) => {
      if (this.activeChat && this.activeChat.type === 'direct' && (msg.recipientId === this.activeChat.data.id)) {
        this.appendMessage(msg, true);
        this.scrollToBottom();
      }
      this.updateContactSnippet(msg.recipientId, msg.content, msg.timestamp, true);
    });

    // New Direct message
    this.socket.on('new_direct_message', (msg) => {
      const isFromActiveContact = this.activeChat && this.activeChat.type === 'direct' && (msg.senderId === this.activeChat.data.id);

      if (isFromActiveContact) {
        this.appendMessage(msg, false);
        this.scrollToBottom();
        this.socket.emit('mark_read', { contactId: msg.senderId });
        if (window.soundManager) window.soundManager.playReceived();
      } else {
        const contact = this.contacts.find(c => c.id === msg.senderId);
        if (contact) {
          contact.unreadCount = (contact.unreadCount || 0) + 1;
        }
        if (window.soundManager) window.soundManager.playNotification();
      }

      this.updateContactSnippet(msg.senderId, msg.content, msg.timestamp, false);
      this.renderSidebarList();
      this.updateTotalUnread();
    });

    // Real-time Direct Message Deleted
    this.socket.on('direct_message_deleted', ({ messageId }) => {
      this.handleMessageDeletedUI(messageId);
    });

    // New Group Created notification
    this.socket.on('group_created', async ({ group }) => {
      await this.loadGroups();
      if (window.soundManager) window.soundManager.playNotification();
    });

    // New Group message
    this.socket.on('new_group_message', (msg) => {
      const isCurrentGroup = this.activeChat && this.activeChat.type === 'group' && (this.activeChat.data.id === msg.groupId);

      if (isCurrentGroup) {
        const isSentByMe = msg.senderId === this.currentUser.id;
        this.appendMessage(msg, isSentByMe);
        this.scrollToBottom();
        if (!isSentByMe && window.soundManager) window.soundManager.playReceived();
      } else {
        if (window.soundManager) window.soundManager.playNotification();
      }

      this.updateGroupSnippet(msg.groupId, msg.senderName, msg.content, msg.timestamp);
      this.renderSidebarList();
    });

    // Real-time Group Message Deleted
    this.socket.on('group_message_deleted', ({ messageId }) => {
      this.handleMessageDeletedUI(messageId);
    });

    // Direct Typing
    this.socket.on('user_direct_typing', ({ senderId, senderName, isTyping }) => {
      if (this.activeChat && this.activeChat.type === 'direct' && this.activeChat.data.id === senderId) {
        if (isTyping) {
          this.typingText.textContent = `${senderName} is typing...`;
          this.typingBar.classList.remove('hidden');
        } else {
          this.typingBar.classList.add('hidden');
        }
      }
    });

    // Group Typing
    this.socket.on('user_group_typing', ({ groupId, senderId, senderName, isTyping }) => {
      if (this.activeChat && this.activeChat.type === 'group' && this.activeChat.data.id === groupId && senderId !== this.currentUser.id) {
        if (isTyping) {
          this.typingText.textContent = `${senderName} is typing...`;
          this.typingBar.classList.remove('hidden');
        } else {
          this.typingBar.classList.add('hidden');
        }
      }
    });

    // Read Receipts
    this.socket.on('messages_marked_read', ({ readerId }) => {
      if (this.activeChat && this.activeChat.type === 'direct' && this.activeChat.data.id === readerId) {
        document.querySelectorAll('.msg-read-status').forEach(el => {
          el.textContent = '✓✓';
          el.style.color = '#38bdf8';
        });
      }
    });
  }

  handleMessageDeletedUI(messageId) {
    const row = this.messagesList.querySelector(`[data-msg-id="${messageId}"]`);
    if (row) {
      const bubble = row.querySelector('.message-bubble');
      if (bubble) {
        bubble.textContent = '🚫 This message was deleted';
        bubble.classList.add('deleted');
      }
      const delBtn = row.querySelector('.msg-delete-btn');
      if (delBtn) delBtn.remove();
    }
  }

  switchAuthTab(tab) {
    this.clearAlerts();
    if (tab === 'login') {
      this.authTabLogin.classList.add('active');
      this.authTabRegister.classList.remove('active');
      this.loginForm.classList.remove('hidden');
      this.registerForm.classList.add('hidden');
    } else {
      this.authTabRegister.classList.add('active');
      this.authTabLogin.classList.remove('active');
      this.registerForm.classList.remove('hidden');
      this.loginForm.classList.add('hidden');
    }
  }

  async checkExistingSession() {
    const token = window.api.getToken();
    if (!token) {
      this.showAuth();
      return;
    }

    try {
      const res = await window.api.getMe();
      if (res && res.user) {
        this.onLoginSuccess(res.user);
      } else {
        this.showAuth();
      }
    } catch (err) {
      this.showAuth();
    }
  }

  showAuth() {
    this.authOverlay.classList.remove('hidden');
    this.appLayout.classList.add('hidden');
    const headerUser = document.getElementById('userHeaderBadge');
    if (headerUser) headerUser.classList.add('hidden');
  }

  async onLoginSuccess(user) {
    this.currentUser = user;
    this.authOverlay.classList.add('hidden');
    this.appLayout.classList.remove('hidden');

    // Populate user profile card
    this.myName.textContent = user.name;
    this.myEmail.textContent = user.email;
    this.myAvatar.textContent = user.name.charAt(0).toUpperCase();
    this.myAvatar.style.backgroundColor = user.avatarColor || '#4f46e5';

    // Populate header badge
    const headerUser = document.getElementById('userHeaderBadge');
    const headerAvatar = document.getElementById('headerUserAvatar');
    const headerName = document.getElementById('headerUserName');
    if (headerUser) {
      headerUser.classList.remove('hidden');
      headerAvatar.textContent = user.name.charAt(0).toUpperCase();
      headerAvatar.style.backgroundColor = user.avatarColor || '#4f46e5';
      headerName.textContent = user.name;
    }

    // Authenticate socket
    this.socket.emit('auth_direct_user', window.api.getToken());

    // Load both Contacts and Groups
    await this.loadContacts();
    await this.loadGroups();
  }

  logout() {
    window.api.setToken(null);
    this.socket.emit('logout_direct_user');
    this.currentUser = null;
    this.activeChat = null;
    this.contacts = [];
    this.groups = [];
    this.showAuth();
  }

  async loadContacts() {
    try {
      const res = await window.api.getUsers();
      if (res && res.users) {
        this.contacts = res.users;
        this.renderSidebarList();
        this.updateTotalUnread();
      }
    } catch (err) {
      console.warn('Could not load contacts:', err.message);
    }
  }

  async loadGroups() {
    try {
      const res = await window.api.getGroups();
      if (res && res.groups) {
        this.groups = res.groups;
        this.renderSidebarList();
      }
    } catch (err) {
      console.warn('Could not load groups:', err.message);
    }
  }

  openGroupModal() {
    this.createGroupModal.classList.remove('hidden');
    this.groupMembersChecklist.innerHTML = '';
    this.selectedMembersCount.textContent = '0';
    this.createGroupAlert.classList.add('hidden');

    if (this.contacts.length === 0) {
      this.groupMembersChecklist.innerHTML = `
        <div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
          No other registered members found to add.
        </div>
      `;
      return;
    }

    this.contacts.forEach(contact => {
      const item = document.createElement('label');
      item.className = 'member-checkbox-item';
      item.innerHTML = `
        <input type="checkbox" value="${contact.id}">
        <div class="user-avatar-small" style="background-color: ${contact.avatarColor || '#4f46e5'}">
          ${contact.name.charAt(0).toUpperCase()}
        </div>
        <div class="member-info">
          <span class="member-name">${this.escapeHtml(contact.name)}</span>
          <span class="member-email">${this.escapeHtml(contact.email)}</span>
        </div>
      `;

      item.querySelector('input').addEventListener('change', () => {
        const count = this.groupMembersChecklist.querySelectorAll('input:checked').length;
        this.selectedMembersCount.textContent = count;
      });

      this.groupMembersChecklist.appendChild(item);
    });
  }

  renderSidebarList() {
    const query = this.contactSearchInput.value.trim().toLowerCase();
    this.contactsList.innerHTML = '';

    const showDirect = this.activeFilter === 'all' || this.activeFilter === 'direct';
    const showGroups = this.activeFilter === 'all' || this.activeFilter === 'groups';

    // 1. Groups Render
    if (showGroups) {
      const filteredGroups = this.groups.filter(g =>
        g.name.toLowerCase().includes(query) || (g.description && g.description.toLowerCase().includes(query))
      );

      filteredGroups.forEach(group => {
        const isActive = this.activeChat && this.activeChat.type === 'group' && this.activeChat.data.id === group.id;
        const initial = (group.name || 'G').charAt(0).toUpperCase();
        const lastMsg = group.lastMessage;
        const lastMsgText = lastMsg ? `${lastMsg.senderName ? lastMsg.senderName + ': ' : ''}${lastMsg.content}` : 'No messages yet';
        const timeText = lastMsg ? this.formatTime(lastMsg.timestamp) : '';

        const item = document.createElement('div');
        item.className = `contact-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
          <div class="avatar-wrapper">
            <div class="user-avatar" style="background-color: ${group.avatarColor || '#6366f1'}">
              ${initial}
            </div>
          </div>
          <div class="contact-info">
            <div class="contact-top-row">
              <div class="contact-name-group">
                <span class="contact-name">${this.escapeHtml(group.name)}</span>
                <span class="group-badge">Group</span>
              </div>
              <span class="contact-time">${timeText}</span>
            </div>
            <div class="contact-bottom-row">
              <span class="contact-last-msg">${this.escapeHtml(lastMsgText)}</span>
            </div>
          </div>
        `;

        item.addEventListener('click', () => {
          this.selectGroup(group);
        });

        this.contactsList.appendChild(item);
      });
    }

    // 2. Direct Contacts Render
    if (showDirect) {
      const filteredContacts = this.contacts.filter(c =>
        c.name.toLowerCase().includes(query) || c.email.toLowerCase().includes(query)
      );

      filteredContacts.forEach(contact => {
        const isOnline = this.onlineUserIds.has(contact.id);
        const isActive = this.activeChat && this.activeChat.type === 'direct' && this.activeChat.data.id === contact.id;
        const initial = (contact.name || 'U').charAt(0).toUpperCase();
        const lastMsg = contact.lastMessage;
        const lastMsgText = lastMsg ? (lastMsg.isSender ? 'You: ' : '') + lastMsg.content : 'No messages yet';
        const timeText = lastMsg ? this.formatTime(lastMsg.timestamp) : '';
        const unreadCount = contact.unreadCount || 0;

        const item = document.createElement('div');
        item.className = `contact-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
          <div class="avatar-wrapper">
            <div class="user-avatar" style="background-color: ${contact.avatarColor || '#4f46e5'}">
              ${initial}
            </div>
            <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
          </div>
          <div class="contact-info">
            <div class="contact-top-row">
              <span class="contact-name">${this.escapeHtml(contact.name)}</span>
              <span class="contact-time">${timeText}</span>
            </div>
            <div class="contact-bottom-row">
              <span class="contact-last-msg">${this.escapeHtml(lastMsgText)}</span>
              ${unreadCount > 0 ? `<span class="contact-unread-badge">${unreadCount}</span>` : ''}
            </div>
          </div>
        `;

        item.addEventListener('click', () => {
          this.selectContact(contact);
        });

        this.contactsList.appendChild(item);
      });
    }

    if (this.contactsList.children.length === 0) {
      this.contactsList.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No conversations found.
        </div>
      `;
    }

    this.updateOnlineIndicators();
  }

  // SELECT 1-ON-1 CONTACT
  async selectContact(contact) {
    this.activeChat = { type: 'direct', data: contact };
    contact.unreadCount = 0;
    this.updateTotalUnread();

    this.renderSidebarList();

    this.noConversationState.classList.add('hidden');
    this.activeConversation.classList.remove('hidden');
    this.appLayout.classList.add('conversation-active');

    // Header styling
    this.activeName.textContent = contact.name;
    this.activeAvatar.textContent = contact.name.charAt(0).toUpperCase();
    this.activeAvatar.style.backgroundColor = contact.avatarColor || '#4f46e5';
    this.activeTypeBadge.className = 'badge-pill private-pill';
    this.activeTypeText.textContent = '1-on-1 Private';
    this.messageInput.placeholder = `Message ${contact.name}...`;

    this.updateActiveHeaderStatus();

    // Fetch messages
    try {
      const res = await window.api.getDirectConversation(contact.id);
      this.messagesList.innerHTML = '';
      if (res && res.messages) {
        res.messages.forEach(msg => {
          const isSentByMe = msg.senderId === this.currentUser.id;
          this.appendMessage(msg, isSentByMe);
        });
        this.scrollToBottom();
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }

    this.socket.emit('mark_read', { contactId: contact.id });
    this.messageInput.focus();
  }

  // SELECT GROUP
  async selectGroup(group) {
    this.activeChat = { type: 'group', data: group };

    this.renderSidebarList();

    this.noConversationState.classList.add('hidden');
    this.activeConversation.classList.remove('hidden');
    this.appLayout.classList.add('conversation-active');

    // Header styling
    this.activeName.textContent = group.name;
    this.activeAvatar.textContent = (group.name || 'G').charAt(0).toUpperCase();
    this.activeAvatar.style.backgroundColor = group.avatarColor || '#6366f1';
    this.activeStatusDot.className = 'status-indicator online';
    this.activeStatusText.textContent = `${group.membersCount || (group.memberIds && group.memberIds.length) || 0} members`;
    this.activeStatusText.style.color = '#a5b4fc';
    this.activeTypeBadge.className = 'badge-pill broadcast-pill';
    this.activeTypeText.textContent = '👥 Group Chat';
    this.messageInput.placeholder = `Message ${group.name}...`;

    // Fetch group messages
    try {
      const res = await window.api.getGroupConversation(group.id);
      this.messagesList.innerHTML = '';
      if (res && res.messages) {
        res.messages.forEach(msg => {
          const isSentByMe = msg.senderId === this.currentUser.id;
          this.appendMessage(msg, isSentByMe);
        });
        this.scrollToBottom();
      }
    } catch (err) {
      console.error('Failed to load group conversation:', err);
    }

    this.messageInput.focus();
  }

  updateActiveHeaderStatus() {
    if (!this.activeChat || this.activeChat.type !== 'direct') return;
    const isOnline = this.onlineUserIds.has(this.activeChat.data.id);

    if (isOnline) {
      this.activeStatusDot.className = 'status-indicator online';
      this.activeStatusText.textContent = 'Active now';
      this.activeStatusText.style.color = '#10b981';
    } else {
      this.activeStatusDot.className = 'status-indicator offline';
      this.activeStatusText.textContent = 'Offline';
      this.activeStatusText.style.color = '#94a3b8';
    }
  }

  updateOnlineIndicators() {
    this.updateActiveHeaderStatus();

    const items = this.contactsList.querySelectorAll('.contact-item');
    items.forEach((item, index) => {
      const contact = this.contacts[index];
      if (contact) {
        const dot = item.querySelector('.status-indicator');
        if (dot) {
          const online = this.onlineUserIds.has(contact.id);
          dot.className = `status-indicator ${online ? 'online' : 'offline'}`;
        }
      }
    });
  }

  // RENDER MESSAGE WITH DELETE OPTION
  appendMessage(msg, isSentByMe) {
    const isDeleted = !!msg.deleted;
    const timeFormatted = this.formatTime(msg.timestamp);

    const row = document.createElement('div');
    row.className = `message-row ${isSentByMe ? 'sent' : 'received'}`;
    row.setAttribute('data-msg-id', msg.id);

    let senderName = msg.senderName;
    if (!senderName) {
      senderName = isSentByMe ? this.currentUser.name : (this.activeChat && this.activeChat.data.name);
    }
    const initial = (senderName || 'U').charAt(0).toUpperCase();

    const color = isSentByMe ? 
      (this.currentUser.avatarColor || '#4f46e5') : 
      (msg.senderAvatarColor || '#6366f1');

    const readIndicator = (isSentByMe && this.activeChat && this.activeChat.type === 'direct' && !isDeleted) ? 
      `<span class="msg-read-status" style="color: ${msg.read ? '#38bdf8' : 'currentColor'}">${msg.read ? '✓✓' : '✓'}</span>` : 
      '';

    // Delete Button (visible on hover/tap for sender's messages if not deleted)
    const deleteBtnHtml = (isSentByMe && !isDeleted) ? 
      `<button class="msg-delete-btn" title="Delete message for everyone">🗑️</button>` : 
      '';

    const contentText = isDeleted ? '🚫 This message was deleted' : this.escapeHtml(msg.content);

    // Show sender name in group chat for received messages
    const isGroup = this.activeChat && this.activeChat.type === 'group';
    const showSenderTag = (!isSentByMe && isGroup);

    row.innerHTML = `
      <div class="msg-avatar" style="background-color: ${color}">
        ${initial}
      </div>
      <div class="msg-body-wrapper">
        ${showSenderTag ? `<div class="msg-sender-name">${this.escapeHtml(senderName)}</div>` : ''}
        <div class="msg-bubble-container">
          ${isSentByMe ? deleteBtnHtml : ''}
          <div class="message-bubble ${isDeleted ? 'deleted' : ''}">
            ${contentText}
          </div>
          ${!isSentByMe ? deleteBtnHtml : ''}
        </div>
        <div class="msg-meta">
          <span>${timeFormatted}</span>
          ${readIndicator}
        </div>
      </div>
    `;

    // Hook up delete button click
    const delBtn = row.querySelector('.msg-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this message for everyone?')) {
          if (this.activeChat.type === 'direct') {
            this.socket.emit('delete_direct_message', {
              messageId: msg.id,
              contactId: this.activeChat.data.id
            });
          } else if (this.activeChat.type === 'group') {
            this.socket.emit('delete_group_message', {
              messageId: msg.id,
              groupId: this.activeChat.data.id
            });
          }
        }
      });
    }

    this.messagesList.appendChild(row);
  }

  updateContactSnippet(contactId, content, timestamp, isSender) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (contact) {
      contact.lastMessage = { content, timestamp, isSender };
    }
  }

  updateGroupSnippet(groupId, senderName, content, timestamp) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.lastMessage = { senderName, content, timestamp };
    }
  }

  updateTotalUnread() {
    let total = 0;
    this.contacts.forEach(c => {
      total += (c.unreadCount || 0);
    });

    if (total > 0) {
      this.navUnreadBadge.textContent = total;
      this.navUnreadBadge.classList.remove('hidden');
    } else {
      this.navUnreadBadge.classList.add('hidden');
    }
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  showAlert(el, message, type) {
    el.textContent = message;
    el.className = `form-alert ${type}`;
    el.classList.remove('hidden');
  }

  clearAlerts() {
    this.loginAlert.classList.add('hidden');
    this.registerAlert.classList.add('hidden');
    if (this.createGroupAlert) this.createGroupAlert.classList.add('hidden');
  }

  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.DirectChatController = DirectChatController;
