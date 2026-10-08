// Main Application Coordinator
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.IO connection
  const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  // DOM Elements - Status and Navigation
  const socketStatusEl = document.getElementById('socketStatus');
  const statusLabel = socketStatusEl.querySelector('.status-label');
  const navBroadcastBtn = document.getElementById('navBroadcastBtn');
  const navDirectBtn = document.getElementById('navDirectBtn');
  const broadcastView = document.getElementById('broadcastView');
  const directView = document.getElementById('directView');
  const switchFromJoinToPersonal = document.getElementById('switchFromJoinToPersonal');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');

  // Socket Connection Status Handling
  socket.on('connect', () => {
    socketStatusEl.className = 'socket-status connected';
    statusLabel.textContent = 'Live Connected';

    // If direct chat user is logged in, re-authenticate socket
    const token = window.api.getToken();
    if (token) {
      socket.emit('auth_direct_user', token);
    }
  });

  socket.on('disconnect', () => {
    socketStatusEl.className = 'socket-status disconnected';
    statusLabel.textContent = 'Disconnected';
  });

  socket.on('reconnecting', () => {
    socketStatusEl.className = 'socket-status';
    statusLabel.textContent = 'Reconnecting...';
  });

  // Sound Toggle Control
  function updateSoundUI() {
    if (window.soundManager && window.soundManager.enabled) {
      soundOnIcon.classList.remove('hidden');
      soundOffIcon.classList.add('hidden');
      soundToggleBtn.title = 'Mute notification sounds';
    } else {
      soundOnIcon.classList.add('hidden');
      soundOffIcon.classList.remove('hidden');
      soundToggleBtn.title = 'Unmute notification sounds';
    }
  }

  soundToggleBtn.addEventListener('click', () => {
    if (window.soundManager) {
      window.soundManager.toggle();
      updateSoundUI();
    }
  });
  updateSoundUI();

  // Mode Switcher (Broadcast vs Direct)
  function switchMode(mode) {
    if (mode === 'broadcast') {
      navBroadcastBtn.classList.add('active');
      navDirectBtn.classList.remove('active');
      broadcastView.classList.add('active');
      directView.classList.remove('active');
      broadcastController.scrollToBottom();
    } else {
      navDirectBtn.classList.add('active');
      navBroadcastBtn.classList.remove('active');
      directView.classList.add('active');
      broadcastView.classList.remove('active');
      if (directController.activeContact) {
        directController.scrollToBottom();
      }
    }
  }

  navBroadcastBtn.addEventListener('click', () => switchMode('broadcast'));
  navDirectBtn.addEventListener('click', () => switchMode('direct'));

  if (switchFromJoinToPersonal) {
    switchFromJoinToPersonal.addEventListener('click', () => {
      switchMode('direct');
    });
  }

  // Initialize feature controllers
  const broadcastController = new window.BroadcastController();
  broadcastController.init(socket);

  const directController = new window.DirectChatController();
  directController.init(socket);
});
