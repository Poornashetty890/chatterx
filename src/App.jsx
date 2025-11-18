import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";

/*
  Configure these for your deployment:
  - API_BASE: points to FastAPI (only used for register & fallback pull if needed)
  - WS_BASE: points to Node.js server (exposed via Tailscale Funnel / public URL)
*/
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const WS_BASE = import.meta.env.VITE_WS_BASE || "http://localhost:3000";

export default function App() {
    const [username, setUsername] = useState("");
    const [userId, setUserId] = useState(null);
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const socketRef = useRef(null);

    useEffect(() => {
        // create socket but do not connect yet
        socketRef.current = io(WS_BASE, { autoConnect: false });
        socketRef.current.on("connect", () => setConnected(true));
        socketRef.current.on("disconnect", () => setConnected(false));
        socketRef.current.on("message", (m) => {
            setMessages((s) => [...s, m]);
        });
        socketRef.current.on("ack", (a) => {
            // optionally show status
            console.log("ack", a);
        });
        return () => {
            socketRef.current.disconnect();
        };
    }, []);

    async function onRegister() {
        if (!username) return alert("enter username");
        try {
            const r = await axios.post(`${API_BASE}/api/auth/register`, {
                username: username
            });

            setUserId(r.data.id);

            socketRef.current.auth = { userId: r.data.id };
            socketRef.current.connect();
            socketRef.current.emit("auth", { userId: r.data.id });

            const pull = await axios.get(`${API_BASE}/api/messages/pull`);
            if (pull.data?.messages) setMessages(pull.data.messages);

        } catch (e) {
            console.error(e);
            alert("register error");
        }
    }

    function sendMessage(recipientId = null) {
        if (!userId) return alert("register first");
        if (!text) return;
        const payload = { sender_id: userId, recipient_id: recipientId, text };
        // send via websocket
        socketRef.current.emit("send_message", payload);
        setMessages((s) => [...s, { sender_id: userId, text, timestamp: Date.now() }]);
        setText("");
    }

    return (
        <div style={{ padding: 20, fontFamily: "system-ui, Arial" }}>
            {!userId ? (
                <div>
                    <h2>Simple Chat (Phase 0)</h2>
                    <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                    <button onClick={onRegister}>Register & Connect</button>
                </div>
            ) : (
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>Logged in as <strong>{username}</strong> (id: {userId})</div>
                        <div>WS: {connected ? "connected" : "disconnected"}</div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                        <div style={{ height: 300, overflow: "auto", border: "1px solid #ddd", padding: 8 }}>
                            {messages.map((m, i) => (
                                <div key={i} style={{ marginBottom: 8 }}>
                                    <b>{m.sender_id || m.sender_id === 0 ? "User " + m.sender_id : "User"}</b>: {m.text || m.text === "" ? m.text : m.text}
                                    <div style={{ fontSize: 12, color: "#666" }}>{m.timestamp ? new Date(m.timestamp).toLocaleString() : ""}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 8 }}>
                            <input style={{ width: "70%" }} placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
                            <button onClick={() => sendMessage(null)}>Send (broadcast)</button>
                            <button onClick={() => {
                                const rid = prompt("recipient userId (leave blank to broadcast)");
                                sendMessage(rid ? Number(rid) : null);
                            }}>Send to user</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
