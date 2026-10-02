import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/*
 * The three controls the lobby builds its settings out of. They live here
 * rather than in the lobby page because the per-mode rules panels
 * (client/src/modes.tsx) are declared apart from the shared rows and use the
 * same controls.
 */

/** One labelled row of the settings list: label (and hint) left, control right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="text-[11px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="hgd-input !min-h-[38px] !w-auto !py-1 !text-[12px]"
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        const found = options.find((o) => String(o.value) === raw);
        if (found) onChange(found.value);
      }}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-[26px] w-[48px] rounded-full border transition-colors',
        checked ? 'border-gold bg-gold' : 'border-border bg-surface-2',
        disabled && 'opacity-45',
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] h-[20px] w-[20px] rounded-full bg-[#121216] transition-all',
          checked ? 'left-[24px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}
