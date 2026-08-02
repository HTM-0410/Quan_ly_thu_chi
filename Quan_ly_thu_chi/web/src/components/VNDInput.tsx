import { useEffect, useRef } from 'react';
import { digitsOnly, formatVNDInput, parseVNDInput } from '../lib/format';

interface VNDInputProps {
  /** Số tiền ở đơn vị minor (xu). Ví dụ 1.000.000đ = 100_000_000.
   *  Truyền `null` hoặc `undefined` để hiển thị rỗng (placeholder hiện ra). */
  value: number | null | undefined;
  /** Gọi khi user gõ; truyền về số minor (Number). 0 = rỗng. */
  onChange: (minor: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Input tiền VND hiển thị dấu chấm phân cách hàng nghìn (vi-VN).
 *
 * - Uncontrolled input: thao tác DOM trực tiếp để format và đặt lại con trỏ,
 *   tránh race condition giữa React render và selectionStart.
 * - Chỉ re-render component khi prop `value` đổi từ bên ngoài (mở modal edit, reset).
 */
export function VNDInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  autoFocus,
  id,
  'aria-label': ariaLabel,
}: VNDInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // null = input rỗng, không hiển thị 0
  const lastExternal = useRef<number | null>(value ?? null);
  // Cache formatted đang hiển thị (digits only) để tính cursor delta
  const formattedRef = useRef<string>(
    value == null ? '' : formatVNDInput((value / 100).toString()),
  );

  // Đồng bộ khi value từ bên ngoài thay đổi (mở modal edit, reset form...).
  useEffect(() => {
    const incoming: number | null = value ?? null;
    if (incoming !== lastExternal.current) {
      lastExternal.current = incoming;
      const formatted = incoming == null ? '' : formatVNDInput((incoming / 100).toString());
      formattedRef.current = formatted;
      if (inputRef.current) {
        inputRef.current.value = formatted;
        // Đặt con trỏ cuối chuỗi khi sync từ bên ngoài
        const len = formatted.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, [value]);

  function handleInput() {
    const el = inputRef.current;
    if (!el) return;

    const raw = el.value;
    const cursorPos = el.selectionStart ?? raw.length;

    // Đếm số digits đã xuất hiện trước con trỏ trong chính chuỗi DOM hiện tại.
    // raw là giá trị sau khi browser vừa insert keystroke mới — đây là "sự thật"
    // về vị trí user muốn gõ (kể cả giữa chuỗi đã có dấu chấm).
    const digitsBeforeCursor = countDigitsBefore(raw, cursorPos);

    // Strip non-digit, format lại
    const digits = digitsOnly(raw);
    const minor = digits === '' ? 0 : parseVNDInput(digits);
    const formatted = digits === '' ? '' : formatVNDInput(digits);

    // Cập nhật DOM chỉ khi giá trị hiển thị thay đổi
    if (el.value !== formatted) {
      el.value = formatted;
    }
    formattedRef.current = formatted;

    // Tính vị trí con trỏ mới theo số digits trước con trỏ trong chuỗi đã format
    const newCursor = digits === ''
      ? 0
      : positionAfterNDigits(formatted, digitsBeforeCursor);

    try {
      el.setSelectionRange(newCursor, newCursor);
    } catch {
      // ignore
    }

    lastExternal.current = minor;
    onChange(minor);
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      defaultValue={formattedRef.current}
      onInput={handleInput}
      placeholder={placeholder ?? '0'}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      className={className ?? 'input tabular-nums'}
    />
  );
}

/** Đếm số chữ số (không phải dấu chấm) trong `formatted` xuất hiện trước vị trí `pos`. */
function countDigitsBefore(formatted: string, pos: number): number {
  let count = 0;
  const end = Math.min(pos, formatted.length);
  for (let i = 0; i < end; i++) {
    if (formatted[i] !== '.') count++;
  }
  return count;
}

/** Trả về vị trí trong `formatted` ngay SAU chữ số thứ n (1-indexed).
 *  Nếu n === 0 trả về 0. Nếu n >= tổng digits trả về formatted.length. */
function positionAfterNDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== '.') {
      count++;
      if (count === n) return i + 1;
    }
  }
  return formatted.length;
}