let applicationId;
let sessionId;
let token;
let session;
let publisher;

// DOM Elements
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');
const videoModal = document.getElementById('video-modal');
const endCallBtn = document.getElementById('customer-end-call');
const subscriberEl = document.getElementById('subscriber-container');
const publisherEl = document.getElementById('publisher-container');
const videoControls = document.getElementById('video-controls');
const toggleAudioBtn = document.getElementById('cust-toggle-audio');
const toggleVideoBtn = document.getElementById('cust-toggle-video');

let isAudioMuted = false;
let isVideoStopped = false;

// Array to store chat history for Jev state
let messageHistory = [{ role: 'system', text: 'Hello! How can I help you today?' }];

async function initializeCustomer() {
  try {
    // Fetch a unique session for this user from your backend
    const res = await fetch('/api/auth/customer').then(r => r.json());
    applicationId = res.applicationId;
    sessionId = res.sessionId;
    token = res.token;

  } catch (err) {
    console.error("Failed to initialize Vonage session credentials:", err);
  }
}

function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  msgDiv.innerText = text;
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  if (role !== 'system') {
    messageHistory.push({ role, text });
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  // Show user message
  appendMessage('user', text);
  chatInput.value = '';

  try {
    // Intercept: Send full history to Jev via Express
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messageHistory,
      })
    });

    const data = await response.json();

    if (data.action === 'offer_escalation') {
      appendMessage('system', data.message);
      
      // Inject the opt-in button seamlessly into the chat
      const actionContainer = document.createElement('div');
      actionContainer.className = 'action-container';
      
      const connectBtn = document.createElement('button');
      connectBtn.textContent = 'Connect me to an Agent';
      
      connectBtn.addEventListener('click', async () => {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Alerting our team...';
        
        // Fire the signal to the dashboard
        await fetch('/api/escalate/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: 'user_' + Math.floor(Math.random() * 10000),
            sessionId,
            sentiment: data.sentiment,
            frustrationLevel: data.frustrationLevel,
            lastMessage: text
          })
        });
        
        chatInput.disabled = true;
        transitionToVideoCall();
      });
      
      actionContainer.appendChild(connectBtn);
      chatWindow.appendChild(actionContainer);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      return; 
    }

    // Hand off to AI Agent
    appendMessage('system', 'Typing...');
    const aiResponse = await mockWebLLMResponse(text);
    appendMessage('bot', aiResponse);

  } catch (error) {
    console.error("Chat error:", error);
    appendMessage('system', "Sorry, I'm having trouble connecting.");
  }
});

function transitionToVideoCall() {

  let subscriber;
  videoModal.showModal();
  session = OT.initSession(applicationId, sessionId);

  videoControls.style.display = 'flex'; // Show video controls


  // Listen for the employee joining the session
  session.on('streamCreated', (event) => {
    subscriberEl.innerHTML = ''; 
    document.getElementById('modal-title').textContent = "Live Support Connected";
    
    subscriber = session.subscribe(event.stream, subscriberEl, {
      insertMode: 'append', width: '100%', height: '100%'
    });
  });

  // If the agent hangs up, this event fires
  session.on('connectionDestroyed', () => {
    session.unsubscribe(subscriber);
    endActiveCall('Agent ended the video call.');
  });

  // Connect to the Vonage Session and publish customer camera
  session.connect(token, (error) => {
    if (error) {
      console.error('Connection error:', error);
      return;
    }

    publisher = OT.initPublisher(publisherEl, {
      insertMode: 'append', width: '100%', height: '100%'
    });

    session.publish(publisher);
  });
}

// Mock function to simulate WebLLM/Prompt API/AI Agent
async function mockWebLLMResponse(text) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(`This is a demo. "${text}" would be handled by the AI Agent and not get the call escalated to a live person. Try asking for an agent or human or sound frustrated.`);
    }, 1000);
  });
}

// Handle customer toggling audio and video
toggleAudioBtn.addEventListener('click', (e) => {
  if (!publisher) return;
  isAudioMuted = !isAudioMuted;
  publisher.publishAudio(!isAudioMuted);
  e.target.textContent = isAudioMuted ? "Unmute" : "Mute";
});

toggleVideoBtn.addEventListener('click', (e) => {
  if (!publisher) return;
  isVideoStopped = !isVideoStopped;
  publisher.publishVideo(!isVideoStopped);
  e.target.textContent = isVideoStopped ? "Start Camera" : "Stop Camera";
});

// Handle customer clicking the disconnect button
endCallBtn.addEventListener('click', () => {
  endActiveCall('You ended the video call.');
});

// Reusable cleanup function
function endActiveCall(systemMessage) {
  if (session) {
    session.disconnect();
    session = null;
  }
  videoModal.close();
  videoControls.style.display = 'none';
  toggleAudioBtn.textContent = "Mute";
  toggleVideoBtn.textContent = "Stop Camera";
  isAudioMuted = false;
  isVideoStopped = false;
  publisher = null; // Clear the publisher reference
  chatInput.disabled = false;
  document.getElementById('modal-title').textContent = "Connecting to a Live Agent...";
  subscriberEl.innerHTML = '';
  appendMessage('system', systemMessage);
}

initializeCustomer();