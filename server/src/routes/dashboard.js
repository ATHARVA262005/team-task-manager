const express = require('express');
const prisma = require('../utils/prisma');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.user.id },
      select: { projectId: true },
    });

    const projectIds = memberships.map(m => m.projectId);

    if (projectIds.length === 0) {
      return res.json({
        totalTasks: 0,
        tasksByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
        tasksByPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 },
        overdueTasks: 0,
        tasksPerProject: [],
        tasksPerUser: [],
      });
    }

    const [totalTasks, tasksByStatus, tasksByPriority, overdueTasks, overdueTaskList, tasksPerProject, tasksPerUser] =
      await Promise.all([
        prisma.task.count({ where: { projectId: { in: projectIds } } }),
        prisma.task.groupBy({
          by: ['status'],
          where: { projectId: { in: projectIds } },
          _count: true,
        }),
        prisma.task.groupBy({
          by: ['priority'],
          where: { projectId: { in: projectIds } },
          _count: true,
        }),
        prisma.task.count({
          where: {
            projectId: { in: projectIds },
            status: { not: 'DONE' },
            dueDate: { lt: new Date() },
          },
        }),
        prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            status: { not: 'DONE' },
            dueDate: { lt: new Date() },
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            priority: true,
            status: true,
            project: { select: { name: true } },
            assignee: { select: { id: true, name: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 20,
        }),
        prisma.task.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: true,
        }),
        prisma.task.groupBy({
          by: ['assigneeId'],
          where: { projectId: { in: projectIds }, assigneeId: { not: null } },
          _count: true,
        }),
      ]);

    // Get project names
    const projects = await prisma.project.findMany({
      where: { id: { in: tasksPerProject.map(t => t.projectId) } },
      select: { id: true, name: true },
    });
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

    // Get user names for assigned tasks
    const userIds = tasksPerUser.map(t => t.assigneeId).filter(Boolean);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    // Also count unassigned tasks
    const unassignedCount = await prisma.task.count({
      where: { projectId: { in: projectIds }, assigneeId: null },
    });

    // Format status counts
    const statusMap = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    tasksByStatus.forEach(s => { statusMap[s.status] = s._count; });

    // Format priority counts
    const priorityMap = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    tasksByPriority.forEach(p => { priorityMap[p.priority] = p._count; });

    res.json({
      totalTasks,
      tasksByStatus: statusMap,
      tasksByPriority: priorityMap,
      overdueTasks,
      overdueTaskList: overdueTaskList.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
        projectName: t.project.name,
        assigneeName: t.assignee?.name || null,
      })),
      tasksPerProject: tasksPerProject.map(t => ({
        projectId: t.projectId,
        projectName: projectMap[t.projectId] || 'Unknown',
        count: t._count,
      })),
      tasksPerUser: [
        ...tasksPerUser.map(t => ({
          userId: t.assigneeId,
          userName: userMap[t.assigneeId] || 'Unknown',
          count: t._count,
        })),
        ...(unassignedCount > 0 ? [{ userId: null, userName: 'Unassigned', count: unassignedCount }] : []),
      ],
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
