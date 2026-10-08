// REST API Client
const api = {
  getToken() {
    return localStorage.getItem('chat_jwt_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('chat_jwt_token', token);
    } else {
      localStorage.removeItem('chat_jwt_token');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Request failed');
      }
      return data;
    } catch (err) {
      throw err;
    }
  },

  // Auth Endpoints
  async register(name, email, password) {
    return this.request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
  },

  async login(email, password) {
    return this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async getMe() {
    return this.request('/api/me');
  },

  // Users / Contacts
  async getUsers() {
    return this.request('/api/users');
  },

  // 1-on-1 Messages
  async getDirectConversation(contactId) {
    return this.request(`/api/messages/direct/${contactId}`);
  },

  async deleteDirectMessage(messageId) {
    return this.request(`/api/messages/direct/${messageId}`, {
      method: 'DELETE'
    });
  },

  // Groups
  async createGroup(name, description, memberIds) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description, memberIds })
    });
  },

  async getGroups() {
    return this.request('/api/groups');
  },

  async getGroupConversation(groupId) {
    return this.request(`/api/groups/${groupId}/messages`);
  },

  async deleteGroupMessage(messageId) {
    return this.request(`/api/messages/group/${messageId}`, {
      method: 'DELETE'
    });
  },

  // Broadcast
  async getBroadcastMessages() {
    return this.request('/api/messages/broadcast');
  },

  async deleteBroadcastMessage(messageId) {
    return this.request(`/api/messages/broadcast/${messageId}`, {
      method: 'DELETE'
    });
  }
};

window.api = api;
