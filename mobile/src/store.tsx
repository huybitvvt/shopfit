import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError, request, setApiUrl, setToken } from './api';
import type { CartLine, Health, Product, User } from './types';

type Session = { token: string; user: User };
const sessionStorage = {
  get: () => Platform.OS === 'web' ? AsyncStorage.getItem('shopfit-session') : SecureStore.getItemAsync('shopfit-session'),
  set: (value: string) => Platform.OS === 'web' ? AsyncStorage.setItem('shopfit-session', value) : SecureStore.setItemAsync('shopfit-session', value),
  remove: () => Platform.OS === 'web' ? AsyncStorage.removeItem('shopfit-session') : SecureStore.deleteItemAsync('shopfit-session'),
};
type Store = {
  products: Product[]; loading: boolean; error: string | null; health: Health | null;
  user: User | null; restoring: boolean; cart: CartLine[]; favorites: string[];
  toast: string | null; notify: (message: string) => void;
  refresh: () => Promise<void>; login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>; logout: () => Promise<void>;
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
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const [saved, cartJson, favoriteJson, server] = await Promise.all([sessionStorage.get(), AsyncStorage.getItem('shopfit-cart'), AsyncStorage.getItem('shopfit-favorites'), AsyncStorage.getItem('shopfit-server')]);
        if (server) setApiUrl(server);
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

  async function authenticate(path: string, body: object) {
    const session = await request<Session>(path, { method: 'POST', body: JSON.stringify(body) });
    await sessionStorage.set(JSON.stringify(session));
    setToken(session.token); setUser(session.user);
  }
  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { /* Local sign-out still works offline. */ }
    await sessionStorage.remove(); setToken(null); setUser(null); setCart([]); notify('Đã đăng xuất.');
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
  return <Context.Provider value={{ products, loading, error, health, user, restoring, cart, favorites, toast, notify, refresh,
    login: (email, password) => authenticate('/api/auth/login', { email, password }),
    register: (name, email, password) => authenticate('/api/auth/register', { name, email, password }),
    logout, changeServer, toggleFavorite, addCart, updateCart, clearCart: () => setCart([]) }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('StoreProvider is missing'); return store; }
