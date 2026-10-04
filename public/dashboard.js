let applicationId, dispatchSession, customerSession, publisher;
let isAgentAudioMuted = false;
let isAgentVideoStopped = false;
const dashboardAlerts = document.getElementById('dashboard-alerts');
const subscriberEl = document.getElementById('subscriber-container');
const publisherEl = document.getElementById('publisher-container');
const agentControls = document.getElementById('agent-controls');
const toggleAudioBtn = document.getElementById('agent-toggle-audio');
const toggleVideoBtn = document.getElementById('agent-toggle-video');
const endCallBtn = document.getElementById('agent-end-call');
const activeClaimPanel = document.getElementById('active-claim-panel');
const callStatus = document.getElementById('call-status');

async function initializeDashboard() {
  const res = await fetch('/api/auth/dispatch').then(r => r.json());
  applicationId = res.applicationId;

  dispatchSession = OT.initSession(applicationId, res.dispatchSessionId);

  dispatchSession.on('signal:escalation', (event) => {
    const payload = JSON.parse(event.data);
    showEscalationCard(payload);
  });

  dispatchSession.on('signal:claimed', (event) => {
    const payload = JSON.parse(event.data);
    removeEscalationCard(payload.customerId);
  });

  dispatchSession.connect(res.dispatchToken, (err) => {
    if (err) console.error("Failed to connect to dispatch:", err);
  });
}

function showEscalationCard(data) {
  console.log('Received escalation data:', data);
  // if (document.getElementById(`card-${data.customerId}`)) return;

  // const card = document.createElement('article');
  // card.id = `card-${data.customerId}`;
  // // card.className = 'escalation-card alert-glow';
  // if (data.triggerReason === 'customer_override') {
  //   card.className = 'escalation-card alert-override';
  // } else {
  //   card.className = 'escalation-card alert-glow';
  // }
  // card.innerHTML = `
  //   <div class="badge-danger">URGENT: ${data.evaluation.damage_type.toUpperCase()}</div>
  //   <h4>${data.user.name}</h4>
  //   <p><strong>Vehicle:</strong> ${data.user.vehicle}</p>
  //   <p><strong>Part:</strong> ${data.evaluation.vehicle_part}</p>
  //   <p><strong>Tow Required:</strong> ${data.evaluation.requires_tow ? 'YES' : 'NO'}</p>
  //   <button class="btn-primary" onclick="claimIncident('${data.customerId}', '${data.sessionId}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
  //     Accept & Join Video
  //   </button>
  // `;
    const cardId = 'card-' + data.customerId;
  if (document.getElementById(cardId)) return;

  const card = document.createElement('article');
  card.id = cardId;
  // Differentiate styling based on the trigger reason
  if (data.triggerReason === 'customer_override') {
    card.className = 'escalation-card alert-override';
  } else {
    card.className = 'escalation-card alert-glow';
  }

  const badge = document.createElement('div');
  badge.className = data.triggerReason === 'customer_override' ? 'badge-warning' : 'badge-danger';

  const severityText = data.evaluation.severity?.choice || 'UNKNOWN';
  badge.textContent = data.triggerReason === 'customer_override' 
    ? 'MANUAL OVERRIDE: CUSTOMER DISPUTE' 
    : 'URGENT: ' + severityText.toUpperCase();

  const title = document.createElement('h4');
  title.textContent = data.user.name;

  const pVehicle = document.createElement('p');
  pVehicle.innerHTML = '<strong>Vehicle:</strong> ' + data.user.vehicle;

  // const pPart = document.createElement('p');
  // pPart.innerHTML = '<strong>Part:</strong> ' + data.evaluation.vehicle_part;

  const pTow = document.createElement('p');
  const towText = data.evaluation.requires_tow.noul > 0.8 ? 'YES' : 'NO';
  pTow.innerHTML = '<strong>Tow Required:</strong> ' + towText;

  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.style.marginTop = '1rem';
  btn.textContent = 'Accept & Join Video';
  btn.onclick = () => claimIncident(data.customerId, data.sessionId, data);

  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(pVehicle);
  // card.appendChild(pPart);
  card.appendChild(pTow);
  card.appendChild(btn);

  dashboardAlerts.appendChild(card);
}

function removeEscalationCard(id) {
  const el = document.getElementById(`card-${id}`);
  if (el) el.remove();
}

window.claimIncident = async function(customerId, customerSessionId, fullPayload) {
  // Claim incident across all dispatch consoles
  await fetch('/api/escalate/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId })
  });

  removeEscalationCard(customerId);

  // Populate Claim File UI
  activeClaimPanel.style.display = 'block';
  document.getElementById('agent-cust-name').textContent = fullPayload.user.name;
  document.getElementById('agent-policy-num').textContent = fullPayload.user.policy;
  document.getElementById('agent-vehicle-model').textContent = fullPayload.user.vehicle;
  document.getElementById('agent-clef-damage').textContent = `${fullPayload.evaluation.severity?.choice}`;

  const tray = document.getElementById('agent-photo-tray');
  tray.innerHTML = '';
  fullPayload.imageUrls.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.className = 'thumb-inspect';
    img.onclick = () => {
      document.getElementById('enlarged-img').src = url;
      document.getElementById('photo-dialog').showModal();
    };
    tray.appendChild(img);
  });

  // Get publisher token for customer's session
  const { token } = await fetch('/api/auth/customer-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: customerSessionId })
  }).then(r => r.json());

  // Join the Customer's 1:1 Vonage Session
  customerSession = OT.initSession(applicationId, customerSessionId);

  customerSession.on('streamCreated', (event) => {
    subscriberEl.innerHTML = '';
    customerSession.subscribe(event.stream, subscriberEl, {
      insertMode: 'append', width: '100%', height: '100%'
    });
    callStatus.textContent = `In active consultation with ${fullPayload.user.name}`;
  });

  customerSession.on('connectionDestroyed', () => {
    resetStage();
  });

  customerSession.connect(token, (err) => {
    if (err) return console.error(err);

    publisherEl.innerHTML = '';
    publisher = OT.initPublisher(publisherEl, {
      insertMode: 'append', width: '100%', height: '100%'
    });
    customerSession.publish(publisher);
    agentControls.style.display = 'flex';
  });
};

function resetStage() {
  if (customerSession) {
    publisher.destroy();
    customerSession.disconnect();
    customerSession = null;
  }
  agentControls.style.display = 'none';
  activeClaimPanel.style.display = 'none';
  subscriberEl.innerHTML = '<p>Customer Stream Unavailable</p>';
  publisherEl.innerHTML = '<p>Adjuster Camera</p>';
  callStatus.textContent = 'Status: Waiting for incoming claims...';
}

toggleAudioBtn.addEventListener('click', (e) => {
    if (!publisher) return;
    isAgentAudioMuted = !isAgentAudioMuted;
    publisher.publishAudio(!isAgentAudioMuted);
    e.target.textContent = isAgentAudioMuted ? "Unmute" : "Mute";
});

toggleVideoBtn.addEventListener('click', (e) => {
    if (!publisher) return;
    isAgentVideoStopped = !isAgentVideoStopped;
    publisher.publishVideo(!isAgentVideoStopped);
    e.target.textContent = isAgentVideoStopped ? "Start Camera" : "Stop Camera";
});

endCallBtn.addEventListener('click', resetStage);

initializeDashboard();