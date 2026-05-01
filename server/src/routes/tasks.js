const express = require('express');
const prisma = require('../utils/prisma');
const authenticate = require('../middleware/auth');
const { requireAdmin, requireProjectMember } = require('../middleware/rbac');

const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

// Project-scoped task routes: /api/projects/:projectId/tasks
const projectTaskRouter = express.Router({ mergeParams: true });
projectTaskRouter.use(authenticate);

// Task-scoped routes: /api/tasks/:id
const taskRouter = express.Router();
taskRouter.use(authenticate);

// --- Project-scoped routes ---

// Create task in a project (Admin only)
projectTaskRouter.post('/', requireAdmin, async (req, res) => {
  try {
    let { title, description, dueDate, priority, assigneeId } = req.body;

    // Validate title
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    title = title.trim();

    // Validate priority
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    // Validate and normalize due date
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      // Normalize to start of day UTC to avoid timezone issues
      parsedDueDate = new Date(Date.UTC(parsedDueDate.getFullYear(), parsedDueDate.getMonth(), parsedDueDate.getDate()));
    }

    // Validate assignee is a project member
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
        description: description || null,
        dueDate: parsedDueDate,
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

    const io = req.app.get('io');
    io.to(`project:${req.params.projectId}`).emit('task:created', task);

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List tasks in a project
projectTaskRouter.get('/', requireProjectMember, async (req, res) => {
  try {
    const { status, priority, assigneeId, page = 1, limit = 50 } = req.query;
    const where = { projectId: req.params.projectId };

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      where.status = status;
    }
    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }
      where.priority = priority;
    }
    if (assigneeId) where.assigneeId = assigneeId;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      tasks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Task-scoped routes ---

// Get single task
taskRouter.get('/:id', async (req, res) => {
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

    const isMember = task.project.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a project member' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update task (with optimistic locking)
taskRouter.put('/:id', async (req, res) => {
  try {
    const { version: clientVersion } = req.body;

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: { include: { members: true } } },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found — it may have been deleted' });
    }

    // Optimistic locking: check version
    if (clientVersion !== undefined && clientVersion !== task.version) {
      return res.status(409).json({
        error: 'Task was modified by someone else. Please refresh and try again.',
        currentVersion: task.version,
      });
    }

    const membership = task.project.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a project member — you may have been removed' });
    }

    const isAdmin = membership.role === 'ADMIN';
    const isAssignee = task.assigneeId === req.user.id;

    let data;
    if (isAdmin) {
      let { title, description, dueDate, priority, status, assigneeId } = req.body;

      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }

      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      if (title !== undefined && (!title || !title.trim())) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }

      if (assigneeId) {
        const isMember = task.project.members.some(m => m.userId === assigneeId);
        if (!isMember) {
          return res.status(400).json({ error: 'Assignee must be a project member' });
        }
      }

      let parsedDueDate = undefined;
      if (dueDate !== undefined) {
        if (dueDate === null || dueDate === '') {
          parsedDueDate = null;
        } else {
          parsedDueDate = new Date(dueDate);
          if (isNaN(parsedDueDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
          }
          parsedDueDate = new Date(Date.UTC(parsedDueDate.getFullYear(), parsedDueDate.getMonth(), parsedDueDate.getDate()));
        }
      }

      data = {
        title: title ? title.trim() : undefined,
        description,
        dueDate: parsedDueDate,
        priority,
        status,
        assigneeId,
      };
    } else if (isAssignee) {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Members can only update task status' });
      }
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      data = { status };
    } else {
      return res.status(403).json({ error: 'Only admins or the assignee can update tasks' });
    }

    // Remove undefined values and increment version
    Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
    data.version = { increment: 1 };

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    const io = req.app.get('io');
    io.to(`project:${task.projectId}`).emit('task:updated', updated);

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Task not found — it may have been deleted' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete task (Admin only)
taskRouter.delete('/:id', async (req, res) => {
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

    const projectId = task.projectId;
    await prisma.task.delete({ where: { id: req.params.id } });

    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('task:deleted', { id: req.params.id });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { projectTaskRouter, taskRouter };
