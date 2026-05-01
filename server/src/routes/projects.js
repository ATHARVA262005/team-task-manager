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
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description || null,
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

// Get project details (with pagination for members)
router.get('/:id', requireProjectMember, async (req, res) => {
  try {
    const { memberPage = 1, memberLimit = 50 } = req.query;
    const skip = (Number(memberPage) - 1) * Number(memberLimit);

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          skip,
          take: Number(memberLimit),
        },
        creator: { select: { id: true, name: true, email: true } },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { members: true } },
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
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: 'Project name cannot be empty' });
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: name ? name.trim() : undefined,
        description,
      },
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

    // Validate role
    if (role && !['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or MEMBER' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No user found with this email' });
    }

    // Check if already a member
    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: req.params.id,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId: req.params.id,
        userId: user.id,
        role: role || 'MEMBER',
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const io = req.app.get('io');
    io.to(`project:${req.params.id}`).emit('member:added', member);

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
      return res.status(400).json({ error: 'Cannot remove yourself. Transfer admin role first or delete the project.' });
    }

    // Check if removing the last admin
    const memberToRemove = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!memberToRemove) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (memberToRemove.role === 'ADMIN') {
      const adminCount = await prisma.projectMember.count({
        where: { projectId, role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot remove the last admin. Promote another member to admin first.',
        });
      }
    }

    // Unassign all tasks assigned to this user in the project
    const unassignedCount = await prisma.task.updateMany({
      where: { projectId, assigneeId: userId },
      data: { assigneeId: null },
    });

    await prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('member:removed', { userId, unassignedTasks: unassignedCount.count });

    res.json({ message: 'Member removed', unassignedTasks: unassignedCount.count });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change member role (Admin only)
router.put('/:id/members/:userId', requireAdmin, async (req, res) => {
  try {
    const { id: projectId, userId } = req.params;
    const { role } = req.body;

    if (!role || !['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or MEMBER' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // If demoting admin to member, check they're not the last admin
    if (role === 'MEMBER') {
      const memberToChange = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });

      if (memberToChange?.role === 'ADMIN') {
        const adminCount = await prisma.projectMember.count({
          where: { projectId, role: 'ADMIN' },
        });

        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot demote the last admin. Promote another member first.',
          });
        }
      }
    }

    const updated = await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('member:updated', updated);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
