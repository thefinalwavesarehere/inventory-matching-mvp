/**
 * Server-side file validation utilities
 *
 * Validates MIME type, file extension, and size before processing uploads.
 * The browser-supplied Content-Type is NOT trusted — we check the file
 * magic bytes (file signature) directly from the buffer.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum upload size: 50 MB */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Allowed MIME types and their magic byte signatures */
const ALLOWED_SIGNATURES: { mime: string; ext: string[]; magic: number[] }[] = [
  // XLSX (Office Open XML) — PK zip header
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: ['.xlsx'],
    magic: [0x50, 0x4b, 0x03, 0x04],
  },
  // XLS (legacy BIFF) — Compound Document header
  {
    mime: 'application/vnd.ms-excel',
    ext: ['.xls'],
    magic: [0xd0, 0xcf, 0x11, 0xe0],
  },
  // CSV — no magic bytes; validated by extension only
  {
    mime: 'text/csv',
    ext: ['.csv'],
    magic: [],
  },
  // TSV
  {
    mime: 'text/tab-separated-values',
    ext: ['.tsv'],
    magic: [],
  },
];

const ALLOWED_EXTENSIONS = new Set(
  ALLOWED_SIGNATURES.flatMap(s => s.ext)
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function matchesMagic(buffer: Buffer, magic: number[]): boolean {
  if (magic.length === 0) return true; // No magic bytes to check (CSV/TSV)
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validate a file upload by checking:
 *  1. File size ≤ MAX_FILE_SIZE_BYTES
 *  2. File extension is in the allowed list
 *  3. File magic bytes match the declared extension (prevents MIME confusion)
 */
export function validateUploadedFile(
  filename: string,
  sizeBytes: number,
  buffer: Buffer
): FileValidationResult {
  // 1. Size check
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
    };
  }

  // 2. Extension check
  const ext = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File type not allowed: ${ext || '(no extension)'}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
    };
  }

  // 3. Magic byte check (binary formats only)
  const sig = ALLOWED_SIGNATURES.find(s => s.ext.includes(ext));
  if (sig && sig.magic.length > 0 && !matchesMagic(buffer, sig.magic)) {
    return {
      valid: false,
      error: `File content does not match declared type (${ext}). Upload may be corrupted or misnamed.`,
    };
  }

  return { valid: true };
}
