require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_realtime_chat_jwt_key_2026',
  DATA_DIR: path.join(__dirname, 'data'),
  USERS_FILE: path.join(__dirname, 'data', 'users.json'),
  DIRECT_MSGS_FILE: path.join(__dirname, 'data', 'direct_messages.json'),
  BROADCAST_MSGS_FILE: path.join(__dirname, 'data', 'broadcast_messages.json'),
  GROUPS_FILE: path.join(__dirname, 'data', 'groups.json'),
  GROUP_MSGS_FILE: path.join(__dirname, 'data', 'group_messages.json')
};
