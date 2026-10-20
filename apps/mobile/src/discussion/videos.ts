import * as ImagePicker from 'expo-image-picker';
import type { VideoView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { postRawFile } from './photos';

/** D102: video posts: up to 30 seconds and 25 MB, uploaded as recorded (no processing). */
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MAX_MB = 25;

export type UploadedVideo = Omit<VideoView, 'url'> & { url: string };

/** Pick from the library (`record: false`) or record with the camera. Null if cancelled. */
export async function pickVideo(record: boolean) {
  const perm = record
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: VIDEO_MAX_SECONDS,
    // iPhone: lets you trim a longer video down to 30 s before it's attached.
    allowsEditing: true,
  };
  const r = record
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return r.canceled ? null : (r.assets[0] ?? null);
}

export async function uploadVideo(asset: {
  uri: string;
  mimeType?: string | null;
  fileSize?: number;
  duration?: number | null;
}): Promise<UploadedVideo> {
  if (asset.duration && asset.duration > (VIDEO_MAX_SECONDS + 1) * 1000) {
    throw new ApiRequestError(422, 'TOO_LONG', `Videos can be up to ${VIDEO_MAX_SECONDS} seconds.`);
  }
  if (asset.fileSize && asset.fileSize > VIDEO_MAX_MB * 1024 * 1024) {
    throw new ApiRequestError(413, 'TOO_LARGE', `Videos can be up to ${VIDEO_MAX_MB} MB.`);
  }
  const type = asset.mimeType ?? (/\.mov$/i.test(asset.uri) ? 'video/quicktime' : 'video/mp4');
  return postRawFile<UploadedVideo>('/api/v1/videos', asset.uri, type);
}
