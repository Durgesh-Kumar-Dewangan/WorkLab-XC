'use client';

import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import type { IconName } from '@/lib/icon-paths';
import { clamp } from '@/lib/util';
import { STATUS_CHIP, STATUS_LABEL } from '@/lib/domain/mastery';
import type { TopicStatus } from '@/lib/domain/types';

/* ---------- Field ---------- */
type FieldBase = {
  label: ReactNode;
  hint?: string;
  error?: string;
  id?: string;
  required?: boolean;
  className?: string;
};
type InputFieldProps = FieldBase & React.InputHTMLAttributes<HTMLInputElement> & { kind?: 'input' };
type TextareaFieldProps = FieldBase &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { kind: 'textarea' };
type SelectFieldProps = FieldBase &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    kind: 'select';
    options: (string | { value: string; label: string } | { group: string; options: { value: string; label: string }[] })[];
  };

export function Field(props: InputFieldProps | TextareaFieldProps | SelectFieldProps) {
  const auto = useId();
  const { label, hint, error, id = auto, required, className } = props;
  const [show, setShow] = useState(false);
  const msgId = `${id}-msg`;
  const common = {
    id,
    name: (props as { name?: string }).name ?? id,
    'aria-describedby': msgId,
    'aria-invalid': error ? ('true' as const) : ('false' as const),
    'aria-required': required ? ('true' as const) : undefined,
  };
  let control: ReactNode;
  if (props.kind === 'textarea') {
    const { label: _l, hint: _h, error: _e, id: _i, kind: _k, required: _r, className: _c, ...rest } = props;
    control = <textarea className="textarea" rows={4} {...rest} {...common} />;
  } else if (props.kind === 'select') {
    const {
      label: _l,
      hint: _h,
      error: _e,
      id: _i,
      kind: _k,
      options,
      required: _r,
      className: _c,
      ...rest
    } = props;
    control = (
      <select className="select" {...rest} {...common}>
        {options.map((o) => {
          if (typeof o !== 'string' && 'group' in o)
            return (
              <optgroup key={o.group} label={o.group}>
                {o.options.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            );
          const v = typeof o === 'string' ? o : o.value;
          return (
            <option key={v} value={v}>
              {typeof o === 'string' ? o : o.label}
            </option>
          );
        })}
      </select>
    );
  } else {
    const {
      label: _l,
      hint: _h,
      error: _e,
      id: _i,
      kind: _k,
      required: _r,
      className: _c,
      type = 'text',
      ...rest
    } = props;
    const input = (
      <input
        className="input"
        autoComplete="off"
        {...rest}
        {...common}
        type={type === 'password' && show ? 'text' : type}
      />
    );
    control =
      type === 'password' ? (
        <div className="pwf">
          {input}
          <button
            type="button"
            className="icon-btn sm"
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
          >
            <Icon name={show ? 'eye-off' : 'eye'} size={16} />
          </button>
        </div>
      ) : (
        input
      );
  }
  return (
    <div className={clsx('field', error && 'err', className)}>
      <label htmlFor={id}>{label}</label>
      {control}
      <div className="msg" id={msgId} aria-live="polite">
        {error || hint || ''}
      </div>
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ---------- Segmented ---------- */
export interface SegOption<V extends string | number> {
  value: V;
  label: ReactNode;
  icon?: IconName;
  title?: string;
}
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: SegOption<V>[];
  value: V;
  onChange: (v: V) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={clsx('seg', className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={15} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- small display bits ---------- */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={clsx('bar', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <i style={{ width: `${Math.round(clamp(value, 0, 1) * 100)}%` }} />
    </div>
  );
}

export function StatusChip({ status }: { status: TopicStatus }) {
  return <span className={clsx('chip', STATUS_CHIP[status])}>{STATUS_LABEL[status]}</span>;
}

export const initials = (n: string) =>
  (n || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
