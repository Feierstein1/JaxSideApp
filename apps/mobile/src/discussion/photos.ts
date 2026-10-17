import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { PhotoView } from '@jax/shared';
import { API_BASE_URL } from '@/api';
import { ApiRequestError, INSTALLATION_HEADER } from '@/api/client';
import { installationStore, secureTokenStore } from '@/auth/secure-token-store';
import { shrinkTo } from './photo-size';

/**
 * P6.1 photo uploads from the app. The photo is picked from the library, converted to
 * JPEG and shrunk on the phone first (D73: longest side 2048 px, so a full-size camera photo
 * isn't over the size limit or slow on cellular), then sent as raw bytes. The
 * server checks it again, strips every bit of metadata (GPS, camera) and re-encodes it.
 */

export type Uploaded = Pick<PhotoView, 'id' | 'width' | 'height' | 'url'>;

/** Library picker. Returns null if the person cancels or doesn't allow access. */
export async function pickPhoto(opts: { square?: boolean } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
    exif: false,
    // iPhone HEIC photos come back as JPEG.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  return r.canceled ? null : (r.assets[0] ?? null);
}

async function shrink(asset: { uri: string; width: number; height: number }) {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const size = shrinkTo(asset.width, asset.height);
  if (size) ctx.resize(size);
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return out.uri;
}

export async function uploadPhoto(asset: {
  uri: string;
  width: number;
  height: number;
}): Promise<Uploaded> {
  let uri = asset.uri;
  try {
    uri = await shrink(asset);
  } catch {
    // Couldn't shrink it here; send the original and let the server check the size.
  }
  const file = await (await fetch(uri)).blob();
  const headers: Record<string, string> = { 'Content-Type': 'image/jpeg' };
  const token = await secureTokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const installation = await installationStore.get();
  if (installation) headers[INSTALLATION_HEADER] = installation;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/photos`, { method: 'POST', headers, body: file });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      json.error?.code ?? 'HTTP_ERROR',
      json.error?.message ?? 'Couldn’t upload the photo.',
    );
  }
  return json as Uploaded;
}

/** Signed links from the server are relative to the API address. */
export const photoUri = (url: string) => `${API_BASE_URL}${url}`;
