import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ListTodo, Plus, CheckCircle2, Circle, Trash2,
  Calendar, Flag, AlertCircle
} from 'lucide-react';
import { getTasks, createTask, toggleTaskComplete, deleteTask } from '../../services/apiClient';
import { toast } from 'react-hot-toast';

export default function TasksPage() {
  const { userId } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newContent, setNewContent] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'pending', 'completed'

  const fetchTasksData = async () => {
    setLoading(true);
    const { data } = await getTasks(userId);
    if (data) setTasks(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasksData();
  }, [userId]);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      const { data, error } = await createTask(newContent.trim(), priority, dueDate || null);
      if (!error && data) {
        setTasks((prev) => [data, ...prev]);
        setNewContent('');
        setDueDate('');
        toast.success('Task added');
      }
    } catch {
      toast.error('Failed to add task');
    }
  };

  const handleToggle = async (taskId, current) => {
    const next = !current;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, is_completed: next } : t)));
    await toggleTaskComplete(taskId, next);
  };

  const handleDelete = async (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteTask(taskId);
    toast.success('Task removed');
  };

  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'pending') return !t.is_completed;
    if (activeTab === 'completed') return t.is_completed;
    return true;
  });

  const getPriorityBadge = (p) => {
    switch (p) {
      case 'high':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700  ">High</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700  ">Low</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700  ">Medium</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900  flex items-center gap-2.5">
          <ListTodo className="text-emerald-500" />
          Task Management
        </h1>
        <p className="text-xs text-slate-500  mt-1">
          Organize your daily priorities, deadlines, and action items.
        </p>
      </div>

      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="bg-white  p-4 rounded-2xl border border-slate-200/80  shadow-xs space-y-3">
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="What needs to be done? Press Enter to add..."
          className="w-full px-4 py-2 text-sm bg-slate-50  rounded-xl border border-transparent focus:border-indigo-500 focus:bg-white  outline-none text-slate-900  transition-all"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100  border-none text-slate-700 "
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100  border-none text-slate-700 "
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </form>

      {/* Tab Filters */}
      <div className="flex items-center gap-2 border-b border-slate-200/80  pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'all'
              ? 'bg-indigo-50  text-indigo-600 '
              : 'text-slate-500 hover:text-slate-900 '
          }`}
        >
          All ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'pending'
              ? 'bg-indigo-50  text-indigo-600 '
              : 'text-slate-500 hover:text-slate-900 '
          }`}
        >
          Pending ({tasks.filter((t) => !t.is_completed).length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'completed'
              ? 'bg-indigo-50  text-indigo-600 '
              : 'text-slate-500 hover:text-slate-900 '
          }`}
        >
          Completed ({tasks.filter((t) => t.is_completed).length})
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white  rounded-2xl p-12 border border-slate-200/80  text-center text-slate-400 text-sm">
          No tasks found in this view.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`group flex items-center justify-between p-4 rounded-xl border transition-all ${
                task.is_completed
                  ? 'bg-slate-50/70  border-slate-200/60  text-slate-400'
                  : 'bg-white  border-slate-200/80  text-slate-900  shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleToggle(task.id, task.is_completed)}
                  className="shrink-0 transition-transform active:scale-90"
                >
                  {task.is_completed ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : (
                    <Circle size={20} className="text-slate-300  hover:text-indigo-500" />
                  )}
                </button>
                <span className={`text-sm truncate ${task.is_completed ? 'line-through text-slate-400 ' : 'font-medium'}`}>
                  {task.content}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                {getPriorityBadge(task.priority)}
                {task.due_date && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-500 opacity-60 group-hover:opacity-100 transition-opacity"
                  title="Delete task"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
