"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { clsx } from "clsx";
import { FieldWrapper } from "@/components/ui/form";
import { api } from "@/lib/api-client";

interface LenderComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

export function LenderCombobox({ label = "Bank / NBFC", value, onChange, error, hint }: LenderComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<{ items: string[] }>(
          `/api/lenders?q=${encodeURIComponent(query)}&limit=50`
        );
        if (!cancelled) {
          setItems(data.items);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function select(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && items[highlight]) {
        e.preventDefault();
        select(items[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <FieldWrapper
      label={label}
      error={error}
      hint={hint ?? "Search RBI-registered NBFCs and ARCs (as of 30 Jun 2026)"}
    >
      <div ref={rootRef} className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : value}
          placeholder="Type to search…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => {
            setQuery(value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={clsx(
            "focus-ring w-full rounded-lg border bg-white py-2.5 pl-3.5 pr-10 text-sm text-ink-900 placeholder:text-ink-300",
            error ? "border-status-red" : "border-ink-100"
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />

        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-ink-100 bg-white py-1 shadow-card"
          >
            {loading && items.length === 0 && (
              <li className="px-3.5 py-2 text-sm text-ink-400">Searching…</li>
            )}
            {!loading && items.length === 0 && (
              <li className="px-3.5 py-2 text-sm text-ink-400">No matching NBFCs</li>
            )}
            {items.map((name, index) => (
              <li key={name} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(name)}
                  className={clsx(
                    "w-full px-3.5 py-2 text-left text-sm",
                    index === highlight ? "bg-brand-50 text-ink-900" : "text-ink-700"
                  )}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
}
