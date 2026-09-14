"use client"

import { useState } from "react"

/**
 * A way to reach the maintainer without publishing an address.
 *
 * Questions, bug reports and privacy requests all land in the same place. The
 * reply address is optional and is the only thing that identifies the sender.
 */
export function ContactForm({ defaultTopic = "question" }: { defaultTopic?: "question" | "bug" | "privacy" | "mcp" | "other" }) {
  const [topic, setTopic] = useState(defaultTopic)
  const [message, setMessage] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [website, setWebsite] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setState("sending")
    setError(null)
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, message, replyTo, website }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? `Failed (${response.status})`)
      setState("sent")
      setMessage("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState("error")
    }
  }

  if (state === "sent") {
    return (
      <p className="rounded-[var(--radius-md)] border border-rule bg-ink-2 px-4 py-3 font-mono text-[12px] text-bone/75">
        Sent. {replyTo ? "You'll hear back at the address you left." : "Leave a reply address next time if you'd like an answer."}
      </p>
    )
  }

  const field =
    "w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] text-bone/55">About</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value as typeof topic)} className={field}>
            <option value="question">A question</option>
            <option value="bug">Something broken</option>
            <option value="mcp">The MCP server</option>
            <option value="privacy">Privacy or data removal</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Reply to (optional)</span>
          <input type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="you@example.com" className={field} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className={`${field} resize-y`} />
      </label>
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        className="hidden"
        name="website"
      />
      {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending" || message.trim().length < 10}
        className="rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
      >
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  )
}
