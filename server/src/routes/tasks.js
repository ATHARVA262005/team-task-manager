const express = require('express');
const prisma = require('../utils/prisma');
const authenticate = require('../middleware/auth');
const { requireAdmin, requireProjectMember } = require('../middleware/rbac');

const router = express.Router();

router.use(authenticate);

// Create task in a project
router.post('/projects/:projectId/tasks', requireProjectMember, async (req, res) => {
  try {
    const { title, description, dueDate, priority, assigneeId } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // If assigneeId provided, verify they're a project member
    if (assigneeId) {
      const isMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: req.params.projectId,
            userId: assigneeId,
          },
        },
      });
      if (!isMember) {
        return res.status(400).json({ error: 'Assignee must be a project member' });
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || 'MEDIUM',
        projectId: req.params.projectId,
        creatorId: req.user.id,
        assigneeId: assigneeId || null,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List tasks in a project
router.get('/projects/:projectId/tasks', requireProjectMember, async (req, res) => {
  try {
    const { status, priority, assigneeId } = req.query;
    const where = { projectId: req.params.projectId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single task
router.get('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        project: {
          include: {
            members: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify user is a project member
    const isMember = task.project.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a project member' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { members: true } } },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const membership = task.project.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a project member' });
    }

    const isAdmin = membership.role === 'ADMIN';
    const isAssignee = task.assigneeId === req.user.id;

    let data;
    if (isAdmin) {
      // Admin can update everything
      const { title, description, dueDate, priority, status, assigneeId } = req.body;
      data = { title, description, dueDate: dueDate ? new Date(dueDate) : undefined, priority, status, assigneeId };
    } else if (isAssignee) {
      // Members can only update status
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Members can only update task status' });
      }
      data = { status };
    } else {
      return res.status(403).json({ error: 'Only admins or the assignee can update tasks' });
    }

    // Remove undefined values
    Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete task (Admin only - checked via project membership)
router.delete('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { members: true } } },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const membership = task.project.members.find(m => m.userId === req.user.id);
    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
