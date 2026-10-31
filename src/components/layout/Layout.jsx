import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../common/BrandLogo';
import { createNote } from '../../services/apiClient';
import { BRAND_NAME, TAGLINE } from '../../constants/config';
import { toast } from 'react-hot-toast';
import {
  Home, Search, FileText, Star, Clock,
  ListTodo, LayoutTemplate, Archive, Trash2, Settings,
  ChevronRight, ChevronLeft, LogOut, Plus, Menu,
  ShieldCheck
} from 'lucide-react';

export default function Layout() {
  const { user, signOut: contextSignOut, isAdmin, userId } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await contextSignOut();
    navigate('/login');
    toast.success('Signed out successfully');
  };

  const handleQuickCreateNote = async () => {
    try {
      const { data, error } = await createNote({
        title: 'Untitled Page',
        owner_id: userId,
      });
      if (!error && data?.id) {
        toast.success('New note created!');
        navigate(`/note/${data.id}`);
      } else {
        toast.error('Could not create note');
      }
    } catch (e) {
      toast.error('Failed to create note');
    }
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/notes?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const navItems = [
    { name: 'Dashboard', icon: Home, path: '/' },
    { name: 'All Notes', icon: FileText, path: '/notes' },
    { name: 'Favorites', icon: Star, path: '/favorites' },
    { name: 'Tasks', icon: ListTodo, path: '/tasks' },
    { name: 'Templates', icon: LayoutTemplate, path: '/templates' },
    { name: 'Archive', icon: Archive, path: '/archive' },
    { name: 'Trash', icon: Trash2, path: '/trash' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  if (isAdmin) {
    navItems.push({ name: 'Admin Panel', icon: ShieldCheck, path: '/admin' });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50  text-slate-900 ">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 transition-all duration-300 flex flex-col ${
          isSidebarOpen ? 'w-[250px]' : 'w-[72px]'
        } bg-white  border-r border-slate-200  ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0 shadow-sm`}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 ">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <BrandLogo compact />
            {isSidebarOpen && (
              <span className="font-bold text-base tracking-tight text-slate-900  truncate">
                {BRAND_NAME}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-600  hover:bg-slate-100  transition-colors"
            title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Quick New Note Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={handleQuickCreateNote}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-medium text-sm transition-all shadow-sm shadow-indigo-500/20`}
            title="Create New Note"
          >
            <Plus size={18} />
            {isSidebarOpen && <span>New Note</span>}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50  text-indigo-600  shadow-xs'
                    : 'text-slate-600  hover:bg-slate-100  hover:text-slate-900 '
                }`}
                title={!isSidebarOpen ? item.name : undefined}
              >
                <Icon size={18} className="shrink-0" />
                {isSidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-3 border-t border-slate-100  bg-slate-50/50 ">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-100  text-indigo-700  flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {user?.email?.[0] || 'U'}
              </div>
              {isSidebarOpen && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800  truncate">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    {isAdmin && <span className="text-indigo-500 font-medium">Admin</span>}
                    {!isAdmin && 'Member'}
                  </p>
                </div>
              )}
            </div>

            {isSidebarOpen && (
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50  transition-colors"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Navbar */}
        <header className="h-16 px-4 md:px-8 border-b border-slate-200  bg-white/70  backdrop-blur-md flex items-center justify-between gap-4 z-20 shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-slate-600  hover:bg-slate-100 "
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>

            {/* Global Search Input */}
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchSubmit}
                placeholder="Search notes, tasks, or press Enter..."
                className="w-full pl-9 pr-4 py-1.5 rounded-full text-sm bg-slate-100  border border-transparent focus:border-indigo-500 focus:bg-white  focus:outline-none transition-all placeholder:text-slate-400 text-slate-900 "
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={handleQuickCreateNote}
              className="p-2 rounded-xl bg-slate-100  text-slate-700  hover:bg-indigo-50  hover:text-indigo-600 transition-colors"
              title="Create Blank Note"
            >
              <Plus size={18} />
            </button>

          </div>
        </header>

        {/* Dynamic Page Outlet */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 ">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
