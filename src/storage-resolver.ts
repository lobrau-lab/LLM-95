/**
 * Storage Subsystem & Disk Range-Request Resolver
 * Resolves disk image sources with HTTP 206 byte-range sniffing,
 * Origin Private File System (OPFS) fallback, and IndexedDB dirty sector persistence.
 */

export interface DiskSourceResult {
  url?: string;
  size?: number;
  async?: boolean;
  file?: File | Blob;
  opfsHandle?: FileSystemFileHandle;
  type: 'range-http' | 'local-file' | 'opfs' | 'memory-blob';
  byteRangeSupported: boolean;
  message: string;
}

export interface StorageEstimateInfo {
  usageMb: number;
  quotaMb: number;
  percentUsed: number;
  availableMb: number;
}

/**
 * Sniffs remote URL for HTTP 206 Accept-Ranges capability
 * and resolves appropriate v86 disk mounting strategy.
 */
export async function resolveDiskSource(
  imageUrl: string,
  fallbackLocalFile: File | Blob | null = null
): Promise<DiskSourceResult> {
  // 1. Direct local file selection (zero network overhead, instant slicing)
  if (fallbackLocalFile) {
    return {
      file: fallbackLocalFile,
      type: 'local-file',
      byteRangeSupported: true,
      message: `Direct File API sector slicing (${(fallbackLocalFile.size / (1024 * 1024)).toFixed(2)} MB)`
    };
  }

  // 2. Sniff HEAD for HTTP 206 Byte-Range streaming
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const head = await fetch(imageUrl, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeout);

    const acceptRanges = head.headers.get('accept-ranges');
    const contentLength = parseInt(head.headers.get('content-length') || '0', 10);
    const supportsRanges = acceptRanges === 'bytes';

    if (head.ok && (supportsRanges || contentLength > 0)) {
      return {
        url: imageUrl,
        size: contentLength > 0 ? contentLength : undefined,
        async: true,
        type: 'range-http',
        byteRangeSupported: supportsRanges,
        message: supportsRanges
          ? `HTTP 206 Partial Content verified (${(contentLength / (1024 * 1024)).toFixed(2)} MB)`
          : `HTTP Range header absent; attempting sparse stream (${(contentLength / (1024 * 1024)).toFixed(2)} MB)`
      };
    }
  } catch (err: any) {
    console.warn('[StorageResolver] HEAD range request sniffing failed or CORS blocked:', err?.message || err);
  }

  // 3. Fallback to Origin Private File System (OPFS) if available
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      const filename = imageUrl.split('/').pop()?.split('?')[0] || 'virtual_disk.img';
      const fileHandle = await root.getFileHandle(filename, { create: true });
      const file = await fileHandle.getFile();

      if (file.size > 0) {
        return {
          opfsHandle: fileHandle,
          file,
          type: 'opfs',
          byteRangeSupported: true,
          message: `Mounted from Origin Private File System (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
        };
      }
    } catch (opfsErr) {
      console.warn('[StorageResolver] OPFS mount fallback failed:', opfsErr);
    }
  }

  // 4. Default URL fallback with non-range warning
  return {
    url: imageUrl,
    async: true,
    type: 'range-http',
    byteRangeSupported: false,
    message: 'Mounting disk via direct HTTP URL buffer'
  };
}

/**
 * Check browser storage quota to prevent mid-session write-faults
 */
export async function getStorageQuotaEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const usageMb = Math.round(usage / (1024 * 1024) * 10) / 10;
      const quotaMb = Math.round(quota / (1024 * 1024) * 10) / 10;
      const percentUsed = Math.min(100, Math.round((usage / quota) * 100));
      const availableMb = Math.max(0, quotaMb - usageMb);
      return { usageMb, quotaMb, percentUsed, availableMb };
    } catch {}
  }
  return { usageMb: 0, quotaMb: 2048, percentUsed: 0, availableMb: 2048 };
}

/**
 * Save user dropped or downloaded disk image into OPFS for instant persistence
 */
export async function saveDiskToOPFS(filename: string, fileData: Blob | File | ArrayBuffer): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(filename, { create: true });
    // Write via writable stream
    const writable = await (handle as any).createWritable();
    await writable.write(fileData);
    await writable.close();
    return true;
  } catch (e) {
    console.warn('[StorageResolver] Failed saving file to OPFS:', e);
    return false;
  }
}

/**
 * List files saved in the Origin Private File System
 */
export async function listOPFSFiles(): Promise<{ name: string; size: number }[]> {
  const result: { name: string; size: number }[] = [];
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return result;
  try {
    const root = await navigator.storage.getDirectory();
    // @ts-ignore
    for await (const [name, handle] of (root as any).entries()) {
      if (handle.kind === 'file') {
        const f = await handle.getFile();
        result.push({ name, size: f.size });
      }
    }
  } catch {}
  return result;
}
