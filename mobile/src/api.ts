import { Platform } from 'react-native';
import type { PickedPhoto } from './types';

export const DEFAULT_API_URL = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000')).replace(/\/$/, '');
export let API_URL = DEFAULT_API_URL;
export function setApiUrl(value: string) { API_URL = value.replace(/\/$/, ''); }
let token: string | null = null;
export function setToken(value: string | null) { token = value; }
export function mediaUrl(path: string | null | undefined) { return path?.startsWith('/') ? `${API_URL}${path}` : path || ''; }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(typeof data.detail === 'string' ? data.detail : 'Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường đã nhập.', response.status);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Chưa kết nối được với shop. Vui lòng kiểm tra kết nối và thử lại.', 0);
  } finally { clearTimeout(timeout); }
}

export async function photoForm(photo: PickedPhoto, field: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = photo.file || await (await fetch(photo.uri)).blob();
    form.append(field, blob, photo.fileName || 'photo.jpg');
  } else {
    form.append(field, { uri: photo.uri, type: photo.mimeType || 'image/jpeg', name: photo.fileName || 'photo.jpg' } as unknown as Blob);
  }
  return form;
}
