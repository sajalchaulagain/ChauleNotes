import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// BEGINNER EXPLANATION:
// This is the entry point of the application.
// It renders the App component into the HTML div with id="root".
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
