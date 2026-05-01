const prisma = require('../utils/prisma');

const requireAdmin = async (req, res, next) => {
  try {
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.user.id,
        },
      },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
};

const requireProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.user.id,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a project member' });
    }

    req.membership = membership;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { requireAdmin, requireProjectMember };
