const express = require('express');
const prisma = require('../utils/prisma');
const authenticate = require('../middleware/auth');
const { requireAdmin, requireProjectMember } = require('../middleware/rbac');

const router = express.Router();

router.use(authenticate);

// Create project
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        creatorId: req.user.id,
        members: {
          create: { userId: req.user.id, role: 'ADMIN' },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List user's projects
router.get('/', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        members: { some: { userId: req.user.id } },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get project details
router.get('/:id', requireProjectMember, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        creator: { select: { id: true, name: true, email: true } },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update project (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name, description },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete project (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add member (Admin only)
router.post('/:id/members', requireAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: req.params.id,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId: req.params.id,
        userId: user.id,
        role: role || 'MEMBER',
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove member (Admin only)
router.delete('/:id/members/:userId', requireAdmin, async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the project' });
    }

    await prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
