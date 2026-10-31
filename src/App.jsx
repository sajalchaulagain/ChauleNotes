import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import NoteEditorPage from './pages/notes/NoteEditorPage';
import NotesListPage from './pages/notes/NotesListPage';
import TasksPage from './pages/tasks/TasksPage';
import TemplatesPage from './pages/templates/TemplatesPage';
import SettingsPage from './pages/settings/SettingsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import { Toaster, toast } from 'react-hot-toast';
import { createNote } from './services/apiClient';

// Quick Note Creation redirector
const QuickNoteRedirect = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    createNote({ title: 'Untitled Quick Note', owner_id: userId })
      .then(({ data }) => {
        if (data?.id) {
          navigate(`/note/${data.id}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      })
      .catch(() => navigate('/', { replace: true }));
  }, [userId, navigate]);

  return <LoadingSpinner />;
};

// Protected Route Guard
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

// Admin Route Guard
const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    toast.error('Admin privileges required to access this page');
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  React.useEffect(() => { document.documentElement.classList.remove('dark'); }, []);
  return (
    <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Authenticated Application Routes within Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/notes" element={<NotesListPage />} />
              <Route path="/favorites" element={<NotesListPage />} />
              <Route path="/archive" element={<NotesListPage />} />
              <Route path="/trash" element={<NotesListPage />} />
              <Route path="/recent" element={<NotesListPage />} />
              <Route path="/quick" element={<QuickNoteRedirect />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/note/:id" element={<NoteEditorPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Admin Panel (Admin Protected) */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboardPage />
                  </AdminRoute>
                }
              />
            </Route>

            {/* Fallback Catch-all Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" />
        </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
