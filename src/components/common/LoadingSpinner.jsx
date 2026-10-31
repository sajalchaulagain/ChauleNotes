import React from 'react';

// BEGINNER EXPLANATION:
// A simple loading spinner component used while checking authentication status.
export default function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      <span className="ml-4 text-slate-500">Loading ChauleNotes...</span>
    </div>
  );
}
