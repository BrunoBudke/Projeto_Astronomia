import { useState, useEffect } from 'react';
import * as authService from '../services/authService';
import { AuthContext } from './AuthContextDef';

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('astro_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    const token = localStorage.getItem('astro_token');

    if (!token) {
      setLoading(false);
      return;
    }

    authService
      .getMe()
      .then((freshUser) => {
        setUser(freshUser);
        localStorage.setItem('astro_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        localStorage.removeItem('astro_token');
        localStorage.removeItem('astro_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await authService.login(email, password);
    localStorage.setItem('astro_token', data.token);
    localStorage.setItem('astro_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function register(name, email, password) {
    const data = await authService.register(name, email, password);
    localStorage.setItem('astro_token', data.token);
    localStorage.setItem('astro_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('astro_token');
    localStorage.removeItem('astro_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
