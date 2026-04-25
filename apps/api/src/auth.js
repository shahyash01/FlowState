const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set in production.');
  } else {
    console.warn('WARNING: JWT_SECRET is not set. API authentication will fail. Copy .env.example to .env and set a secret.');
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function generateToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authenticateToken, generateToken };
