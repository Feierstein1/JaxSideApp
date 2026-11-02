import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
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

/**
 * Library picker. Returns the chosen photos (up to `limit`, default one), or an empty list if
 * the person cancels or doesn't allow access. D175: several photos can be picked at once;
 * a square crop (profile photo) is always a single photo.
 */
export async function pickPhotos(opts: { square?: boolean; limit?: number } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const limit = opts.square ? 1 : Math.max(1, opts.limit ?? 1);
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Untouched here: photos are shrunk to JPEG below, and GIFs must keep their frames (D74).
    quality: 1,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
    // Editing and multi-select can't be combined, so only a plain pick can take several.
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    exif: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  // Some Android pickers ignore the limit, so cut the list to it here too.
  return r.canceled ? [] : r.assets.slice(0, limit);
}

/** One photo (profile picture), or null. */
export async function pickPhoto(opts: { square?: boolean } = {}) {
  return (await pickPhotos({ square: opts.square }))[0] ?? null;
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
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<Uploaded> {
  // D74: a GIF goes as-is (the server re-encodes it and keeps the animation); shrinking
  // here would flatten it to one frame. Everything else becomes a smaller JPEG first.
  const gif = asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.fileName ?? asset.uri);
  let uri = asset.uri;
  if (!gif) {
    try {
      uri = await shrink(asset);
    } catch {
      // Couldn't shrink it here; send the original and let the server check the size.
    }
  }
  return postRawFile<Uploaded>('/api/v1/photos', uri, gif ? 'image/gif' : 'image/jpeg');
}

/**
 * Sends a local file's bytes as the request body (photos, D75 voice clips).
 *
 * D81: streamed straight from disk by expo-file-system. Reading the file with
 * `fetch(uri).blob()` and posting the Blob fails on current Expo ("Response.blob() is
 * using React Native's Blob"), which broke every photo upload.
 */
export async function postRawFile<T>(path: string, uri: string, contentType: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const token = await secureTokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const installation = await installationStore.get();
  if (installation) headers[INSTALLATION_HEADER] = installation;
  let res: { status: number; body: string };
  try {
    res = await uploadAsync(`${API_BASE_URL}${path}`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }
  let json: { error?: { code?: string; message?: string } } = {};
  try {
    json = JSON.parse(res.body);
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiRequestError(
      res.status,
      json.error?.code ?? 'HTTP_ERROR',
      json.error?.message ?? `Upload failed (error ${res.status}).`,
    );
  }
  return json as T;
}

/** Signed links from the server are relative to the API address. */
export const photoUri = (url: string) => `${API_BASE_URL}${url}`;
