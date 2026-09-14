/**
 * Reading a Twitch channel's chat without an account.
 *
 * Twitch's chat is IRC over a WebSocket, and it lets anyone read it under an
 * anonymous `justinfan` nickname — no login, no app registration, no API key.
 * With the tags capability on, that one connection carries chat, cheers (bits
 * on a message), subscriptions, gifted subs and raids. Follows are not in chat;
 * those need Twitch's authenticated EventSub, which this deliberately avoids.
 */

export type StreamEvent =
  | { kind: "chat"; user: string; text: string; bits?: number }
  | { kind: "sub"; user: string; months?: number; gifts?: number }
  | { kind: "raid"; user: string; viewers: number }

export type ChatStatus = "connecting" | "live" | "offline" | "error"

interface Line {
  tags: Record<string, string>
  prefix: string
  command: string
  params: string[]
}

export function parseLine(raw: string): Line | null {
  let rest = raw
  const tags: Record<string, string> = {}
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ")
    for (const pair of rest.slice(1, end).split(";")) {
      const at = pair.indexOf("=")
      tags[at < 0 ? pair : pair.slice(0, at)] = at < 0 ? "" : pair.slice(at + 1).replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\")
    }
    rest = rest.slice(end + 1)
  }
  let prefix = ""
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ")
    prefix = rest.slice(1, end)
    rest = rest.slice(end + 1)
  }
  const trailingAt = rest.indexOf(" :")
  const head = trailingAt >= 0 ? rest.slice(0, trailingAt) : rest
  const params = head.split(" ").filter(Boolean)
  const command = params.shift()
  if (!command) return null
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2))
  return { tags, prefix, command, params }
}

/** The event a line means for an overlay, if any. */
export function eventFrom(line: Line): StreamEvent | null {
  const user = line.tags["display-name"] || line.prefix.split("!")[0] || "someone"
  if (line.command === "PRIVMSG") {
    const bits = Number(line.tags.bits)
    return { kind: "chat", user, text: line.params[1] ?? "", ...(bits > 0 ? { bits } : {}) }
  }
  if (line.command === "USERNOTICE") {
    const id = line.tags["msg-id"]
    const login = line.tags["msg-param-displayName"] || line.tags["display-name"] || user
    if (id === "sub" || id === "resub") return { kind: "sub", user: login, months: Number(line.tags["msg-param-cumulative-months"]) || 1 }
    if (id === "subgift" || id === "anonsubgift") return { kind: "sub", user: login, gifts: 1 }
    if (id === "submysterygift") return { kind: "sub", user: login, gifts: Number(line.tags["msg-param-mass-gift-count"]) || 1 }
    if (id === "raid") return { kind: "raid", user: login, viewers: Number(line.tags["msg-param-viewerCount"]) || 1 }
  }
  return null
}

/** Join a channel's chat anonymously. Returns a function that leaves it. */
export function connectTwitch(channel: string, onEvent: (event: StreamEvent) => void, onStatus: (status: ChatStatus) => void = () => {}): () => void {
  const name = channel.trim().toLowerCase().replace(/^#/, "")
  if (!/^\w{3,25}$/.test(name)) {
    onStatus("error")
    return () => {}
  }
  let socket: WebSocket | null = null
  let closed = false
  let retry = 1000
  let timer: ReturnType<typeof setTimeout> | undefined

  const open = () => {
    onStatus("connecting")
    socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443")
    socket.onopen = () => {
      socket!.send("CAP REQ :twitch.tv/tags twitch.tv/commands")
      socket!.send("PASS SCHMOOPIIE")
      socket!.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`)
      socket!.send(`JOIN #${name}`)
    }
    socket.onmessage = (message) => {
      for (const raw of String(message.data).split("\r\n")) {
        if (!raw) continue
        if (raw.startsWith("PING")) {
          socket?.send(raw.replace("PING", "PONG"))
          continue
        }
        const line = parseLine(raw)
        if (!line) continue
        // ROOMSTATE arrives once the join has gone through.
        if (line.command === "ROOMSTATE") {
          retry = 1000
          onStatus("live")
        }
        const event = eventFrom(line)
        if (event) onEvent(event)
      }
    }
    socket.onclose = () => {
      if (closed) return
      onStatus("offline")
      timer = setTimeout(open, retry)
      retry = Math.min(30_000, retry * 2)
    }
  }
  open()

  return () => {
    closed = true
    clearTimeout(timer)
    socket?.close()
  }
}
