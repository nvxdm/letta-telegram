import { Injectable, Logger } from '@nestjs/common';
import { Telegram } from 'telegraf';

export interface DownloadedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const DOWNLOAD_TIMEOUT_MS = 60_000;

@Injectable()
export class TelegramDownloaderService {
  private readonly logger = new Logger(TelegramDownloaderService.name);

  async download(
    telegram: Telegram,
    fileId: string,
    hints: { mimeType?: string; filename?: string } = {},
  ): Promise<DownloadedFile | null> {
    try {
      const link = await telegram.getFileLink(fileId);
      const url = link instanceof URL ? link.toString() : String(link);
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) {
        this.logger.error(`Telegram file download failed: ${res.status} ${res.statusText}`);
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      const mimeType =
        hints.mimeType ?? res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';

      const filename = hints.filename ?? this.deriveFilenameFromUrl(url, mimeType);

      return { buffer, mimeType, filename };
    } catch (err) {
      this.logger.error(`Error downloading Telegram file ${fileId}: ${(err as Error).message}`);
      return null;
    }
  }

  private deriveFilenameFromUrl(url: string, mimeType: string): string {
    const tail = url.split('/').pop() ?? 'file';
    if (tail.includes('.')) return tail.split('?')[0];
    const ext = MIME_EXT[mimeType] ?? 'bin';
    return `${tail.split('?')[0]}.${ext}`;
  }
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
};
