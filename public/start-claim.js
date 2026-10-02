// Mock Identity Pool
const MOCK_USERS = [
  { name: "Dwane Vance", policy: "POL-948201-FL", vehicle: "2024 Tesla Model 3" },
  { name: "Elena Rostova", policy: "POL-381920-GA", vehicle: "2023 Honda CR-V" },
  { name: "Marcus Brody", policy: "POL-772184-NC", vehicle: "2025 Rivian R1T" }
];

const currentUser = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
document.getElementById('policy-user-name').textContent = currentUser.name;
document.getElementById('policy-number').textContent = currentUser.policy;
document.getElementById('policy-vehicle').textContent = currentUser.vehicle;

let applicationId, sessionId, token, session, publisher;
let capturedPhotos = []; // Max 4 base64 strings

// Step DOM elements
const startStep = document.getElementById('start-step');
const cameraStep = document.getElementById('camera-step');
const approvedStep = document.getElementById('approved-step');
const escalationDialog = document.getElementById('escalation-dialog');
const liveCallStage = document.getElementById('live-call-stage');

const cameraViewport = document.getElementById('customer-camera-preview');
const galleryTray = document.getElementById('gallery-tray');
const photoCountSpan = document.getElementById('photo-count');
const snapBtn = document.getElementById('btn-snap-photo');
const submitBtn = document.getElementById('btn-submit-claim');

// Initialize Vonage Session on Demand
document.getElementById('btn-start-inspection').addEventListener('click', async () => {
  document.getElementById('btn-start-inspection').disabled = true;
  document.getElementById('btn-start-inspection').textContent = "Initializing Camera...";

  const res = await fetch('/api/auth/customer').then(r => r.json());
  applicationId = res.applicationId;
  sessionId = res.sessionId;
  token = res.token;

  session = OT.initSession(applicationId, sessionId);

  // Initialize mobile rear-facing camera
  publisher = OT.initPublisher(cameraViewport, {
    insertMode: 'append',
    width: '100%',
    height: '100%',
    videoSource: true,
    facingMode: 'environment', // Request mobile back camera
    publishAudio: false // No audio needed during snapshot stage
  }, (err) => {
    if (err) {
      alert("Unable to access camera: " + err.message);
      return;
    }
    startStep.style.display = 'none';
    cameraStep.style.display = 'flex';
  });
});

// Snapshot Logic using publisher.getImgData()
snapBtn.addEventListener('click', () => {
  if (capturedPhotos.length >= 4) return;

  const rawBase64 = publisher.getImgData();
  if (!rawBase64) return;

  const fullDataUri = `data:image/png;base64,${rawBase64}`;
  capturedPhotos.push(fullDataUri);
  renderGallery();
});

function renderGallery() {
  galleryTray.innerHTML = '';
  capturedPhotos.forEach((dataUri, idx) => {
    const card = document.createElement('div');
    card.className = 'thumb-card';
    card.innerHTML = `
      <img src="${dataUri}" alt="Capture ${idx + 1}">
      <button type="button" class="thumb-delete" onclick="removePhoto(${idx})">✕</button>
    `;
    galleryTray.appendChild(card);
  });

  photoCountSpan.textContent = capturedPhotos.length;
  snapBtn.disabled = capturedPhotos.length >= 4;
  submitBtn.disabled = capturedPhotos.length === 0;
}

window.removePhoto = function (index) {
  capturedPhotos.splice(index, 1);
  renderGallery();
};

// Claim Submission & Clef Evaluation
submitBtn.addEventListener('click', async () => {
  submitBtn.disabled = true;
  submitBtn.textContent = "AI Analyzing Damage...";

  try {
    const response = await fetch('/api/process-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        user: currentUser,
        images: capturedPhotos
      })
    });

    const data = await response.json();

    if (data.decision === 'straight_through_approved') {
      // Clean up Vonage Session
      publisher.destroy();
      cameraStep.style.display = 'none';
      approvedStep.style.display = 'flex';
      document.getElementById('approved-summary').textContent = 
        `Damage assessment: ${data.evaluation.damage_type.toUpperCase()} to ${data.evaluation.vehicle_part}. Drivable vehicle confirmed.`;
    } else {
      // Escalation required: open modal
      document.getElementById('escalation-reasons').textContent = 
        `Classification: ${data.evaluation.damage_type.toUpperCase()} on ${data.evaluation.vehicle_part}. Tow Truck Required: ${data.evaluation.requires_tow ? 'YES' : 'NO'}.`;
      escalationDialog.showModal();
    }
  } catch (err) {
    console.error("Claim processing error:", err);
    alert("Evaluation failed. Please try again.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Assessment";
  }
});

// Trigger Live Video Escalation
document.getElementById('btn-connect-agent').addEventListener('click', async () => {
  escalationDialog.close();
  cameraStep.style.display = 'none';
  liveCallStage.style.display = 'flex';

  // Reparent publisher to in-call customer container and enable audio
  document.getElementById('customer-publisher-container').appendChild(cameraViewport);
  publisher.publishAudio(true);

  // Notify backend to broadcast Vonage Signal to dispatch dashboard
  await fetch('/api/escalate/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: currentUser.policy,
      user: currentUser,
      sessionId
    })
  });

  // Connect to session
  session.connect(token, (err) => {
    if (err) return console.error('Connection error:', err);
    session.publish(publisher);
  });

  session.on('streamCreated', (event) => {
    const subscriberContainer = document.getElementById('agent-subscriber-container');
    subscriberContainer.innerHTML = '';
    session.subscribe(event.stream, subscriberContainer, {
      insertMode: 'append', width: '100%', height: '100%'
    });
  });

  session.on('connectionDestroyed', () => {
    alert('The adjuster has ended the session.');
    window.location.reload();
  });
});

// Mobile Video Controls
document.getElementById('btn-cycle-camera').addEventListener('click', () => {
  if (publisher) publisher.cycleVideo();
});

let isMuted = false;
document.getElementById('btn-toggle-audio').addEventListener('click', (e) => {
  if (!publisher) return;
  isMuted = !isMuted;
  publisher.publishAudio(!isMuted);
  e.target.textContent = isMuted ? "Unmute" : "Mute";
});

let isVideoOff = false;
document.getElementById('btn-toggle-video').addEventListener('click', (e) => {
  if (!publisher) return;
  isVideoOff = !isVideoOff;
  publisher.publishVideo(!isVideoOff);
  e.target.textContent = isVideoOff ? "Video On" : "Video Off";
});

document.getElementById('btn-end-call').addEventListener('click', () => {
  if (session) session.disconnect();
  window.location.reload();
});