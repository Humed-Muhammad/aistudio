import { useEffect, useRef, useState } from "react";
import { api, jobUrl, type Job } from "./api";

type Message = {
  role: "user" | "assistant";
  text: string;
  time: number;
  changes?: string[];
  warnings?: string[];
  error?: string;
  undo?: string | null;
  undone?: boolean;
};
type ChatState = { messages: Message[]; available: boolean; job: Job };

const EXAMPLES = [
  "Hide the captions when I say …",
  "Make the second card coral and move it lower",
  "The caption says … but I said …",
  "Switch the wall to studio teal with the halo light",
  "Remove every zoom after 0:20",
];

/** The edit chat: Claude changes the edit in place (graphics, captions, look) and remembers the conversation. */
export const ChatPanel: React.FC<{
  id: string;
  built: boolean;
  locked: boolean;
  show: (j: Job) => void;
  toast: (msg: string, error?: boolean) => void;
  onClose: () => void;
}> = ({ id, built, locked, show, toast, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [available, setAvailable] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const take = (c: ChatState) => {
    setMessages(c.messages);
    setAvailable(c.available);
    show(c.job);
  };

  useEffect(() => {
    api<ChatState>(jobUrl(id, "chat"))
      .then((c) => {
        setMessages(c.messages);
        setAvailable(c.available);
      })
      .catch((e) => toast((e as Error).message, true));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text = draft) => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(message);
    setDraft("");
    const d = new FormData();
    d.set("message", message);
    try {
      take(await api<ChatState>(jobUrl(id, "chat"), { method: "POST", body: d }));
    } catch (e) {
      toast((e as Error).message, true);
      setDraft(message);
      // A failed turn is still recorded; show it.
      api<ChatState>(jobUrl(id, "chat")).then((c) => setMessages(c.messages)).catch(() => undefined);
    } finally {
      setSending(null);
      box.current?.focus();
    }
  };
  const undo = async () => {
    try {
      take(await api<ChatState>(jobUrl(id, "chat/undo"), { method: "POST" }));
      toast("Undone. The edit is back to how it was before that change.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const restart = async () => {
    if (messages.length && !confirm("Start a new chat? Claude forgets this conversation. Your edit stays as it is.")) return;
    try {
      take(await api<ChatState>(jobUrl(id, "chat"), { method: "DELETE" }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const lastUndo = [...messages].reverse().find((m) => m.undo && !m.undone);
  const blocked = !built ? "Build your edit first, then chat to change it." : !available ? "Add ANTHROPIC_API_KEY to .env to chat with Claude." : locked ? "Wait for the current step to finish." : null;

  return (
    <aside className="chat" aria-label="Chat with Claude">
      <header className="chathead">
        <b>Chat with Claude</b>
        <span className="grow" />
        <button type="button" className="iconbtn" onClick={restart} disabled={!!sending || !messages.length} title="New chat" aria-label="New chat">
          ＋
        </button>
        <button type="button" className="iconbtn" onClick={onClose} title="Hide chat" aria-label="Hide chat">
          ‹
        </button>
      </header>

      <div className="chatlist" ref={list} aria-live="polite">
        {!messages.length && !sending ? (
          <div className="chatempty">
            <p>Tell Claude what to change, in Amharic or English. It edits in place: nothing is re-cut or rebuilt, and the preview updates right away.</p>
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
            <div key={i} className="msg me">
              {m.text}
            </div>
          ) : (
            <div key={i} className={"msg claude" + (m.undone ? " undone" : "")}>
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
              {m === lastUndo ? (
                <button type="button" className="btn secondary small" onClick={undo} disabled={!!sending || locked}>
                  ↶ Undo this
                </button>
              ) : null}
            </div>
          ),
        )}
        {sending ? (
          <>
            <div className="msg me">{sending}</div>
            <div className="msg claude thinking">
              <i />
              <i />
              <i />
              <span className="hint">Claude is editing…</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="chatinput">
        <textarea
          ref={box}
          rows={3}
          value={draft}
          disabled={!!blocked}
          placeholder={blocked ?? "e.g. Hide the caption when I say “download”. Message, then Enter."}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="row">
          <span className="hint">Uses your Anthropic key · a few cents a message</span>
          <button type="button" className="btn small" disabled={!!blocked || !!sending || !draft.trim()} onClick={() => send()}>
            Send
          </button>
        </div>
      </div>
    </aside>
  );
};
