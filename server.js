const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const express = require('express');
const { Server } = require('socket.io');
const EventEmitter = require('events');

const { startSimulator } = require('./simulator');
const apiRoutes = require('./routes/api');
const store = require('./store');

const stateHistory = require('./intelligence/stateHistory');
const { startNarrator } = require('./intelligence/narrator');
const createAiRouter = require('./routes/ai');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server);
  
  // Make io accessible to routes
  expressApp.set('io', io);
  
  // Parse JSON bodies
  expressApp.use(express.json());

  // Mount API routes
  expressApp.use('/api', apiRoutes);
  expressApp.use('/api/ai', createAiRouter(store.getState, io));

  // Next.js page routing
  expressApp.use((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Socket.io setup
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    // Send initial state immediately
    socket.emit('state', store.getState());
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Start simulator
  const simEmitter = new EventEmitter();
  simEmitter.on('state:update', (state) => {
    stateHistory.recordSnapshot(state);

    const { getIntelligenceSummary } = require('./intelligence/predictor');
    const { getAnomalyReport } = require('./intelligence/anomaly');

    const enrichedState = {
      ...state,
      intelligence: getIntelligenceSummary(),
      anomalies: getAnomalyReport(state),
    };

    io.emit('state', enrichedState);
  });
  startSimulator(simEmitter);

  // Start narrator
  startNarrator(simEmitter, store.getState);
  simEmitter.on('narrative:update', (narrative) => {
    io.emit('narrative:update', narrative);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Starting FlowState for ${store.getState().venue.name}`);
  });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
