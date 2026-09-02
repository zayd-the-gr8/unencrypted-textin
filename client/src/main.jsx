import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  LogOut,
  Menu,
  Palette,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  UserPlus,
  X,
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function initials(name = "") {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avatar({ user, size = "normal" }) {
  return (
    <div className={`avatar ${size}`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" />
      ) : (
        initials(user?.name || "?")
      )}
    </div>
  );
}

function Auth({ onLogin }) {
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");

    try {
      const data = await request(
        registering ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(form),
        }
      );

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand large-brand">
          <div className="brand-icon">C</div>
          <span>Chatter</span>
        </div>

        <h1>{registering ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">
          {registering
            ? "Start messaging your friends."
            : "Sign in to continue chatting."}
        </p>

        {registering && (
          <input
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        )}

        <input
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />

        {error && <div className="error">{error}</div>}

        <button className="primary-button" type="submit">
          {registering ? "Create account" : "Sign in"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => setRegistering(!registering)}
        >
          {registering
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      </form>
    </main>
  );
}

function Sidebar({
  user,
  conversations,
  selected,
  onSelect,
  onSearch,
  onNewConversation,
  onCustomize,
  onLogout,
}) {
  const [search, setSearch] = useState("");

  const visible = conversations.filter((conversation) => {
    const other = conversation.members.find((m) => m.userId !== user.id)?.user;
    return other?.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-icon">C</div>
          <span>Chatter</span>
        </div>

        <div className="sidebar-actions">
          <button onClick={onCustomize} title="Customize">
            <Palette size={19} />
          </button>
          <button onClick={onLogout} title="Log out">
            <LogOut size={19} />
          </button>
        </div>
      </div>

      <div className="search-box">
        <Search size={18} />
        <input
          placeholder="Search chats"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onSearch(e.target.value);
          }}
        />
      </div>

      <button className="new-chat-button" onClick={onNewConversation}>
        <Plus size={18} />
        New message
      </button>

      <div className="conversation-list">
        {visible.map((conversation) => {
          const other = conversation.members.find(
            (member) => member.userId !== user.id
          )?.user;

          const latest = conversation.messages?.[0];

          return (
            <button
              className={`conversation ${
                selected?.id === conversation.id ? "active" : ""
              }`}
              key={conversation.id}
              onClick={() => onSelect(conversation)}
            >
              <Avatar user={other} />
              <div className="conversation-info">
                <div className="conversation-name">
                  <span>{other?.name || "Unknown user"}</span>
                  {latest && <small>{formatTime(latest.createdAt)}</small>}
                </div>
                <div className="conversation-preview">
                  {latest?.body || "No messages yet"}
                </div>
              </div>
            </button>
          );
        })}

        {!visible.length && (
          <div className="empty-small">No conversations yet</div>
        )}
      </div>

      <div className="profile-footer">
        <Avatar user={user} size="small" />
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
    </aside>
  );
}

function NewConversation({ onClose, onCreated }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setUsers(await request(`/api/users/search?q=${encodeURIComponent(query)}`));
      } catch {}
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  async function choose(user) {
    const conversation = await request("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ userId: user.id }),
    });

    onCreated(conversation);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New message</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="user-results">
          {users.map((user) => (
            <button className="user-result" key={user.id} onClick={() => choose(user)}>
              <Avatar user={user} />
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <UserPlus size={18} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chat({
  user,
  conversation,
  onBack,
  socket,
  theme,
  setTheme,
}) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  const other = conversation.members.find(
    (member) => member.userId !== user.id
  )?.user;

  useEffect(() => {
    let mounted = true;

    request(`/api/conversations/${conversation.id}/messages`).then((data) => {
      if (mounted) setMessages(data);
    });

    socket.emit("join_conversation", conversation.id);

    function handleMessage(message) {
      if (message.conversationId === conversation.id) {
        setMessages((previous) => {
          if (previous.some((item) => item.id === message.id)) return previous;
          return [...previous, message];
        });
      }
    }

    function handleTyping(data) {
      if (data.conversationId === conversation.id && data.userId !== user.id) {
        setTyping(true);
      }
    }

    function handleStopTyping(data) {
      if (data.conversationId === conversation.id) {
        setTyping(false);
      }
    }

    socket.on("new_message", handleMessage);
    socket.on("typing", handleTyping);
    socket.on("stop_typing", handleStopTyping);

    return () => {
      mounted = false;
      socket.emit("leave_conversation", conversation.id);
      socket.off("new_message", handleMessage);
      socket.off("typing", handleTyping);
      socket.off("stop_typing", handleStopTyping);
    };
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function changeBody(value) {
    setBody(value);
    socket.emit("typing", { conversationId: conversation.id });

    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("stop_typing", { conversationId: conversation.id });
    }, 1000);
  }

  async function send(event) {
    event.preventDefault();

    if (!body.trim()) return;

    const message = await request(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });

    setMessages((previous) => {
      if (previous.some((item) => item.id === message.id)) return previous;
      return [...previous, message];
    });

    setBody("");
    socket.emit("stop_typing", { conversationId: conversation.id });
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={21} />
        </button>

        <Avatar user={other} />

        <div className="chat-user">
          <strong>{other?.name}</strong>
          <span className="online-status">
            <i /> online
          </span>
        </div>

        <button className="header-button">
          <Settings size={20} />
        </button>
      </header>

      <div className="messages">
        <div className="chat-intro">
          <Avatar user={other} size="large" />
          <strong>{other?.name}</strong>
          <span>{other?.email}</span>
        </div>

        {messages.map((message) => {
          const own = message.senderId === user.id;

          return (
            <div className={`message-row ${own ? "own" : ""}`} key={message.id}>
              <div className={`message-bubble ${own ? "outgoing" : "incoming"}`}>
                <div>{message.body}</div>
                <div className="message-meta">
                  {formatTime(message.createdAt)}
                  {own &&
                    (message.readAt ? (
                      <CheckCheck size={14} />
                    ) : (
                      <Check size={14} />
                    ))}
                </div>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="typing-bubble">
            <span />
            <span />
            <span />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={send}>
        <button type="button">
          <Smile size={21} />
        </button>

        <input
          value={body}
          onChange={(e) => changeBody(e.target.value)}
          placeholder="Write a message..."
        />

        <button className="send-button" type="submit">
          <Send size={19} />
        </button>
      </form>
    </section>
  );
}

function Customizer({ theme, setTheme, onClose }) {
  function update(key, value) {
    setTheme((old) => ({ ...old, [key]: value }));
  }

  return (
    <div className="customizer">
      <div className="customizer-header">
        <h2>Customize</h2>
        <button onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <label>
        Appearance
        <select
          value={theme.mode}
          onChange={(e) => update("mode", e.target.value)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label>
        Accent color
        <input
          type="color"
          value={theme.accent}
          onChange={(e) => update("accent", e.target.value)}
        />
      </label>

      <label>
        Outgoing bubble
        <input
          type="color"
          value={theme.outgoingBubble}
          onChange={(e) => update("outgoingBubble", e.target.value)}
        />
      </label>

      <label>
        Incoming bubble
        <input
          type="color"
          value={theme.incomingBubble}
          onChange={(e) => update("incomingBubble", e.target.value)}
        />
      </label>

      <label>
        Bubble roundness
        <input
          type="range"
          min="8"
          max="30"
          value={theme.radius}
          onChange={(e) => update("radius", e.target.value)}
        />
      </label>

      <label>
        Font size
        <input
          type="range"
          min="13"
          max="19"
          value={theme.fontSize}
          onChange={(e) => update("fontSize", e.target.value)}
        />
      </label>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newConversation, setNewConversation] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");

    return (
      JSON.parse(saved) || {
        mode: "light",
        accent: "#4f7cff",
        incomingBubble: "#edf0f5",
        outgoingBubble: "#d8e5ff",
        radius: 20,
        fontSize: 15,
      }
    );
  });

  const socket = useMemo(() => {
    if (!user) return null;

    return io(API, {
      auth: {
        token: localStorage.getItem("token"),
      },
    });
  }, [user]);

  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    if (!user) return;

    request("/api/conversations").then(setConversations).catch(() => {
      logout();
    });
  }, [user]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    socket?.disconnect();
  }

  function addConversation(conversation) {
    setConversations((old) => {
      if (old.some((item) => item.id === conversation.id)) return old;
      return [conversation, ...old];
    });
    setSelected(conversation);
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div
      className={`app ${theme.mode}`}
      style={{
        "--accent": theme.accent,
        "--incoming-bubble": theme.incomingBubble,
        "--outgoing-bubble": theme.outgoingBubble,
        "--bubble-radius": `${theme.radius}px`,
        "--font-size": `${theme.fontSize}px`,
      }}
    >
      <Sidebar
        user={user}
        conversations={conversations}
        selected={selected}
        onSelect={setSelected}
        onNewConversation={() => setNewConversation(true)}
        onCustomize={() => setCustomizing(true)}
        onLogout={logout}
      />

      {selected && socket ? (
        <Chat
          user={user}
          conversation={selected}
          socket={socket}
          onBack={() => setSelected(null)}
          theme={theme}
          setTheme={setTheme}
        />
      ) : (
        <main className="welcome-panel">
          <div className="welcome-icon">C</div>
          <h1>Your boring ahh messages belong here</h1>
          <p>Select a conversation or start a new one.</p>
        </main>
      )}

      {newConversation && (
        <NewConversation
          onClose={() => setNewConversation(false)}
          onCreated={addConversation}
        />
      )}

      {customizing && (
        <Customizer
          theme={theme}
          setTheme={setTheme}
          onClose={() => setCustomizing(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
