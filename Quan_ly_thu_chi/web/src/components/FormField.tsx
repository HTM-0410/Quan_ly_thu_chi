import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';
import clsx from 'clsx';

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /**
   * Phần tử input/select/textarea. Phải nhận `id` và `aria-invalid`/`aria-describedby`.
   * Nếu không truyền, FormField sẽ render không có control (chỉ label/hint/error).
   */
  children: ReactElement | ReactNode;
  className?: string;
}

export function FormField({ label, hint, error, required, children, className }: FormFieldProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  let enhanced: ReactNode = children;
  if (isValidElement(children)) {
    const el = children as ReactElement<{
      id?: string;
      'aria-describedby'?: string;
      'aria-invalid'?: boolean;
      className?: string;
    }>;
    enhanced = cloneElement(el, {
      id: inputId,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
      className: clsx(el.props.className, error && '!border-err-500 focus:!border-err-500'),
    });
  }

  return (
    <div className={className}>
      <label htmlFor={inputId} className="label">
        {label}
        {required && <span className="ml-1 text-brand-500">*</span>}
      </label>
      {enhanced}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500 dark:text-inkDark-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-err-600 dark:text-err-500">
          {error}
        </p>
      )}
    </div>
  );
}
