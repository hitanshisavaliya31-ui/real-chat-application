// Broadcast Chat Controller with Delete Support
class BroadcastController {
  constructor() {
    this.joined = false;
    this.myName = localStorage.getItem('broadcast_name') || '';
    this.myColor = localStorage.getItem('broadcast_color') || this.generateRandomColor();
    this.typingTimeout = null;
    this.onlineMembers = [];

    // DOM Elements
    this.joinPrompt = document.getElementById('broadcastJoinPrompt');
    this.joinForm = document.getElementById('broadcastJoinForm');
    this.nameInput = document.getElementById('broadcastNameInput');
    this.chatContainer = document.getElementById('broadcastChatContainer');
    this.onlineText = document.getElementById('broadcastOnlineText');
    this.myNameDisplay = document.getElementById('broadcastMyNameDisplay');
    this.changeNameBtn = document.getElementById('changeBroadcastNameBtn');
    this.usersCountBtn = document.getElementById('broadcastUsersCountBtn');
    this.toggleUsersBtn = document.getElementById('toggleBroadcastUsersBtn');
    this.membersDrawer = document.getElementById('broadcastMembersDrawer');
    this.drawerCount = document.getElementById('drawerMembersCount');
    this.drawerList = document.getElementById('broadcastMembersList');
    this.closeDrawerBtn = document.getElementById('closeMembersDrawerBtn');
    this.messagesContainer = document.getElementById('broadcastMessagesContainer');
    this.messagesList = document.getElementById('broadcastMessagesList');
    this.typingBar = document.getElementById('broadcastTypingIndicator');
    this.typingText = document.getElementById('broadcastTypingText');
    this.messageForm = document.getElementById('broadcastMessageForm');
    this.messageInput = document.getElementById('broadcastMessageInput');
    this.emojiBar = document.getElementById('broadcastEmojiBar');
    this.navCountBadge = document.getElementById('navBroadcastCount');
  }

  generateRandomColor() {
    const colors = [
      '#4f46e5', '#2563eb', '#0284c7', '#0d9488',
      '#059669', '#16a34a', '#d97706', '#dc2626',
      '#db2777', '#7c3aed', '#9333ea', '#475569'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  init(socket) {
    this.socket = socket;
    this.bindEvents();
    this.loadHistory();

    // Auto-join if user previously saved their name
    if (this.myName) {
      this.nameInput.value = this.myName;
      this.joinBroadcastRoom(this.myName);
    }
  }

  bindEvents() {
    // Form submit to enter broadcast room
    this.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.nameInput.value.trim();
      if (!name) return;
      this.joinBroadcastRoom(name);
    });

    // Change display name button
    this.changeNameBtn.addEventListener('click', () => {
      this.showJoinPrompt();
    });

    // Toggle members drawer
    this.toggleUsersBtn.addEventListener('click', () => {
      this.membersDrawer.classList.toggle('hidden');
    });

    this.closeDrawerBtn.addEventListener('click', () => {
      this.membersDrawer.classList.add('hidden');
    });

    // Message submit
    this.messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const content = this.messageInput.value.trim();
      if (!content || !this.joined) return;

      this.socket.emit('send_broadcast_message', { content });
      this.messageInput.value = '';

      // Reset typing status immediately
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.socket.emit('broadcast_typing', { isTyping: false });

      if (window.soundManager) window.soundManager.playSent();
    });

    // Typing emission
    this.messageInput.addEventListener('input', () => {
      if (!this.joined) return;
      this.socket.emit('broadcast_typing', { isTyping: true });

      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.socket.emit('broadcast_typing', { isTyping: false });
      }, 1500);
    });

    // Quick emoji bar clicks
    this.emojiBar.querySelectorAll('.emoji-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.messageInput.value += emoji;
        this.messageInput.focus();
      });
    });

    // Setup Socket.IO broadcast listener events
    this.socket.on('broadcast_joined_success', (data) => {
      this.joined = true;
      this.myName = data.profile.name;
      this.myColor = data.profile.avatarColor;
      this.myNameDisplay.textContent = this.myName;
      this.joinPrompt.classList.add('hidden');
      this.chatContainer.classList.remove('hidden');
      this.updateOnlineCount(data.onlineCount, data.users);
      this.scrollToBottom();
    });

    this.socket.on('new_broadcast_message', (msg) => {
      this.appendMessage(msg);
      this.scrollToBottom();
      if (msg.senderName !== this.myName && window.soundManager) {
        window.soundManager.playReceived();
      }
    });

    this.socket.on('broadcast_message_deleted', ({ messageId }) => {
      const msgRow = this.messagesList.querySelector(`[data-msg-id="${messageId}"]`);
      if (msgRow) {
        const bubble = msgRow.querySelector('.message-bubble');
        if (bubble) {
          bubble.textContent = '🚫 This message was deleted';
          bubble.classList.add('deleted');
        }
        const delBtn = msgRow.querySelector('.msg-delete-btn');
        if (delBtn) delBtn.remove();
      }
    });

    this.socket.on('broadcast_system_announcement', (msg) => {
      this.appendSystemMessage(msg.content);
      this.scrollToBottom();
      if (window.soundManager) window.soundManager.playNotification();
    });

    this.socket.on('broadcast_users_update', (data) => {
      this.updateOnlineCount(data.onlineCount, data.users);
    });

    this.socket.on('user_broadcast_typing', (data) => {
      if (data.isTyping) {
        this.typingText.textContent = `${data.name} is typing...`;
        this.typingBar.classList.remove('hidden');
      } else {
        this.typingBar.classList.add('hidden');
      }
    });
  }

  joinBroadcastRoom(name) {
    this.myName = name;
    localStorage.setItem('broadcast_name', name);
    localStorage.setItem('broadcast_color', this.myColor);
    this.socket.emit('join_broadcast', {
      name: this.myName,
      avatarColor: this.myColor
    });
  }

  showJoinPrompt() {
    this.joinPrompt.classList.remove('hidden');
    this.chatContainer.classList.add('hidden');
    this.nameInput.focus();
    this.nameInput.select();
  }

  async loadHistory() {
    try {
      const res = await window.api.getBroadcastMessages();
      if (res && res.messages) {
        this.messagesList.innerHTML = '';
        res.messages.forEach(msg => {
          if (msg.type === 'system') {
            this.appendSystemMessage(msg.content);
          } else {
            this.appendMessage(msg);
          }
        });
        this.scrollToBottom();
      }
    } catch (err) {
      console.warn('Could not load broadcast history:', err.message);
    }
  }

  updateOnlineCount(count, users = []) {
    this.onlineMembers = users;
    const text = `${count} member${count === 1 ? '' : 's'} online`;
    this.onlineText.textContent = text;
    this.usersCountBtn.textContent = `Online (${count})`;
    this.drawerCount.textContent = count;
    this.navCountBadge.textContent = count;

    // Render drawer list
    this.drawerList.innerHTML = '';
    users.forEach(u => {
      const isMe = u.name === this.myName;
      const item = document.createElement('div');
      item.className = 'drawer-user-item';
      item.innerHTML = `
        <div class="user-avatar-small" style="background-color: ${u.avatarColor || '#4f46e5'}">
          ${(u.name || 'U').charAt(0).toUpperCase()}
        </div>
        <span style="font-weight: 600; color: ${isMe ? '#a5b4fc' : '#f8fafc'}">
          ${this.escapeHtml(u.name)} ${isMe ? '(You)' : ''}
        </span>
      `;
      this.drawerList.appendChild(item);
    });
  }

  appendMessage(msg) {
    const isSentByMe = msg.senderName === this.myName;
    const isDeleted = !!msg.deleted;
    const initial = (msg.senderName || 'U').charAt(0).toUpperCase();
    const timeFormatted = this.formatTime(msg.timestamp);

    const row = document.createElement('div');
    row.className = `message-row ${isSentByMe ? 'sent' : 'received'}`;
    row.setAttribute('data-msg-id', msg.id);

    const color = msg.avatarColor || this.getColorForName(msg.senderName);

    const deleteBtnHtml = (isSentByMe && !isDeleted) ? 
      `<button class="msg-delete-btn" title="Delete message">🗑️</button>` : 
      '';

    const contentText = isDeleted ? '🚫 This message was deleted' : this.escapeHtml(msg.content);

    row.innerHTML = `
      <div class="msg-avatar" style="background-color: ${color}">
        ${initial}
      </div>
      <div class="msg-body-wrapper">
        ${!isSentByMe ? `<div class="msg-sender-name">${this.escapeHtml(msg.senderName)}</div>` : ''}
        <div class="msg-bubble-container">
          ${isSentByMe ? deleteBtnHtml : ''}
          <div class="message-bubble ${isDeleted ? 'deleted' : ''}">
            ${contentText}
          </div>
          ${!isSentByMe ? deleteBtnHtml : ''}
        </div>
        <div class="msg-meta">
          <span>${timeFormatted}</span>
        </div>
      </div>
    `;

    // Hook up delete button click
    const delBtn = row.querySelector('.msg-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this message for everyone?')) {
          this.socket.emit('delete_broadcast_message', { messageId: msg.id });
        }
      });
    }

    this.messagesList.appendChild(row);
  }

  appendSystemMessage(content) {
    const row = document.createElement('div');
    row.className = 'system-message-row';
    row.innerHTML = `
      <div class="system-badge">
        <span>📢</span>
        <span>${this.escapeHtml(content)}</span>
      </div>
    `;
    this.messagesList.appendChild(row);
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

  getColorForName(str = '') {
    const colors = [
      '#4f46e5', '#2563eb', '#0284c7', '#0d9488',
      '#059669', '#16a34a', '#d97706', '#dc2626',
      '#db2777', '#7c3aed', '#9333ea', '#475569'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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

window.BroadcastController = BroadcastController;
