import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  globalName: string | null;
  name: string; // Display name: globalName or username
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const initial: AuthState = {
  user: null,
  loading: true,
  error: null,
};

const AuthContext = createContext<AuthState & {
  login: () => void;
  logout: () => void;
}>(initial as any);

export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'nexusnight_token';

/**
 * New Authentication System using Discord OAuth2
 * Replaces Discord Activity SDK
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial);

  const login = () => {
    console.log('[Auth] Redirecting to Discord OAuth...');
    // Redirect to Discord OAuth2
    window.location.href = '/api/auth/discord';
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem(TOKEN_KEY);
      setState({ user: null, loading: false, error: null });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      console.log('[Auth] Checking auth, token:', token ? 'exists' : 'missing');
      
      if (!token) {
        setState({ user: null, loading: false, error: null });
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Not authenticated');
        }

        const user = await response.json();
        // Add display name and ensure id is always populated
        const userWithName: User = {
          ...user,
          id: user.id || user.userId || '',
          name: user.globalName || user.username || 'User',
        };
        console.log('[Auth] User authenticated:', userWithName.name);
        setState({ user: userWithName, loading: false, error: null });
      } catch (error) {
        console.error('[Auth] Auth check failed:', error);
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, loading: false, error: 'Authentication failed' });
      }
    };

    checkAuth();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    // Check both regular URL params and hash params
    const urlParams = new URLSearchParams(window.location.search);
    const hashParts = window.location.hash.split('?');
    const hashParams = hashParts.length > 1 ? new URLSearchParams(hashParts[1]) : null;
    
    const token = urlParams.get('token') || hashParams?.get('token');
    
    if (token) {
      console.log('[Auth] Token received, saving...');
      localStorage.setItem(TOKEN_KEY, token);
      
      // Remove token from URL
      if (urlParams.has('token')) {
        urlParams.delete('token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      } else if (hashParams?.has('token')) {
        hashParams.delete('token');
        const newHash = hashParts[0] + (hashParams.toString() ? '?' + hashParams.toString() : '');
        window.history.replaceState({}, document.title, window.location.pathname + newHash);
      }
      
      // Trigger auth check immediately instead of reload
      const checkAuthAfterLogin = async () => {
        try {
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            throw new Error('Not authenticated');
          }

          const user = await response.json();
          const userWithName: User = {
            ...user,
            id: user.id || user.userId || '',
            name: user.globalName || user.username || 'User',
          };
          console.log('[Auth] Login successful:', userWithName.name);
          setState({ user: userWithName, loading: false, error: null });
        } catch (error) {
          console.error('[Auth] Token validation failed:', error);
          localStorage.removeItem(TOKEN_KEY);
          setState({ user: null, loading: false, error: 'Authentication failed' });
        }
      };
      
      checkAuthAfterLogin();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
