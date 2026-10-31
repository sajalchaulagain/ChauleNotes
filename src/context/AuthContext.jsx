import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  clearSession,
  getAdminMe,
  getStoredSession,
  normaliseUser,
  setSession as persistSession,
  signInWithEmail,
  signOut as apiSignOut,
  signUpWithEmail,
} from '../services/apiClient';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from '../services/firebaseClient';

const AuthContext = createContext();
const LEGACY_DEMO_SESSION_KEY = 'chaule_demo_session';
const LEGACY_DEMO_NOTE_KEYS = [
  'chaule_notes_demo-user-id',
  'chaule_notes_demo-admin-id',
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // The backend is authoritative for the current user and role. A cached role
  // is never enough to unlock the admin experience.
  const syncCurrentUser = useCallback(async () => {
    const { data, error } = await getAdminMe();
    if (error || !data?.user) {
      clearSession();
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      return { ok: false, error };
    }

    const freshUser = normaliseUser(data.user);
    const token = getStoredSession()?.token;
    setUser(freshUser);
    setIsAdmin(data.is_admin === true);
    if (token) {
      persistSession(token, freshUser);
      setSession({ access_token: token, user: freshUser });
    }
    return { ok: true };
  }, []);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      // Remove the old local demo identity so it can never restore as a real user.
      localStorage.removeItem(LEGACY_DEMO_SESSION_KEY);
      LEGACY_DEMO_NOTE_KEYS.forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem('chaule_profiles');
      // Firebase restores its persisted account and refreshes ID tokens; the
      // local token cache is only for UI compatibility, never the authority.
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (account) => {
        if (!active) return;
        if (!account) {
          clearSession();
          setUser(null);
          setSession(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        try {
          const token = await account.getIdToken();
          const cached = getStoredSession();
          persistSession(token, cached?.user);
          setSession({ access_token: token, user: normaliseUser(cached?.user) });
          await syncCurrentUser();
        } catch (error) {
          console.error('Could not verify the restored Firebase session:', error);
          clearSession();
          setUser(null);
          setSession(null);
          setIsAdmin(false);
        } finally {
          if (active) setLoading(false);
        }
      });
      return unsubscribe;
    };

    let unsubscribe;
    Promise.resolve(restore()).then((stop) => { unsubscribe = stop; }).catch((error) => {
      console.error('Could not restore the ChauleNotes session:', error);
      if (active) {
        clearSession();
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [syncCurrentUser]);

  const login = async (email, password) => {
    const { data, error } = await signInWithEmail(email, password);
    if (error) return { data: null, error };

    setUser(data.user);
    setSession({ access_token: data.token, user: data.user });
    const synced = await syncCurrentUser();
    if (!synced.ok) {
      return { data: null, error: synced.error || new Error('Could not verify the account with the ChauleNotes API.') };
    }
    return { data, error: null };
  };

  const register = async (email, password, username) => {
    const { data, error } = await signUpWithEmail(email, password, username);
    if (error) return { data: null, error };

    setUser(data.user);
    setSession({ access_token: data.token, user: data.user });
    const synced = await syncCurrentUser();
    if (!synced.ok) {
      return { data: null, error: synced.error || new Error('Could not verify the account with the ChauleNotes API.') };
    }
    return { data, error: null };
  };

  const handleSignOut = async () => {
    await apiSignOut();
    clearSession();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
  };

  const refreshUser = async () => {
    if (getStoredSession()?.token) await syncCurrentUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: Boolean(user && session?.access_token),
        loading,
        userId: user?.id || null,
        isAdmin,
        login,
        register,
        signOut: handleSignOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
