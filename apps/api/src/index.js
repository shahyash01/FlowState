require('dotenv').config();
const { createServer } = require('http');
const express = require('express');
const { Server } = require('socket.io');
const EventEmitter = require('events');
const cors = require('cors');

const { startSimulator } = require('@flowstate/data-provider');
const apiRoutes = require('./routes/api');
const store = require('@flowstate/store');

const { predictor, anomaly, narrator } = require('@flowstate/intelligence');
const { stateHistory } = require('@flowstate/intelligence');
const createAiRouter = require('./routes/ai');

const port = process.env.PORT || 3000;

const expressApp = express();
const server = createServer(expressApp);

// Enable CORS for all routes and websockets
expressApp.use(cors({ origin: '*' }));
const io = new Server(server, { cors: { origin: '*' } });

// Make io accessible to routes
expressApp.set('io', io);

// Parse JSON bodies
expressApp.use(express.json());

// Mount API routes
expressApp.use('/api', apiRoutes);
expressApp.use('/api/ai', createAiRouter(store.getState, io));

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

  const { getIntelligenceSummary } = predictor;
  const { getAnomalyReport } = anomaly;

  const enrichedState = {
    ...state,
    intelligence: getIntelligenceSummary(),
    anomalies: getAnomalyReport(state),
  };

  io.emit('state', enrichedState);
});
startSimulator(simEmitter);

// Start narrator
narrator.startNarrator(simEmitter, store.getState);
simEmitter.on('narrative:update', (narrative) => {
  io.emit('narrative:update', narrative);
});

server.listen(port, () => {
  console.log(`> API Server Ready on http://localhost:${port}`);
  console.log(`> Starting FlowState for ${store.getState().venue.name}`);
});
