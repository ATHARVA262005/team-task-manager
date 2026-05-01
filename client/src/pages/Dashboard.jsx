import { useState, useEffect } from 'react';
import api from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, ListTodo } from 'lucide-react';

const COLORS = ['#6366f1', '#f59e0b', '#10b981'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(res => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!stats) return null;

  const statusData = [
    { name: 'To Do', value: stats.tasksByStatus.TODO },
    { name: 'In Progress', value: stats.tasksByStatus.IN_PROGRESS },
    { name: 'Done', value: stats.tasksByStatus.DONE },
  ];

  const priorityData = [
    { name: 'Low', value: stats.tasksByPriority.LOW },
    { name: 'Medium', value: stats.tasksByPriority.MEDIUM },
    { name: 'High', value: stats.tasksByPriority.HIGH },
    { name: 'Urgent', value: stats.tasksByPriority.URGENT },
  ];

  const statCards = [
    { label: 'Total Tasks', value: stats.totalTasks, icon: ListTodo, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'To Do', value: stats.tasksByStatus.TODO, icon: Clock, color: 'bg-blue-50 text-blue-600' },
    { label: 'In Progress', value: stats.tasksByStatus.IN_PROGRESS, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
    { label: 'Completed', value: stats.tasksByStatus.DONE, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your tasks and projects</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overdue Alert */}
      {stats.overdueTasks > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-semibold">{stats.overdueTasks}</span> task{stats.overdueTasks > 1 ? 's' : ''} past their due date
          </p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tasks by Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2">
            {statusData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Tasks per Project</h3>
          {stats.tasksPerProject.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.tasksPerProject}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="projectName" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
              No projects yet
            </div>
          )}
        </div>
      </div>

      {/* Tasks per User */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Tasks per User</h3>
        {stats.tasksPerUser && stats.tasksPerUser.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.tasksPerUser} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="userName" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
            No tasks assigned yet
          </div>
        )}
      </div>
    </div>
  );
}
