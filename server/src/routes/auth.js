const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = require('../utils/prisma');
const authenticate = require('../middleware/auth');

const router = express.Router();

// Rate limit login attempts: 5 per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit signup: 3 per hour per IP
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many signup attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    let { name, email, password } = req.body;

    // Validate and normalize
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    name = name.trim();
    email = email.trim().toLowerCase();

    if (name.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({ user, token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    email = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
