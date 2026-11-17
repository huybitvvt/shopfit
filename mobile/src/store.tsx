import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { API_URL, ApiError, request, setApiUrl, setToken } from './api';
import { registerForPushNotificationsAsync } from './notifications';
import type { CartLine, Health, Product, User, UserQuota } from './types';

type Session = { token: string; user: User };
const sessionStorage = {
  get: () => Platform.OS === 'web' ? AsyncStorage.getItem('shopfit-session') : SecureStore.getItemAsync('shopfit-session'),
  set: (value: string) => Platform.OS === 'web' ? AsyncStorage.setItem('shopfit-session', value) : SecureStore.setItemAsync('shopfit-session', value),
  remove: () => Platform.OS === 'web' ? AsyncStorage.removeItem('shopfit-session') : SecureStore.deleteItemAsync('shopfit-session'),
};
type Store = {
  products: Product[]; loading: boolean; error: string | null; health: Health | null;
  user: User | null; restoring: boolean; cart: CartLine[]; favorites: string[];
  quota: UserQuota | null; refreshQuota: () => Promise<void>;
  toast: string | null; notify: (message: string) => void;
  refresh: () => Promise<void>; login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>; logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; debug_otp?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ status: string; message: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ message: string }>;
  deleteAccount: () => Promise<void>;
  toggleFavorite: (id: string) => void; addCart: (p: Product, size: string, color: string) => void;
  updateCart: (key: string, quantity: number) => void; clearCart: () => void;
  changeServer: (url: string) => Promise<void>;
};
const Context = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      const q = await request<UserQuota>('/api/user/quota');
      setQuota(q);
    } catch {
      // Offline or unauthenticated
    }
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, status] = await Promise.all([request<Product[]>('/api/products'), request<Health>('/api/health')]);
      setProducts(list); setHealth(status); setError(null);
    } catch (e) {
      try {
        const currentUrl = API_URL;
        const fallbackUrl = currentUrl.includes('localhost') ? 'https://shopfit-api.onrender.com' : 'http://localhost:8000';
        setApiUrl(fallbackUrl);
        const [list, status] = await Promise.all([request<Product[]>('/api/products'), request<Health>('/api/health')]);
        setProducts(list); setHealth(status); setError(null);
        void AsyncStorage.setItem('shopfit-server', fallbackUrl);
      } catch {
        setError((e as Error).message);
      }
    }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const [saved, cartJson, favoriteJson, server] = await Promise.all([sessionStorage.get(), AsyncStorage.getItem('shopfit-cart'), AsyncStorage.getItem('shopfit-favorites'), AsyncStorage.getItem('shopfit-server')]);
        const envUrl = process.env.EXPO_PUBLIC_API_URL;
        if (envUrl) {
          setApiUrl(envUrl);
          if (server && server !== envUrl) {
            void AsyncStorage.setItem('shopfit-server', envUrl);
          }
        } else if (server) {
          setApiUrl(server);
        }
        void refresh();
        if (cartJson) setCart(JSON.parse(cartJson));
        if (favoriteJson) setFavorites(JSON.parse(favoriteJson));
        if (saved) {
          const session: Session = JSON.parse(saved);
          setToken(session.token);
          try { setUser(await request<User>('/api/auth/me')); }
          catch (e) {
            if (e instanceof ApiError && e.status === 401) { setToken(null); await sessionStorage.remove(); }
            else setUser(session.user);
          }
        }
      } finally { setRestoring(false); setHydrated(true); }
    })();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [refresh]);
  useEffect(() => { if (hydrated) void AsyncStorage.setItem('shopfit-cart', JSON.stringify(cart)); }, [cart, hydrated]);
  useEffect(() => { if (hydrated) void AsyncStorage.setItem('shopfit-favorites', JSON.stringify(favorites)); }, [favorites, hydrated]);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;
    void request<UserQuota>('/api/user/quota')
      .then(q => { if (isMounted) setQuota(q); })
      .catch(() => {});
    void (async () => {
      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken && isMounted) {
          await request('/api/auth/push-token', {
            method: 'PUT',
            body: JSON.stringify({ push_token: pushToken }),
          });
        }
      } catch {
        // Ignore push notification errors on web/emulators
      }
    })();
    return () => { isMounted = false; };
  }, [user]);

  async function authenticate(path: string, body: object) {
    const session = await request<Session>(path, { method: 'POST', body: JSON.stringify(body) });
    await sessionStorage.set(JSON.stringify(session));
    setToken(session.token); setUser(session.user);
  }
  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* Local sign-out still works offline. */ }
    await sessionStorage.remove(); setToken(null); setUser(null); setQuota(null); setCart([]); notify('Đã đăng xuất.');
  }
  async function deleteAccount() {
    await request('/api/auth/me', { method: 'DELETE' });
    await sessionStorage.remove(); setToken(null); setUser(null); setQuota(null); setCart([]); setFavorites([]);
    notify('Tài khoản và dữ liệu đã được xóa vĩnh viễn.');
  }
  async function forgotPassword(email: string) {
    return request<{ message: string; debug_otp?: string }>('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    });
  }
  async function verifyOtp(email: string, otp: string) {
    return request<{ status: string; message: string }>('/api/auth/verify-otp', {
      method: 'POST', body: JSON.stringify({ email, otp }),
    });
  }
  async function resetPassword(email: string, otp: string, newPassword: string) {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ email, otp, new_password: newPassword }),
    });
  }
  async function changeServer(url: string) {
    await sessionStorage.remove(); setToken(null); setUser(null); setCart([]); setProducts([]); setHealth(null);
    await AsyncStorage.setItem('shopfit-server', url); setApiUrl(url); await refresh();
  }
  function toggleFavorite(id: string) {
    setFavorites(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }
  function addCart(product: Product, size: string, color: string) {
    const stock = product.variants.find(v => v.size === size && v.color === color)?.stock || 0;
    const key = `${product.id}:${size}:${color}`;
    const existing = cart.find(i => i.key === key);
    if (stock <= (existing?.quantity || 0)) { notify('Số lượng trong giỏ đã đạt tồn kho của mẫu này.'); return; }
    setCart(items => existing ? items.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i) : [...items, { key, product, size, color, quantity: 1 }]);
    notify('Đã thêm vào giỏ hàng.');
  }
  function updateCart(key: string, quantity: number) {
    if (quantity <= 0) { setCart(items => items.filter(i => i.key !== key)); return; }
    setCart(items => items.map(i => {
      if (i.key !== key) return i;
      const product = products.find(p => p.id === i.product.id) || i.product;
      const stock = product.variants.find(v => v.size === i.size && v.color === i.color)?.stock || 0;
      return { ...i, product, quantity: Math.min(quantity, stock, 20) };
    }).filter(i => i.quantity > 0));
  }
  return <Context.Provider value={{ products, loading, error, health, user, restoring, cart, favorites, quota, refreshQuota, toast, notify, refresh,
    login: (email, password) => authenticate('/api/auth/login', { email, password }),
    register: (name, email, password) => authenticate('/api/auth/register', { name, email, password }),
    logout, deleteAccount, forgotPassword, verifyOtp, resetPassword, changeServer, toggleFavorite, addCart, updateCart, clearCart: () => setCart([]) }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('StoreProvider is missing'); return store; }
