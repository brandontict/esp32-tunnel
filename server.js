const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.text());

let pendingRequests = [];
let responses = new Map();

// Clean up old requests every minute
setInterval(() => {
    const now = Date.now();
    pendingRequests = pendingRequests.filter(req => now - req.timestamp < 30000);
}, 60000);

// Public endpoint - where people visit your ESP32
app.all('/', async (req, res) => {
    const requestId = Date.now().toString();
    
    // Store the incoming request
    pendingRequests.push({
        id: requestId,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        timestamp: Date.now()
    });
    
    console.log(`New request: ${req.method} ${req.url}`);
    
    // Wait for ESP32 response (timeout after 15 seconds)
    const timeout = setTimeout(() => {
        if (!responses.has(requestId)) {
            res.status(504).send('<h1>ESP32 Timeout</h1><p>Your ESP32 might be offline or slow to respond.</p>');
        }
    }, 15000);
    
    // Check for response every 200ms
    const checkResponse = setInterval(() => {
        if (responses.has(requestId)) {
            clearTimeout(timeout);
            clearInterval(checkResponse);
            const response = responses.get(requestId);
            responses.delete(requestId);
            res.send(response);
        }
    }, 200);
});

// ESP32 polls this endpoint for new requests
app.get('/esp32/poll', (req, res) => {
    if (pendingRequests.length > 0) {
        const request = pendingRequests.shift();
        res.json(request);
    } else {
        res.json({ no_requests: true });
    }
});

// ESP32 sends responses here
app.post('/esp32/respond/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    responses.set(requestId, req.body);
    console.log(`Response received for request ${requestId}`);
    res.json({ success: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        pending_requests: pendingRequests.length,
        active_responses: responses.size 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`ESP32 Tunnel Server running on port ${PORT}`);
    console.log(`Visit this URL to access your ESP32!`);
});
