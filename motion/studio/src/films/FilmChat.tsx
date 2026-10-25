import { useCallback, useEffect, useRef, useState } from "react";
import { api, sendJSON } from "../api";
import { filmUrl, type ChatMessage, type ChatState, type FilmSetup, type FilmState, type Task } from "./filmApi";

const EXAMPLES = [
  "Make the hook shorter and punchier",
  "Swap scene 3 for a chat on the phone",
  "Use our colours: #0F766E and #F97316",
  "Add a scene with our prices after the dashboard",
  "Fly through it in 3D",
  "Translate every word to Amharic",
];

/**
 * Chat with Claude about the film. Claude Code edits film.json in place; the preview follows the file while it works,
 * so changes appear as they are made. The conversation continues across messages; each change can be undone.
 */
export const FilmChat: React.FC<{
  id: string;
  setup: FilmSetup;
  making: boolean;
  onFilm: (s: FilmState) => void;
  toast: (msg: string, error?: boolean) => void;
  onClose: () => void;
}> = ({ id, setup, making, onFilm, toast, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Task | null>(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem("film-chat-model") || "sonnet";
    } catch {
      return "sonnet";
    }
  });
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number>(undefined);

  const take = useCallback(
    (c: ChatState) => {
      setMessages(c.messages);
      setStatus(c.status);
      onFilm(c.film);
      window.clearTimeout(timer.current);
      if (c.status.state === "running") timer.current = window.setTimeout(() => api<ChatState>(filmUrl(id, "chat")).then(take, () => undefined), 1000);
    },
    [id, onFilm],
  );
  useEffect(() => {
    api<ChatState>(filmUrl(id, "chat")).then(take, (e) => toast((e as Error).message, true));
    return () => window.clearTimeout(timer.current);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A make started elsewhere (Claude section) also runs in this slot: follow it so the chat unlocks when it ends.
  useEffect(() => {
    if (making && status?.state !== "running") api<ChatState>(filmUrl(id, "chat")).then(take, () => undefined);
  }, [making]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, status?.status]);

  const running = status?.state === "running";
  const chatting = running && status?.action === "chat";
  const send = async (text = draft) => {
    const message = text.trim();
    if (!message || running) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: message, time: Date.now() / 1000 }]);
    try {
      take(await sendJSON<ChatState>(filmUrl(id, "chat"), "POST", { message, model }));
    } catch (e) {
      toast((e as Error).message, true);
      setDraft(message);
      api<ChatState>(filmUrl(id, "chat")).then(take, () => undefined);
    }
  };
  const undo = async () => {
    try {
      onFilm(await api<FilmState>(filmUrl(id, "undo"), { method: "POST" }));
      setMessages((await api<ChatState>(filmUrl(id, "chat"))).messages);
      toast("Undone. The film is back to how it was before that change.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const restart = async () => {
    if (messages.length && !confirm("Start a new chat? Claude forgets this conversation. Your film stays as it is.")) return;
    try {
      take(await api<ChatState>(filmUrl(id, "chat"), { method: "DELETE" }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const stop = async () => {
    try {
      onFilm(await sendJSON<FilmState>(filmUrl(id, "cancel"), "POST", { slot: "claude" }));
      api<ChatState>(filmUrl(id, "chat")).then(take, () => undefined);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const lastUndo = [...messages].reverse().find((m) => m.backup && !m.undone);
  const blocked = !setup.claude ? "Install and sign in to Claude Code to chat." : running && !chatting ? "Claude is making the film. The chat opens when it is done." : null;

  return (
    <aside className="chat" aria-label="Chat with Claude">
      <header className="chathead">
        <b>Chat with Claude</b>
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            try {
              localStorage.setItem("film-chat-model", e.target.value);
            } catch {
              /* only a convenience */
            }
          }}
          aria-label="Model"
          style={{ width: "auto", padding: "4px 6px", fontSize: 12 }}
          title="Haiku is quickest; Opus is best for big changes"
        >
          {Object.keys(setup.models).map((k) => (
            <option key={k} value={k}>
              {k[0].toUpperCase() + k.slice(1)}
            </option>
          ))}
        </select>
        <button type="button" className="iconbtn" onClick={restart} disabled={running || !messages.length} title="New chat" aria-label="New chat">
          ＋
        </button>
        <button type="button" className="iconbtn" onClick={onClose} title="Hide chat" aria-label="Hide chat">
          ‹
        </button>
      </header>

      <div className="chatlist" ref={list} aria-live="polite">
        {!messages.length && !running ? (
          <div className="chatempty">
            <p>Tell Claude what to change, in Amharic or English. It edits the film while you watch: the preview updates as it works. Every change can be undone.</p>
            {EXAMPLES.map((x) => (
              <button
                key={x}
                type="button"
                className="chip"
                onClick={() => {
                  setDraft(x);
                  box.current?.focus();
                }}
              >
                {x}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg me" dir="auto">
              {m.text}
            </div>
          ) : (
            <div key={i} className={"msg claude" + (m.undone ? " undone" : "")} dir="auto">
              {m.text ? <p>{m.text}</p> : null}
              {m.error ? <p className="err">{m.error}</p> : null}
              {m.changes?.length ? (
                <ul className="changes">
                  {m.changes.map((c, k) => (
                    <li key={k}>{c}</li>
                  ))}
                </ul>
              ) : null}
              {m.warnings?.length ? (
                <ul className="warnings">
                  {m.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {m.undone ? <span className="hint">Undone</span> : null}
              {m === lastUndo && !running ? (
                <button type="button" className="btn secondary small" onClick={undo}>
                  ↶ Undo this
                </button>
              ) : null}
            </div>
          ),
        )}
        {chatting ? (
          <div className="msg claude thinking">
            <i />
            <i />
            <i />
            <span className="hint">{status?.status || "Claude is working…"}</span>
            <button type="button" className="btn ghost small" onClick={stop}>
              Stop
            </button>
          </div>
        ) : null}
      </div>

      <div className="chatinput">
        <textarea
          ref={box}
          rows={3}
          dir="auto"
          value={draft}
          disabled={!!blocked}
          placeholder={blocked ?? "e.g. Make scene 2 coral and slower. Message, then Enter."}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <span className="hint">Runs on your Claude plan · no API key</span>
          <button type="button" className="btn small" disabled={!!blocked || running || !draft.trim()} onClick={() => send()}>
            Send
          </button>
        </div>
      </div>
    </aside>
  );
};
