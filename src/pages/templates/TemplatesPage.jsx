import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createNote } from '../../services/apiClient';
import {
  LayoutTemplate, ArrowRight, Calendar, Users,
  Code2, BookOpen, Lightbulb, CheckSquare
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const TEMPLATES = [
  {
    id: 'tpl-meeting-notes',
    title: 'Meeting Notes & Action Items',
    description: 'Structure your meetings with agendas, participant lists, key decisions, and assigned follow-ups.',
    icon: Users,
    color: 'text-indigo-600 bg-indigo-50 ',
    tags: ['meeting', 'team', 'decisions'],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Date: ' }, { type: 'text', text: new Date().toLocaleDateString() }, { type: 'text', text: ' | Attendees: ' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🎯 Objectives & Agenda' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review sprint progress' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Address project blockers' }] }] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📝 Key Discussion Points' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Record key discussion items and takeaways here...' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Action Items' }] },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[Owner] Action item 1 (Due by Friday)' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[Owner] Action item 2' }] }] },
          ],
        },
      ],
    },
  },
  {
    id: 'tpl-weekly-planner',
    title: 'Weekly Productivity Sprint',
    description: 'Plan your weekly goals, daily focus blocks, habits, and retrospective evaluation.',
    icon: Calendar,
    color: 'text-violet-600 bg-violet-50 ',
    tags: ['productivity', 'goals', 'planning'],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Weekly Planning & Sprint' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '⭐ High-Priority Outcomes' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Milestone 1: Deliver core feature' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Milestone 2: Review documentation' }] }] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📅 Daily Focus Schedule' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Monday: Planning & Architecture' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Tuesday - Thursday: Deep Work & Execution' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Friday: Testing, Retro & Review' }] },
      ],
    },
  },
  {
    id: 'tpl-system-design',
    title: 'Software Architecture Document',
    description: 'Document system overview, components, data flows, API specifications, and tradeoffs.',
    icon: Code2,
    color: 'text-emerald-600 bg-emerald-50 ',
    tags: ['architecture', 'tech-spec', 'engineering'],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Technical Design Document' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '1. Context & Background' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Describe problem statement, requirements, and user personas.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '2. High-Level Architecture' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Frontend: React, Vite, Tiptap, TailwindCSS' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Backend: Python FastAPI (JWT security guard) + Firebase (Firestore, Auth)' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '3. Data Model & Security' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Python verifies the JWT and checks the role in Firestore before every read or write.' }] },
      ],
    },
  },
  {
    id: 'tpl-brainstorming',
    title: 'Idea Brainstorm & Pitch',
    description: 'Transform raw thoughts into refined concepts with problem statements and value propositions.',
    icon: Lightbulb,
    color: 'text-amber-600 bg-amber-50 ',
    tags: ['brainstorm', 'ideation', 'pitch'],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Idea Proposal & Brainstorm' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💡 The Big Idea' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Summarize the idea in 2-3 compelling sentences.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '❓ What Problem Does It Solve?' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Current friction, pain points, and target beneficiaries.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🚀 Key Features & Differentiators' }] },
      ],
    },
  },
  {
    id: 'tpl-daily-journal',
    title: 'Daily Reflection & Journal',
    description: 'Cultivate mindfulness with daily gratitudes, top priorities, and evening reflections.',
    icon: BookOpen,
    color: 'text-pink-600 bg-pink-50 ',
    tags: ['journal', 'mindset', 'habits'],
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Daily Reflection' }] },
        { type: 'paragraph', content: [{ type: 'text', text: `Entry Date: ${new Date().toLocaleDateString()}` }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '🙏 Three Things I Am Grateful For' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1. ' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2. ' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '3. ' }] }] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✨ Today\'s Win & Lesson' }] },
      ],
    },
  },
];

export default function TemplatesPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const handleUseTemplate = async (template) => {
    try {
      const { data, error } = await createNote({
        title: template.title,
        content: template.content,
        tags: template.tags,
        owner_id: userId,
      });

      if (!error && data?.id) {
        toast.success(`Created note from "${template.title}"`);
        navigate(`/note/${data.id}`);
      } else {
        toast.error('Failed to instantiate template');
      }
    } catch {
      toast.error('Could not apply template');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900  flex items-center gap-2.5">
          <LayoutTemplate className="text-indigo-600" />
          Note Templates
        </h1>
        <p className="text-xs text-slate-500  mt-1">
          Kickstart your thoughts with pre-configured Notion-style templates.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <div
              key={tpl.id}
              className="bg-white  p-6 rounded-2xl border border-slate-200/80  shadow-xs flex flex-col justify-between hover:border-indigo-500/50 hover:shadow-md transition-all"
            >
              <div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${tpl.color}`}>
                  <Icon size={24} />
                </div>
                <h3 className="font-bold text-base text-slate-900  mb-2">
                  {tpl.title}
                </h3>
                <p className="text-xs text-slate-500  leading-relaxed mb-4">
                  {tpl.description}
                </p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100  text-[10px] text-slate-600 ">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleUseTemplate(tpl)}
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white     text-xs font-semibold transition-all group"
              >
                <span>Use This Template</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
