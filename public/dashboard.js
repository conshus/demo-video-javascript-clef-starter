let applicationId, dispatchSession, customerSession, publisher;
const dashboardAlerts = document.getElementById('dashboard-alerts');
const subscriberEl = document.getElementById('subscriber-container');
const publisherEl = document.getElementById('publisher-container');
const agentControls = document.getElementById('agent-controls');
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
  if (document.getElementById(`card-${data.customerId}`)) return;

  const card = document.createElement('article');
  card.id = `card-${data.customerId}`;
  card.className = 'escalation-card alert-glow';
  card.innerHTML = `
    <div class="badge-danger">URGENT: ${data.evaluation.damage_type.toUpperCase()}</div>
    <h4>${data.user.name}</h4>
    <p><strong>Vehicle:</strong> ${data.user.vehicle}</p>
    <p><strong>Part:</strong> ${data.evaluation.vehicle_part}</p>
    <p><strong>Tow Required:</strong> ${data.evaluation.requires_tow ? 'YES' : 'NO'}</p>
    <button class="btn-primary" onclick="claimIncident('${data.customerId}', '${data.sessionId}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
      Accept & Join Video
    </button>
  `;
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
  document.getElementById('agent-clef-damage').textContent = `${fullPayload.evaluation.damage_type} (${fullPayload.evaluation.vehicle_part})`;

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
    customerSession.disconnect();
    customerSession = null;
  }
  agentControls.style.display = 'none';
  activeClaimPanel.style.display = 'none';
  subscriberEl.innerHTML = '<p>Customer Stream Unavailable</p>';
  publisherEl.innerHTML = '<p>Adjuster Camera</p>';
  callStatus.textContent = 'Status: Waiting for incoming claims...';
}

document.getElementById('agent-end-call').addEventListener('click', resetStage);

initializeDashboard();