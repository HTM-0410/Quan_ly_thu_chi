import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, X } from 'lucide-react';

export interface StagedImage {
  /** Unique id dùng cho React key + lookup state. */
  id: string;
  file: File;
  /** Object URL để hiển thị thumbnail (revoke khi unmount). */
  previewUrl: string;
}

interface ReceiptDropzoneProps {
  images: StagedImage[];
  onChange: (images: StagedImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

const ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function ReceiptDropzone({
  images,
  onChange,
  maxImages = 10,
  disabled,
}: ReceiptDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError(null);
      const list = Array.from(incoming);
      const remaining = maxImages - images.length;
      if (remaining <= 0) {
        setError(`Tối đa ${maxImages} ảnh mỗi lần import`);
        return;
      }
      const valid: File[] = [];
      for (const f of list.slice(0, remaining)) {
        if (!ACCEPT_MIME.includes(f.type)) {
          setError(`Bỏ qua file ${f.name}: chỉ hỗ trợ JPEG/PNG/WebP/GIF`);
          continue;
        }
        if (f.size > 8 * 1024 * 1024) {
          setError(`Bỏ qua file ${f.name}: lớn hơn 8MB`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      const next: StagedImage[] = valid.map(file => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      onChange([...images, ...next]);
    },
    [images, maxImages, onChange],
  );

  const remove = useCallback(
    (id: string) => {
      const target = images.find(i => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      onChange(images.filter(i => i.id !== id));
    },
    [images, onChange],
  );

  // Cleanup object URLs khi unmount.
  useEffect(() => {
    return () => {
      images.forEach(i => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paste từ clipboard.
  useEffect(() => {
    if (disabled) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, disabled]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-sm transition',
          dragOver
            ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-500/10'
            : 'border-ink-200 bg-surface-sunken hover:border-ink-300 dark:border-ink-700 dark:bg-surface-dark-sunken dark:hover:border-ink-600',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <ImagePlus size={28} className="text-ink-400 dark:text-inkDark-400" strokeWidth={1.5} />
        <div className="font-medium text-ink-800 dark:text-inkDark-700">
          Kéo thả, dán từ clipboard, hoặc bấm để chọn ảnh
        </div>
        <div className="text-xs text-ink-500 dark:text-inkDark-500">
          JPEG/PNG/WebP · tối đa {maxImages} ảnh · &lt; 8MB mỗi ảnh
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_MIME.join(',')}
          multiple
          hidden
          onChange={e => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </button>

      {error && (
        <p role="alert" className="text-xs font-medium text-err-600 dark:text-err-500">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map(img => (
            <li
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-card border border-ink-200 bg-surface-sunken dark:border-ink-700"
            >
              <img
                src={img.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label="Xoá ảnh"
                onClick={() => remove(img.id)}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
              >
                <X size={12} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}