import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  API_URL,
  ApiError,
  IS_REMOTE_WEB,
  PRODUCTION_API_URL,
  request,
  setApiUrl,
  setToken,
  setUnauthorizedHandler,
} from './api';
import { registerForPushNotificationsAsync } from './notifications';
import type { CartLine, Health, Product, User, UserQuota } from './types';

type Session = { token: string; user: User };
const sessionStorage = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem('shopfit-session') : SecureStore.getItemAsync('shopfit-session')),
  set: (value: string) =>
    Platform.OS === 'web' ? AsyncStorage.setItem('shopfit-session', value) : SecureStore.setItemAsync('shopfit-session', value),
  remove: () =>
    Platform.OS === 'web' ? AsyncStorage.removeItem('shopfit-session') : SecureStore.deleteItemAsync('shopfit-session'),
};

function isLocalApiUrl(url: string) {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('10.0.2.2');
}

type Store = {
  products: Product[];
  loading: boolean;
  error: string | null;
  health: Health | null;
  user: User | null;
  restoring: boolean;
  cart: CartLine[];
  favorites: string[];
  quota: UserQuota | null;
  refreshQuota: () => Promise<void>;
  toast: string | null;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; debug_otp?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ status: string; message: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ message: string }>;
  deleteAccount: () => Promise<void>;
  toggleFavorite: (id: string) => void;
  addCart: (p: Product, size: string, color: string) => void;
  updateCart: (key: string, quantity: number) => void;
  clearCart: () => void;
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

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const q = await request<UserQuota>('/api/user/quota');
      setQuota(q);
    } catch {
      // Offline or unauthenticated
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void sessionStorage.remove();
      setToken(null);
      setUser(null);
      setQuota(null);
      notify('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    });
    return () => setUnauthorizedHandler(null);
  }, [notify]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const originalUrl = API_URL;
    try {
      const [list, status] = await Promise.all([
        request<Product[]>('/api/products', {}, IS_REMOTE_WEB ? 45000 : 12000),
        request<Health>('/api/health', {}, IS_REMOTE_WEB ? 45000 : 12000),
      ]);
      setProducts(list);
      setHealth(status);
      setError(null);
    } catch (e) {
      // Only fallback in local development from a local host -> Render Cloud.
      // Never poison a production or remote web session with localhost!
      if (__DEV__ && !IS_REMOTE_WEB && isLocalApiUrl(originalUrl)) {
        try {
          setApiUrl(PRODUCTION_API_URL);
          const [list, status] = await Promise.all([
            request<Product[]>('/api/products', {}, 25000),
            request<Health>('/api/health', {}, 25000),
          ]);
          setProducts(list);
          setHealth(status);
          setError(null);
          return;
        } catch {
          setApiUrl(originalUrl);
        }
      } else {
        setApiUrl(originalUrl);
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Derive live product prices/variants/active flags into cart items without cascading effect renders
  const liveCart = useMemo(
    () =>
      products.length === 0
        ? cart
        : cart.map(line => {
            const latest = products.find(p => p.id === line.product.id);
            return latest && latest !== line.product ? { ...line, product: latest } : line;
          }),
    [cart, products]
  );

  useEffect(() => {
    void (async () => {
      try {
        const [saved, cartJson, server] = await Promise.all([
          sessionStorage.get(),
          AsyncStorage.getItem('shopfit-cart'),
          AsyncStorage.getItem('shopfit-server'),
        ]);
        const envUrl = process.env.EXPO_PUBLIC_API_URL;
        if (IS_REMOTE_WEB) {
          setApiUrl(envUrl || PRODUCTION_API_URL);
        } else if (envUrl) {
          setApiUrl(envUrl);
          if (server && server !== envUrl) {
            void AsyncStorage.setItem('shopfit-server', envUrl);
          }
        } else if (server) {
          setApiUrl(server);
        }

        if (cartJson) {
          try {
            setCart(JSON.parse(cartJson));
          } catch {
            // Ignore malformed cart record
          }
        }

        let activeUser: User | null = null;
        if (saved) {
          const session: Session = JSON.parse(saved);
          setToken(session.token);
          try {
            activeUser = await request<User>('/api/auth/me', {}, 20000);
            setUser(activeUser);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              setToken(null);
              await sessionStorage.remove();
            } else {
              activeUser = session.user;
              setUser(session.user);
            }
          }
        }

        const favKey = `shopfit-favorites:${activeUser?.id || 'guest'}`;
        const legacyFav = await AsyncStorage.getItem(favKey) ?? (activeUser ? null : await AsyncStorage.getItem('shopfit-favorites'));
        if (legacyFav) {
          try {
            setFavorites(JSON.parse(legacyFav));
          } catch {
            setFavorites([]);
          }
        }
        void refresh();
      } finally {
        setRestoring(false);
        setHydrated(true);
      }
    })();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  // Reload user-scoped favorites when user switches
  useEffect(() => {
    if (!hydrated) return;
    const favKey = `shopfit-favorites:${user?.id || 'guest'}`;
    void AsyncStorage.getItem(favKey).then(raw => {
      if (raw) {
        try {
          setFavorites(JSON.parse(raw));
          return;
        } catch {
          // ignore
        }
      }
      setFavorites([]);
    });
  }, [user?.id, hydrated]);

  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem('shopfit-cart', JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (hydrated) {
      const favKey = `shopfit-favorites:${user?.id || 'guest'}`;
      void AsyncStorage.setItem(favKey, JSON.stringify(favorites));
    }
  }, [favorites, user?.id, hydrated]);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;
    void request<UserQuota>('/api/user/quota')
      .then(q => {
        if (isMounted) setQuota(q);
      })
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
    return () => {
      isMounted = false;
    };
  }, [user]);

  const authenticate = useCallback(async (path: string, body: object) => {
    const session = await request<Session>(path, { method: 'POST', body: JSON.stringify(body) });
    await sessionStorage.set(JSON.stringify(session));
    setToken(session.token);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch {
      /* Local sign-out still works offline. */
    }
    await sessionStorage.remove();
    setToken(null);
    setUser(null);
    setQuota(null);
    setCart([]);
    setFavorites([]);
    notify('Đã đăng xuất.');
  }, [notify]);

  const updateProfile = useCallback(
    async (name: string) => {
      const updated = await request<User>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setUser(updated);
      const saved = await sessionStorage.get();
      if (saved) {
        try {
          const parsed: Session = JSON.parse(saved);
          await sessionStorage.set(JSON.stringify({ ...parsed, user: updated }));
        } catch {
          // ignore
        }
      }
      notify('Đã cập nhật thông tin cá nhân.');
    },
    [notify]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await request<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      notify(res.message || 'Đã đổi mật khẩu thành công.');
    },
    [notify]
  );

  const deleteAccount = useCallback(async () => {
    const uid = user?.id;
    await request('/api/auth/me', { method: 'DELETE' });
    await sessionStorage.remove();
    if (uid) {
      await AsyncStorage.removeItem(`shopfit-favorites:${uid}`);
      await AsyncStorage.removeItem(`shopfit-shipping:${uid}`);
    }
    setToken(null);
    setUser(null);
    setQuota(null);
    setCart([]);
    setFavorites([]);
    notify('Tài khoản và dữ liệu đã được xóa vĩnh viễn.');
  }, [notify, user?.id]);

  const forgotPassword = useCallback(async (email: string) => {
    return request<{ message: string; debug_otp?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    return request<{ status: string; message: string }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  }, []);

  const resetPassword = useCallback(async (email: string, otp: string, newPassword: string) => {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, new_password: newPassword }),
    });
  }, []);

  const changeServer = useCallback(
    async (url: string) => {
      await sessionStorage.remove();
      setToken(null);
      setUser(null);
      setCart([]);
      setProducts([]);
      setHealth(null);
      await AsyncStorage.setItem('shopfit-server', url);
      setApiUrl(url);
      await refresh();
    },
    [refresh]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  }, []);

  const addCart = useCallback(
    (product: Product, size: string, color: string) => {
      const stock = product.variants.find(v => v.size === size && v.color === color)?.stock || 0;
      if (stock <= 0) {
        notify('Phân loại màu/size này hiện đã hết hàng.');
        return;
      }
      const key = `${product.id}:${size}:${color}`;
      let added = false;
      setCart(items => {
        const existing = items.find(i => i.key === key);
        if (stock <= (existing?.quantity || 0) || (existing?.quantity || 0) >= 20) {
          added = false;
          return items;
        }
        added = true;
        return existing
          ? items.map(i => (i.key === key ? { ...i, product, quantity: i.quantity + 1 } : i))
          : [...items, { key, product, size, color, quantity: 1 }];
      });
      notify(added ? 'Đã thêm vào giỏ hàng.' : 'Số lượng trong giỏ đã đạt mức tối đa tồn kho của mẫu này.');
    },
    [notify]
  );

  const updateCart = useCallback(
    (key: string, quantity: number) => {
      if (quantity <= 0) {
        setCart(items => items.filter(i => i.key !== key));
        return;
      }
      let capped = false;
      setCart(items =>
        items.map(i => {
          if (i.key !== key) return i;
          const product = products.find(p => p.id === i.product.id) || i.product;
          const stock = product.variants.find(v => v.size === i.size && v.color === i.color)?.stock ?? 0;
          if (stock <= 0) return { ...i, product };
          const maxAllowed = Math.min(stock, 20);
          if (quantity > maxAllowed) capped = true;
          return { ...i, product, quantity: Math.min(quantity, maxAllowed) };
        })
      );
      if (capped) {
        notify('Đã chạm giới hạn tồn kho hiện có của mẫu này.');
      }
    },
    [products, notify]
  );

  const clearCart = useCallback(() => setCart([]), []);

  const login = useCallback((email: string, password: string) => authenticate('/api/auth/login', { email, password }), [authenticate]);
  const register = useCallback(
    (name: string, email: string, password: string) => authenticate('/api/auth/register', { name, email, password }),
    [authenticate]
  );

  const value = useMemo<Store>(
    () => ({
      products,
      loading,
      error,
      health,
      user,
      restoring,
      cart: liveCart,
      favorites,
      quota,
      refreshQuota,
      toast,
      notify,
      refresh,
      login,
      register,
      logout,
      updateProfile,
      changePassword,
      forgotPassword,
      verifyOtp,
      resetPassword,
      deleteAccount,
      toggleFavorite,
      addCart,
      updateCart,
      clearCart,
      changeServer,
    }),
    [
      products,
      loading,
      error,
      health,
      user,
      restoring,
      liveCart,
      favorites,
      quota,
      refreshQuota,
      toast,
      notify,
      refresh,
      login,
      register,
      logout,
      updateProfile,
      changePassword,
      forgotPassword,
      verifyOtp,
      resetPassword,
      deleteAccount,
      toggleFavorite,
      addCart,
      updateCart,
      clearCart,
      changeServer,
    ]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing');
  return store;
}
