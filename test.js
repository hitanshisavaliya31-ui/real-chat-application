const http = require('http');
const { io: Client } = require('socket.io-client');
const { app, server, startServer } = require('./server');
const config = require('./config');

async function runTests() {
  console.log('🧪 Starting End-to-End Chat System Verification (with Group Make & Message Delete)...\n');

  const BASE_URL = `http://localhost:${config.PORT}`;

  let startedLocally = false;
  // Check if server is already running
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (healthCheck.ok) {
      console.log('ℹ️ Server already running on port', config.PORT);
    }
  } catch (e) {
    console.log('ℹ️ Starting test server on port', config.PORT);
    await new Promise(resolve => {
      startServer(config.PORT);
      setTimeout(resolve, 800);
    });
    startedLocally = true;
  }

  // 1. Test Login API with Alice
  console.log('--- Step 1: Testing Login API ---');
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    throw new Error('Login failed: ' + JSON.stringify(loginData));
  }
  console.log('✅ Alice logged in successfully. User ID:', loginData.user.id);
  const aliceToken = loginData.token;
  const aliceUser = loginData.user;

  // 2. Test Bob Login API
  const bobLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com', password: 'password123' })
  });
  const bobData = await bobLoginRes.json();
  if (!bobData.success) throw new Error('Bob login failed');
  const bobToken = bobData.token;
  const bobUser = bobData.user;
  console.log('✅ Bob logged in successfully. User ID:', bobUser.id);

  // 3. Test Registration API
  console.log('\n--- Step 2: Testing User Registration API ---');
  const testEmail = `test_${Date.now()}@example.com`;
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'David Developer', email: testEmail, password: 'securePassword123' })
  });
  const regData = await regRes.json();
  if (!regData.success) throw new Error('Registration failed: ' + JSON.stringify(regData));
  console.log('✅ User registered successfully:', regData.user.name, `(${regData.user.email})`);

  // 4. Test Fetch Contacts List
  console.log('\n--- Step 3: Testing Contacts List API ---');
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { 'Authorization': `Bearer ${aliceToken}` }
  });
  const usersData = await usersRes.json();
  if (!usersData.success || !Array.isArray(usersData.users)) {
    throw new Error('Users list fetch failed');
  }
  console.log(`✅ Contacts retrieved for Alice (${usersData.users.length} contacts found)`);

  // 5. Test Broadcast Realtime Room & Broadcast Message Delete
  console.log('\n--- Step 4: Testing Broadcast Socket Room & Message Deletion ---');
  await new Promise((resolve, reject) => {
    const bcastClient1 = Client(BASE_URL);
    const bcastClient2 = Client(BASE_URL);

    let sentMsgId = null;
    let client2DeletedMsg = false;

    bcastClient1.on('connect', () => {
      bcastClient1.emit('join_broadcast', { name: 'Broadcaster_Emma', avatarColor: '#ec4899' });
    });

    bcastClient1.on('broadcast_joined_success', (data) => {
      bcastClient2.emit('join_broadcast', { name: 'Broadcaster_Liam', avatarColor: '#3b82f6' });
    });

    bcastClient2.on('broadcast_joined_success', () => {
      bcastClient1.emit('send_broadcast_message', { content: 'This message will be deleted!' });
    });

    bcastClient1.on('new_broadcast_message', (msg) => {
      if (msg.senderName === 'Broadcaster_Emma') {
        sentMsgId = msg.id;
        console.log('✅ Broadcast message sent. ID:', sentMsgId);
        // Now Emma deletes the message
        bcastClient1.emit('delete_broadcast_message', { messageId: sentMsgId });
      }
    });

    bcastClient2.on('broadcast_message_deleted', ({ messageId }) => {
      if (messageId === sentMsgId) {
        console.log('✅ Liam received broadcast message deletion confirmation in realtime!');
        client2DeletedMsg = true;
        bcastClient1.disconnect();
        bcastClient2.disconnect();
        resolve();
      }
    });

    setTimeout(() => {
      if (!client2DeletedMsg) {
        bcastClient1.disconnect();
        bcastClient2.disconnect();
        reject(new Error('Broadcast message deletion timeout'));
      }
    }, 6000);
  });

  // 6. Test 1-on-1 Direct Messaging & Message Deletion
  console.log('\n--- Step 5: Testing 1-on-1 Direct Messaging & Real-Time Delete ---');
  await new Promise((resolve, reject) => {
    const aliceSocket = Client(BASE_URL);
    const bobSocket = Client(BASE_URL);

    let aliceAuthed = false;
    let bobAuthed = false;
    let dmMsgId = null;
    let deleteConfirmed = false;

    aliceSocket.on('connect', () => {
      aliceSocket.emit('auth_direct_user', aliceToken);
    });

    bobSocket.on('connect', () => {
      bobSocket.emit('auth_direct_user', bobToken);
    });

    aliceSocket.on('auth_direct_success', () => {
      aliceAuthed = true;
      checkAndSend();
    });

    bobSocket.on('auth_direct_success', () => {
      bobAuthed = true;
      checkAndSend();
    });

    function checkAndSend() {
      if (aliceAuthed && bobAuthed) {
        aliceSocket.emit('send_direct_message', {
          recipientId: bobUser.id,
          content: 'Confidential 1-to-1 message to be deleted'
        });
      }
    }

    aliceSocket.on('message_sent_confirm', (msg) => {
      dmMsgId = msg.id;
      console.log('✅ Alice sent 1-to-1 direct message. ID:', dmMsgId);
      // Alice now deletes this message
      aliceSocket.emit('delete_direct_message', {
        messageId: dmMsgId,
        contactId: bobUser.id
      });
    });

    bobSocket.on('direct_message_deleted', ({ messageId }) => {
      if (messageId === dmMsgId) {
        console.log('✅ Bob received realtime direct message deletion notification!');
        deleteConfirmed = true;
        aliceSocket.disconnect();
        bobSocket.disconnect();
        resolve();
      }
    });

    setTimeout(() => {
      if (!deleteConfirmed) {
        aliceSocket.disconnect();
        bobSocket.disconnect();
        reject(new Error('Direct message delete test timeout'));
      }
    }, 6000);
  });

  // 7. Test Group Creation ("Group Make") & Group Messaging
  console.log('\n--- Step 6: Testing Group Creation & Group Messaging ---');
  // Create a new group via REST API
  const groupRes = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aliceToken}`
    },
    body: JSON.stringify({
      name: '💡 Product Innovation Squad',
      description: 'Squad for brainstorming and features',
      memberIds: [bobUser.id]
    })
  });

  const groupData = await groupRes.json();
  if (!groupData.success || !groupData.group) {
    throw new Error('Group creation failed: ' + JSON.stringify(groupData));
  }
  const createdGroup = groupData.group;
  console.log('✅ Group created successfully:', createdGroup.name, `(ID: ${createdGroup.id})`);

  // Verify group messaging & group message deletion via Socket.IO
  await new Promise((resolve, reject) => {
    const aliceSocket = Client(BASE_URL);
    const bobSocket = Client(BASE_URL);

    let aliceAuthed = false;
    let bobAuthed = false;
    let gMsgId = null;
    let groupMsgDeleted = false;

    aliceSocket.on('connect', () => {
      aliceSocket.emit('auth_direct_user', aliceToken);
    });

    bobSocket.on('connect', () => {
      bobSocket.emit('auth_direct_user', bobToken);
    });

    aliceSocket.on('auth_direct_success', () => {
      aliceAuthed = true;
      checkGroup();
    });

    bobSocket.on('auth_direct_success', () => {
      bobAuthed = true;
      checkGroup();
    });

    function checkGroup() {
      if (aliceAuthed && bobAuthed) {
        // Send a group message from Alice
        aliceSocket.emit('send_group_message', {
          groupId: createdGroup.id,
          content: 'Hello Squad! This group message will test realtime group deletion.'
        });
      }
    }

    bobSocket.on('new_group_message', (msg) => {
      if (msg.groupId === createdGroup.id && msg.senderId === aliceUser.id) {
        gMsgId = msg.id;
        console.log('✅ Bob received Alice\'s group message in realtime. Msg ID:', gMsgId);
        // Alice deletes the group message
        aliceSocket.emit('delete_group_message', {
          messageId: gMsgId,
          groupId: createdGroup.id
        });
      }
    });

    bobSocket.on('group_message_deleted', ({ messageId, groupId }) => {
      if (messageId === gMsgId && groupId === createdGroup.id) {
        console.log('✅ Bob received group message deletion in realtime!');
        groupMsgDeleted = true;
        aliceSocket.disconnect();
        bobSocket.disconnect();
        resolve();
      }
    });

    setTimeout(() => {
      if (!groupMsgDeleted) {
        aliceSocket.disconnect();
        bobSocket.disconnect();
        reject(new Error('Group message delete test timeout'));
      }
    }, 6000);
  });

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Group creation, group messaging, and realtime message deletion are fully operational.');
  process.exit(0);
}

// Start test
setTimeout(() => {
  runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}, 1000);
