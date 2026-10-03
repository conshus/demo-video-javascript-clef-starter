import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Vonage } from '@vonage/server-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

// Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Check for required env vars
if (!process.env.VONAGE_APPLICATION_ID || !process.env.VONAGE_PRIVATE_KEY || !process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AUTH_TOKEN) {
  console.error("Missing required environment variables. Please check your .env file.");
  process.exit(1);
}

// Initialize Vonage SDK
const vonage = new Vonage({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: process.env.VONAGE_PRIVATE_KEY
});

// In-memory store for room sessions
const roomToSessionIdDictionary = {};

// Helper to ensure the dispatch session always exists
async function getDispatchSessionId() {
  if (roomToSessionIdDictionary['dispatch']) {
    return roomToSessionIdDictionary['dispatch'];
  }

  // Create it on the fly if it doesn't exist yet
  const session = await vonage.video.createSession({ mediaMode: 'routed' });
  roomToSessionIdDictionary['dispatch'] = session.sessionId;
  console.log('Created new Dispatch Session:', session.sessionId);

  return session.sessionId;
}

// Employee Dashboard Route & Auth
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/auth/dispatch', async (req, res) => {
  const dispatchSessionId = await getDispatchSessionId();
  const token = vonage.video.generateClientToken(dispatchSessionId, {
    role: 'subscriber' // Employees only listen in the dispatch session
  });

  res.json({
    applicationId: process.env.VONAGE_APPLICATION_ID,
    dispatchSessionId: dispatchSessionId,
    dispatchToken: token
  });
});

// Customer Auth (Generates a unique session per customer)
app.get('/api/auth/customer', async (req, res) => {
  try {
    const session = await vonage.video.createSession({ mediaMode: 'routed' });
    const token = vonage.video.generateClientToken(session.sessionId, {
      role: 'publisher'
    });

    res.json({
      applicationId: process.env.VONAGE_APPLICATION_ID,
      sessionId: session.sessionId,
      token: token
    });
  } catch (error) {
    console.error('Error creating customer session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Jev Interception & Escalation Trigger
app.post('/api/evaluate', async (req, res) => {
  const { messages } = req.body;

  try {
    const evaluation = await jev.systemOne({
      // We pass the full message array as the state
      state: messages,
      questions: {
        sentiment: choice("What is the user's current sentiment?", {
          happy: null,
          neutral: null,
          confused: null,
          frustrated: null,
          angry: null
        }),
        frustrationLevel: score("How frustrated is the user?", [
          "Calm, neutral, or happy",             // 0
          "Slightly annoyed but polite",         // 1
          "Visibly frustrated or impatient",     // 2
          "Extremely angry, aggressive, or rude" // 3
        ]),
        explicitEscalation: noul("Does the user explicitly ask to speak to a human, agent, or representative?")
      }
    });

    console.dir(evaluation, { depth: null });

    const userSentiment = evaluation.answers.sentiment.choice;
    const userSentimentConfidence = evaluation.answers.sentiment.confidence;
    const frustrationScore = evaluation.answers.frustrationLevel.score;
    const frustrationLevel = evaluation.answers.frustrationLevel.legend[Math.round(evaluation.answers.frustrationLevel.score)];
    const wantsHuman = evaluation.answers.explicitEscalation.noul > 0.8; // Returns true/false based on probability

    // The Escalation Threshold
    if (frustrationScore >= 2 || (['frustrated', 'angry'].includes(userSentiment) && userSentimentConfidence > 0.8) || wantsHuman) {

      let message = `${wantsHuman || ['angry'].includes(userSentiment) ? "I'll connect you to a live agent." : 'It seems like you might need more help than I can offer. Would you like to connect with a live agent?'}`;
      return res.json({
        action: 'offer_escalation',
        sentiment: userSentiment,
        frustrationLevel: frustrationLevel,
        lastMessage: messages[messages.length - 1].text,
        message
      });
    }

    // Pass to AI Agent
    return res.json({ action: 'continue' });

  } catch (error) {
    console.error("Jev evaluation failed:", error);
    // Failsafe: if the evaluation fails, continue to the local LLM rather than breaking the chat.
    return res.json({ action: 'continue' });
  }
});

// Trigger the signal only when the user clicks the opt-in button
app.post('/api/escalate/trigger', async (req, res) => {
  const { customerId, sessionId, sentiment, frustrationLevel, lastMessage } = req.body;
  console.log('Trigger escalation request received: ', req.body);
  try {
    const dispatchSessionId = await getDispatchSessionId();
    console.log('Dispatch session ID obtained: ', dispatchSessionId);
    await vonage.video.sendSignal({
      type: 'escalation',
      data: JSON.stringify({ customerId, sessionId, sentiment, frustrationLevel, lastMessage })
    }, dispatchSessionId);
    console.log('Escalation signal sent successfully');
    res.json({ success: true });
  } catch (error) {
    console.log('Error sending escalation signal:', error);
    res.status(500).json({ error: 'Failed to broadcast escalation signal' });
  }
});

// An Employee Claims the Call
app.post('/api/escalate/claim', async (req, res) => {
  const { customerId } = req.body;
  try {
    const dispatchSessionId = await getDispatchSessionId();
    // Tell other dashboard clients to remove the card
    await vonage.video.sendSignal({
      type: 'claimed',
      data: JSON.stringify({ customerId })
    }, dispatchSessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending claim signal:', error);
    res.status(500).json({ error: 'Failed to broadcast claim' });
  }
});

// Generate a token for the employee joining the customer's unique session
app.post('/api/auth/customer-token', (req, res) => {
  const { sessionId } = req.body;
  const token = vonage.video.generateClientToken(sessionId, {
    role: 'publisher'
  });
  res.json({ token });
});



app.post('/api/process-claim', async (req, res) => {
    const { images, sessionId } = req.body; // Array of up to 4 base64 strings

    // Save images to server for the Adjuster Dashboard
    images.forEach((imgBase64, index) => {
        // Strip the data:image/png;base64, prefix before saving to disk
        const base64Data = imgBase64.replace(/^data:image\/png;base64,/, "");
        fs.mkdirSync(`uploads/${sessionId}`, { recursive: true });
        fs.writeFileSync(`uploads/${sessionId}/claim_${Date.now()}_img${index}.png`, base64Data, 'base64');
    });

    // Call Cloudflare Clef-Flash
    const clefPayload = {
        context: "Evaluate the vehicle damage in the images to determine insurance claim routing.",
        images: images, // Pass the array directly (Clef accepts up to 4)
        questions: {
            damage_type: {
                type: "choice",
                instructions: "What type of damage is present on the vehicle?",
                criteria: {
                  scratch: "Scratch",
                  dent: "Dent",
                  shattered_glass: "Shattered Glass",
                  total_loss: "Total Loss",
                  none: "None"
                }
            },
            vehicle_part: {
                type: "choice",
                instructions: "Which part of the vehicle is damaged?",
                criteria: {
                  front_bumper: "Front Bumper",
                  windshield: "Windshield",
                  door: "Door",
                  unknown: "Unknown"
                }
            },
            requires_tow: {
                type: "noul",
					      instructions: "Does this vehicle require towing?",
            }
        }
    };

    try {
        const clefResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-flash`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CLOUDFLARE_AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clefPayload)
        });

        const clefResult = await clefResponse.json();
        
        // 3. Routing Logic based on Clef's decision
        let routingDecision = "standard_queue";
        if (clefResult.result.damage_type === "total_loss" || clefResult.result.requires_tow === true) {
            routingDecision = "emergency_adjuster";
            // Here you could trigger a Vonage Voice API call to the towing company
            // or route the Vonage Video session to a Tier 2 agent.
        }

        // Return the decision and the raw Clef evaluation back to the client UI
        res.json({ 
            status: "success", 
            routing: routingDecision, 
            evaluation: clefResult.result 
        });

    } catch (error) {
        console.error("Clef Evaluation Error:", error);
        res.status(500).json({ error: "Failed to evaluate claim" });
    }
});
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
