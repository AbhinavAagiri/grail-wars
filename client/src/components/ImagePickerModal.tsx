import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { LIMITS } from '@hgd/shared';
import { generatedAvatar, onPortraitError } from '../lib/avatar';
import { useStore } from '../store';

type Tab = 'auto' | 'link' | 'upload';

export function ImagePickerModal({
  name,
  candidates,
  onChoose,
  onClose,
}: {
  name: string;
  candidates: string[];
  onChoose: (url: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('auto');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploadImage = useStore((s) => s.uploadImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const allCandidates = candidates.length ? candidates : [generatedAvatar(name)];

  /** Resize to a 512×512 centre-cropped JPEG before uploading. */
  const shrinkToJpeg = async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512,
      );
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    });
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    setBusy(true);
    try {
      if (!/^image\/(png|jpeg|jpg|webp|gif|avif)$/i.test(file.type)) {
        setUploadError('Only PNG, JPG, WEBP, GIF or AVIF images are allowed.');
        return;
      }
      let payload: File | Blob = file;
      if (!/gif$/i.test(file.type)) {
        try {
          payload = await shrinkToJpeg(file);
        } catch {
          payload = file; // fall back to the original bytes
        }
      }
      const body = new FormData();
      body.append('image', payload, 'portrait.jpg');
      const res = await fetch('/api/upload', { method: 'POST', body });
      if (!res.ok) {
        setUploadError('Upload rejected by the server.');
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) onChoose(data.url);
      else setUploadError('Upload failed.');
    } catch {
      setUploadError('Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const submitLink = () => {
    setLinkError(null);
    const value = link.trim();
    if (!/^https?:\/\//i.test(value)) {
      setLinkError('Enter a full http(s) image URL.');
      return;
    }
    if (value.length > 2000) {
      setLinkError('That URL is too long.');
      return;
    }
    onChoose(value);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(8,8,11,.8)] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Change picture for ${name}`}
    >
      <div
        className="hgd-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="hgd-heading text-lg">Set the portrait</h2>
        <p className="mb-3 truncate text-[12px] text-muted">{name}</p>

        <div className="mb-3 flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {(['auto', 'link', 'upload'] as Tab[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={clsx(
                'flex-1 rounded-md px-2 py-2 text-[12px] font-bold uppercase tracking-wide transition-colors',
                tab === option ? 'bg-gold text-[#1a1408]' : 'text-muted hover:text-ink',
              )}
            >
              {option === 'auto' ? 'Auto' : option === 'link' ? 'Paste link' : 'Upload'}
            </button>
          ))}
        </div>

        {tab === 'auto' && (
          <div className="grid grid-cols-3 gap-2">
            {allCandidates.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => onChoose(url)}
                className="overflow-hidden rounded border-2 border-transparent hover:border-gold"
              >
                <img
                  src={url}
                  alt={`Candidate portrait for ${name}`}
                  loading="lazy"
                  onError={onPortraitError(name)}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {tab === 'link' && (
          <div className="space-y-2">
            <input
              className="hgd-input"
              placeholder="https://example.com/portrait.jpg"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitLink()}
            />
            {link && /^https?:\/\//i.test(link) && (
              <img
                src={link}
                alt="Preview"
                onError={(e) => {
                  e.currentTarget.src = generatedAvatar(name);
                }}
                className="mx-auto max-h-[220px] rounded object-contain"
              />
            )}
            {linkError && <p className="text-[12px] text-crimson">{linkError}</p>}
            <p className="text-[11px] text-muted">
              Remote images are fetched through the server's proxy, which blocks private addresses.
            </p>
            <button type="button" className="hgd-btn hgd-btn-primary w-full" onClick={submitLink}>
              Use this link
            </button>
          </div>
        )}

        {tab === 'upload' && (
          <div className="space-y-2">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleUpload(file);
              }}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gold-dark bg-surface-2 px-4 py-8 text-center"
            >
              <p className="text-[13px] text-ink">Drop an image here, or tap to choose a file</p>
              <p className="mt-1 text-[11px] text-muted">
                PNG, JPG, WEBP, GIF or AVIF up to {Math.round(LIMITS.UPLOAD_MAX_BYTES / (1024 * 1024))} MB
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            {busy && <p className="text-[12px] text-muted">Uploading…</p>}
            {uploadError && <p className="text-[12px] text-crimson">{uploadError}</p>}
            <p className="text-[11px] text-muted">
              Uploads live only in memory for a few hours and are never written to disk.
            </p>
          </div>
        )}

        <button type="button" onClick={onClose} className="hgd-btn hgd-btn-ghost mt-4 w-full">
          Cancel
        </button>
      </div>
    </div>
  );
}

export { generatedAvatar };
