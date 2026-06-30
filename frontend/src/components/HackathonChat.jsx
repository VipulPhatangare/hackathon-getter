import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const SUGGESTIONS = [
  "What's the prize pool?",
  "Am I eligible to join?",
  "When's the registration deadline?",
  "What should I build for this?",
];

export default function HackathonChat({ hackathonId, hackathonTitle }) {
  const [messages, setMessages] = useState([]); // [{ role: "user" | "assistant", text }]
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setError("");
    setInput("");
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setSending(true);

    try {
      const r = await api.chat(hackathonId, { message: msg, history });
      setMessages((m) => [...m, { role: "assistant", text: r.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-dot" />
        <div>
          <div className="chat-title">Ask Gemini</div>
          <div className="chat-sub">About {hackathonTitle ? hackathonTitle.slice(0, 42) : "this hackathon"}</div>
        </div>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask anything about this hackathon — prizes, eligibility, deadlines, rules.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.text}</div>
        ))}

        {sending && (
          <div className="bubble assistant typing"><span /><span /><span /></div>
        )}

        {error && <div className="chat-error">{error}</div>}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <input
          placeholder="Type a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button className="btn sm" disabled={sending || !input.trim()}>➤</button>
      </form>
    </div>
  );
}
