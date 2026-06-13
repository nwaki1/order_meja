import { requestJson } from '#/lib/api.ts'

export interface UploadedFile {
  url: string
  key: string
  filename: string
  category: string | null
  mimetype: string
  size: number
}

// Uploads an image to S3 via the backend. `path` is an optional subfolder
// (e.g. "products"). requestJson leaves FormData bodies untouched so the
// browser sets the multipart boundary itself.
export function uploadFile(
  token: string,
  file: File,
  path?: string,
): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  if (path) form.append('path', path)
  return requestJson('/files/upload', {
    method: 'POST',
    body: form,
    token,
  })
}
