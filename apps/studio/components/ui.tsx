"use client"

import { useEffect, useId, useState, type ReactNode } from "react"

/**
 * A collapsible group.
 *
 * The Studio exposes every number a preset carries, which is a wall of controls
 * if they are all open at once. Collapsing by default keeps the common path
 * short without hiding anything behind a different screen.
 */
export function Collapsible({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <section className="border-b border-rule last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-bone/[0.02]"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-bone/45">
            {title}
          </span>
          {hint && <span className="font-mono text-[10px] text-bone/35">{hint}</span>}
        </span>
        <span
          className={`font-mono text-[10px] text-bone/30 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          &gt;
        </span>
      </button>
      {open && (
        <div id={id} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  )
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-rule last:border-b-0">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-bone/40">{title}</h2>
        {action}
      </header>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-bone/55">{label}</span>
        {hint && <span className="font-mono text-[10px] tabular-nums text-bone/30">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  label,
  format,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
  format?: (value: number) => string
}) {
  return (
    <Field label={label} hint={format ? format(value) : String(Math.round(value * 100) / 100)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-bone/[0.03]"
    >
      <span className="font-mono text-[11px] text-bone/55">{label}</span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-[var(--radius-pill)] transition-colors ${
          checked ? "bg-bone" : "bg-rule-bright"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-[var(--radius-pill)] bg-ink transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div>
      {label && (
        <div className="mb-1.5 font-mono text-[11px] text-bone/55">{label}</div>
      )}
      <div className="flex gap-1 rounded-[var(--radius-pill)] border border-rule bg-ink p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[var(--radius-pill)] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              value === option.value
                ? "bg-bone text-ink"
                : "text-bone/45 hover:bg-bone/5 hover:text-bone/70"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full appearance-none rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[11px] text-bone/80 outline-none transition-colors focus:border-bone"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-ink">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  multiline,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  multiline?: boolean
}) {
  const className =
    "w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none transition-colors placeholder:text-bone/25 focus:border-bone"
  return (
    <Field label={label}>
      {multiline ? (
        <textarea
          value={value}
          rows={2}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </Field>
  )
}

export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <Field label={label} hint={value.toUpperCase()}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 shrink-0 rounded-[var(--radius-sm)]"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-1.5 font-mono text-[11px] text-bone/70 outline-none focus:border-bone"
        />
      </div>
    </Field>
  )
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "default" | "primary" | "ghost"
  disabled?: boolean
  title?: string
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-3.5 py-2 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
  const variants = {
    default: "border border-rule bg-ink-2 text-bone/75 hover:border-rule-bright hover:text-bone",
    primary: "bg-bone text-ink hover:bg-bone-dim",
    ghost: "text-bone/45 hover:bg-bone/5 hover:text-bone/80",
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  )
}

/** Button that briefly confirms it copied, so the click has visible feedback. */
export function CopyButton({
  text,
  label = "Copy",
  variant = "default",
}: {
  text: string
  label?: string
  variant?: "default" | "primary" | "ghost"
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant={variant}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          // Clipboard can be blocked (insecure origin, denied permission).
          // Selecting the code block by hand still works, so fail quietly.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  )
}

/**
 * The palette.
 *
 * A colourway is mostly this: two to eight colours the shader cycles around the
 * light axis. Reordering matters as much as the colours themselves — the ramp
 * wraps, so moving one swatch changes which two hues meet.
 */
export function PaletteField({
  palette,
  onChange,
  label = "Palette",
  max = 8,
}: {
  palette: string[]
  onChange: (palette: string[]) => void
  label?: string
  max?: number
}) {
  const set = (index: number, value: string) => {
    const next = [...palette]
    next[index] = value
    onChange(next)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-bone/55">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-bone/30">
          {palette.length} / {max}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {palette.map((colour, index) => (
          <span key={index} className="group relative">
            <input
              type="color"
              value={colour}
              onChange={(event) => set(index, event.target.value)}
              className="h-8 w-8 rounded-[var(--radius-sm)]"
              aria-label={`Colour ${index + 1}`}
            />
            {palette.length > 2 && (
              <button
                type="button"
                onClick={() => onChange(palette.filter((_, i) => i !== index))}
                aria-label={`Remove colour ${index + 1}`}
                data-compact
                className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center before:absolute before:-inset-2 before:content-[''] justify-center rounded-[var(--radius-pill)] border border-rule bg-ink font-mono text-[10px] text-bone/60 group-hover:flex hover:text-bone [@media(pointer:coarse)]:flex"
              >
                x
              </button>
            )}
          </span>
        ))}
        {palette.length < max && (
          <button
            type="button"
            onClick={() => onChange([...palette, palette[palette.length - 1] ?? "#ffffff"])}
            className="h-8 w-8 rounded-[var(--radius-sm)] border border-dashed border-rule-bright font-mono text-[13px] text-bone/40 transition-colors hover:border-bone hover:text-bone"
            aria-label="Add a colour"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}
