"use client";

import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function FieldWrapper({ label, error, hint, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-ink-700">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-ink-400">{hint}</p>}
      {error && <p className="text-xs text-status-red">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint}>
      <input
        ref={ref}
        className={clsx(
          "focus-ring w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300",
          error ? "border-status-red" : "border-ink-100",
          className
        )}
        {...props}
      />
    </FieldWrapper>
  )
);
Input.displayName = "Input";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className, options, placeholder, ...props }, ref) => (
    <FieldWrapper label={label} error={error} hint={hint}>
      <select
        ref={ref}
        className={clsx(
          "focus-ring w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900",
          error ? "border-status-red" : "border-ink-100",
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
);
Select.displayName = "Select";
