import imageCompression from 'browser-image-compression';

// Загрузка картинок мастером (этап 40): большие файлы с телефона сжимаются прямо в браузере — до 2048 px и ~2 МБ,
// чтобы не гонять по мобильной сети исходники на 10–15 МБ. Маленькие файлы и HEIC идут как есть (сервер понимает HEIC).

export async function prepareImage(file: File): Promise<Blob> {
  if (file.size < 1_500_000 || /hei[cf]/i.test(file.type)) return file;
  try {
    return await imageCompression(file, { maxWidthOrHeight: 2048, maxSizeMB: 2, initialQuality: 0.85, useWebWorker: true });
  } catch {
    return file;
  }
}

/** POST сырого тела картинки на url (как и раньше), но после prepareImage. */
export async function uploadImage(url: string, file: File): Promise<Response> {
  const body = await prepareImage(file);
  return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': body.type || file.type || 'image/jpeg' }, body });
}
