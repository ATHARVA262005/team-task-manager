import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Plus, UserPlus, Trash2, X, ChevronDown, Calendar, Flag } from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLUMNS = [
  { key: 'TODO', label: 'To Do', color: 'bg-blue-500' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
  { key: 'DONE', label: 'Done', color: 'bg-emerald-500' },
];

const PRIORITY_COLORS = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');

  // Task form state
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', dueDate: '', priority: 'MEDIUM', assigneeId: '',
  });

  const socket = useSocket();

  const fetchProject = () => {
    api.get(`/projects/${id}`)
      .then(res => setProject(res.data))
      .catch(err => {
        if (err.response?.status === 403) navigate('/projects');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProject();

    if (socket && id) {
      socket.emit('join:project', id);

      const refetch = () => fetchProject();
      socket.on('task:created', refetch);
      socket.on('task:updated', refetch);
      socket.on('task:deleted', refetch);
      socket.on('member:added', refetch);
      socket.on('member:removed', refetch);
      socket.on('member:updated', refetch);

      return () => {
        socket.emit('leave:project', id);
        socket.off('task:created', refetch);
        socket.off('task:updated', refetch);
        socket.off('task:deleted', refetch);
        socket.off('member:added', refetch);
        socket.off('member:removed', refetch);
        socket.off('member:updated', refetch);
      };
    }
  }, [id, socket]);

  const isAdmin = project?.members?.find(m => m.userId === user?.id)?.role === 'ADMIN';

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...taskForm };
      if (!payload.dueDate) delete payload.dueDate;
      if (!payload.assigneeId) delete payload.assigneeId;
      await api.post(`/projects/${id}/tasks`, payload);
      setShowTaskModal(false);
      resetTaskForm();
      fetchProject();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create task');
    }
  };

  const handleUpdateTask = async (taskId, data, version) => {
    try {
      await api.put(`/tasks/${taskId}`, { ...data, version });
      fetchProject();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || 'Failed to update task';
      if (status === 409) {
        alert(msg);
        fetchProject(); // Refresh to get latest
      } else if (status === 404) {
        alert(msg);
        fetchProject(); // Task was deleted, refresh
      } else if (status === 403) {
        alert(msg);
        fetchProject(); // Member removed, refresh
      } else {
        alert(msg);
      }
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchProject();
    } catch (err) {
      if (err.response?.status === 404) {
        fetchProject(); // Already deleted, refresh
      } else {
        alert(err.response?.data?.error || 'Failed to delete task');
      }
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/projects/${id}/members`, { email: memberEmail, role: memberRole });
      setMemberEmail('');
      setShowMemberModal(false);
      fetchProject();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add member');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/projects/${id}/members/${userId}`, { role: newRole });
      fetchProject();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to change role');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member? Their assigned tasks will be unassigned.')) return;
    try {
      const res = await api.delete(`/projects/${id}/members/${userId}`);
      if (res.data.unassignedTasks > 0) {
        alert(`Member removed. ${res.data.unassignedTasks} task(s) were unassigned.`);
      }
      fetchProject();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const resetTaskForm = () => {
    setTaskForm({ title: '', description: '', dueDate: '', priority: 'MEDIUM', assigneeId: '' });
    setEditingTask(null);
  };

  const openEditTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      priority: task.priority,
      assigneeId: task.assigneeId || '',
    });
    setShowTaskModal(true);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (editingTask) {
      await handleUpdateTask(editingTask.id, taskForm, editingTask.version);
      setShowTaskModal(false);
      resetTaskForm();
    } else {
      await handleCreateTask(e);
    }
  };

  const handleStatusChange = (taskId, newStatus) => {
    const task = project?.tasks?.find(t => t.id === taskId);
    handleUpdateTask(taskId, { status: newStatus }, task?.version);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!project) return null;

  const tasksByStatus = (status) => project.tasks.filter(t => t.status === status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowMemberModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Members
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { resetTaskForm(); setShowTaskModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map(col => {
          const tasks = tasksByStatus(col.key);
          return (
            <div key={col.key} className="bg-gray-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                <h3 className="font-semibold text-gray-700 text-sm">{col.label}</h3>
                <span className="ml-auto text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full">{tasks.length}</span>
              </div>
              <div className="space-y-3">
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    currentUserId={user.id}
                    onEdit={openEditTask}
                    onDelete={handleDeleteTask}
                    onStatusChange={handleStatusChange}
                    members={project.members}
                  />
                ))}
                {tasks.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-400">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingTask ? 'Edit Task' : 'Create Task'}
              </h2>
              <button onClick={() => { setShowTaskModal(false); resetTaskForm(); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm resize-none"
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign To</label>
                <select
                  value={taskForm.assigneeId}
                  onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                >
                  <option value="">Unassigned</option>
                  {project.members.map(m => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTaskModal(false); resetTaskForm(); }}
                  className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition text-sm"
                >
                  {editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
              <button onClick={() => setShowMemberModal(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
              <input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
              />
              <select
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
              >
                Add
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {project.members.map(member => (
                <div key={member.user.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs">
                      {member.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.user.name}</p>
                      <p className="text-xs text-gray-500">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && member.user.id !== user.id ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                      </select>
                    ) : (
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        member.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                      )}>
                        {member.role}
                      </span>
                    )}
                    {isAdmin && member.user.id !== user.id && (
                      <button
                        onClick={() => handleRemoveMember(member.user.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, isAdmin, currentUserId, onEdit, onDelete, onStatusChange, members }) {
  const isAssignee = task.assigneeId === currentUserId;
  const canEdit = isAdmin || isAssignee;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

  return (
    <div className={clsx(
      'bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition',
      isOverdue ? 'border-red-200' : 'border-gray-200'
    )}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>
        {isAdmin && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(task)} className="p-1 text-gray-400 hover:text-indigo-600 transition">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button onClick={() => onDelete(task.id)} className="p-1 text-gray-400 hover:text-red-500 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </span>
        {task.dueDate && (
          <span className={clsx(
            'flex items-center gap-1 text-xs',
            isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'
          )}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        {task.assignee ? (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-semibold">
              {task.assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-gray-500">{task.assignee.name}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Unassigned</span>
        )}

        {canEdit && (
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </select>
        )}
      </div>
    </div>
  );
}
