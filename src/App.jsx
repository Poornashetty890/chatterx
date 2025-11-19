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
    const [recipientId, setRecipientId] = useState("");
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const [typingUser, setTypingUser] = useState("");
    const messagesEndRef = useRef(null);
    const socketRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Clear typing indicator
    useEffect(() => {
        if (isTyping) {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                setIsTyping(false);
                setTypingUser("");
            }, 3000);
        }
    }, [isTyping]);

    useEffect(() => {
        socketRef.current = io(WS_BASE, { autoConnect: false });

        socketRef.current.on("connect", () => setConnected(true));
        socketRef.current.on("disconnect", () => setConnected(false));

        socketRef.current.on("message", (message) => {
            setMessages((prev) => [...prev, message]);
        });

        socketRef.current.on("ack", (ack) => {
            console.log("Message acknowledged:", ack);
        });

        socketRef.current.on("user_joined", (user) => {
            setOnlineUsers(prev => [...prev, user]);
            setMessages(prev => [...prev, {
                type: "system",
                text: `${user.username} joined the chat`,
                timestamp: Date.now()
            }]);
        });

        socketRef.current.on("user_left", (user) => {
            setOnlineUsers(prev => prev.filter(u => u.id !== user.id));
            setMessages(prev => [...prev, {
                type: "system",
                text: `${user.username} left the chat`,
                timestamp: Date.now()
            }]);
        });

        socketRef.current.on("user_typing", (data) => {
            if (data.userId !== userId) {
                setIsTyping(true);
                setTypingUser(data.username);
            }
        });

        socketRef.current.on("user_stop_typing", (data) => {
            if (data.userId !== userId) {
                setIsTyping(false);
                setTypingUser("");
            }
        });

        socketRef.current.on("online_users", (users) => {
            setOnlineUsers(users);
        });

        return () => {
            socketRef.current.disconnect();
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [userId]);

    const handleTyping = () => {
        if (socketRef.current && userId) {
            socketRef.current.emit("typing", { userId, username });
        }
    };

    const handleStopTyping = () => {
        if (socketRef.current && userId) {
            socketRef.current.emit("stop_typing", { userId, username });
        }
    };

    async function onRegister() {
        if (!username.trim()) return alert("Please enter a username");

        try {
            const response = await axios.post(`${API_BASE}/api/auth/register`, {
                username: username.trim()
            });

            setUserId(response.data.id);
            socketRef.current.auth = { userId: response.data.id };
            socketRef.current.connect();
            socketRef.current.emit("auth", { userId: response.data.id, username: username.trim() });

            // Load message history
            const historyResponse = await axios.get(`${API_BASE}/api/messages/pull`);
            if (historyResponse.data?.messages) {
                setMessages(historyResponse.data.messages);
            }

        } catch (error) {
            console.error("Registration error:", error);
            alert("Registration failed. Please try again.");
        }
    }

    function sendMessage() {
        if (!userId) return alert("Please register first");
        if (!text.trim()) return;

        const payload = {
            sender_id: userId,
            recipient_id: recipientId ? Number(recipientId) : null,
            text: text.trim(),
            username: username,
            timestamp: Date.now()
        };

        socketRef.current.emit("send_message", payload);
        setText("");
        handleStopTyping();
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const isOwnMessage = (message) => {
        return message.sender_id === userId;
    };

    return (
        <div className="chat-app">
            <div className="chat-container">
                {!userId ? (
                    <div className="auth-container">
                        <div className="auth-card">
                            <h1>💬 Simple Chat</h1>
                            <p>Join the conversation</p>
                            <input
                                className="auth-input"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && onRegister()}
                            />
                            <button className="auth-button" onClick={onRegister}>
                                Join Chat
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="chat-interface">
                        {/* Header */}
                        <div className="chat-header">
                            <div className="header-left">
                                <h2>💬 Simple Chat</h2>
                                <div className="connection-status">
                                    <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></div>
                                    {connected ? 'Connected' : 'Disconnected'}
                                </div>
                            </div>
                            <div className="header-right">
                                <div className="user-info">
                                    <span className="username">{username}</span>
                                    <span className="user-id">ID: {userId}</span>
                                </div>
                            </div>
                        </div>

                        <div className="chat-body">
                            {/* Online Users Sidebar */}
                            <div className="sidebar">
                                <h3>Online Users ({onlineUsers.length})</h3>
                                <div className="users-list">
                                    {onlineUsers.map(user => (
                                        <div key={user.id} className="user-item">
                                            <div className="user-avatar">
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-details">
                                                <span className="user-name">{user.username}</span>
                                                <span className="user-id-small">ID: {user.id}</span>
                                            </div>
                                            <div className="online-indicator"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Main Chat Area */}
                            <div className="main-chat">
                                {/* Messages Container */}
                                <div className="messages-container">
                                    {messages.map((message, index) => (
                                        <div
                                            key={index}
                                            className={`message ${
                                                message.type === 'system'
                                                    ? 'system-message'
                                                    : isOwnMessage(message)
                                                        ? 'own-message'
                                                        : 'other-message'
                                            }`}
                                        >
                                            {message.type !== 'system' && !isOwnMessage(message) && (
                                                <div className="message-sender">
                                                    {message.username || `User ${message.sender_id}`}
                                                </div>
                                            )}
                                            <div className="message-content">
                                                {message.text}
                                            </div>
                                            <div className="message-time">
                                                {formatTime(message.timestamp)}
                                            </div>
                                        </div>
                                    ))}

                                    {isTyping && (
                                        <div className="typing-indicator">
                                            <div className="typing-dots">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                            {typingUser} is typing...
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input Area */}
                                <div className="input-container">
                                    <div className="recipient-selector">
                                        <input
                                            type="text"
                                            placeholder="Recipient ID (leave blank for broadcast)"
                                            value={recipientId}
                                            onChange={(e) => setRecipientId(e.target.value)}
                                            className="recipient-input"
                                        />
                                    </div>
                                    <div className="message-input-row">
                                        <textarea
                                            className="message-input"
                                            placeholder="Type your message..."
                                            value={text}
                                            onChange={(e) => {
                                                setText(e.target.value);
                                                handleTyping();
                                            }}
                                            onKeyDown={handleKeyPress}
                                            onBlur={handleStopTyping}
                                            rows="1"
                                        />
                                        <button
                                            className="send-button"
                                            onClick={sendMessage}
                                            disabled={!text.trim()}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .chat-app {
                    height: 100vh;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .chat-container {
                    width: 95%;
                    height: 95%;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    overflow: hidden;
                }

                /* Authentication Styles */
                .auth-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }

                .auth-card {
                    background: white;
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    text-align: center;
                    min-width: 300px;
                }

                .auth-card h1 {
                    margin: 0 0 8px 0;
                    color: #333;
                }

                .auth-card p {
                    color: #666;
                    margin-bottom: 24px;
                }

                .auth-input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    margin-bottom: 16px;
                    transition: border-color 0.2s;
                }

                .auth-input:focus {
                    outline: none;
                    border-color: #667eea;
                }

                .auth-button {
                    width: 100%;
                    padding: 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: transform 0.2s;
                }

                .auth-button:hover {
                    transform: translateY(-1px);
                }

                /* Chat Interface Styles */
                .chat-interface {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .chat-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 24px;
                    background: white;
                    border-bottom: 1px solid #e1e5e9;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .header-left h2 {
                    margin: 0;
                    color: #333;
                }

                .connection-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #666;
                    font-size: 14px;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .status-dot.connected {
                    background: #10b981;
                }

                .status-dot.disconnected {
                    background: #ef4444;
                }

                .user-info {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }

                .username {
                    font-weight: 600;
                    color: #333;
                }

                .user-id {
                    font-size: 12px;
                    color: #666;
                }

                .chat-body {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }

                /* Sidebar Styles */
                .sidebar {
                    width: 250px;
                    background: #f8fafc;
                    border-right: 1px solid #e1e5e9;
                    padding: 16px;
                    overflow-y: auto;
                }

                .sidebar h3 {
                    margin: 0 0 16px 0;
                    color: #333;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .users-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .user-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px;
                    border-radius: 8px;
                    transition: background-color 0.2s;
                }

                .user-item:hover {
                    background: #e2e8f0;
                }

                .user-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: 600;
                    font-size: 14px;
                }

                .user-details {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .user-name {
                    font-weight: 600;
                    color: #333;
                    font-size: 14px;
                }

                .user-id-small {
                    font-size: 11px;
                    color: #666;
                }

                .online-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #10b981;
                }

                /* Main Chat Styles */
                .main-chat {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .messages-container {
                    flex: 1;
                    padding: 16px;
                    overflow-y: auto;
                    background: #f8fafc;
                }

                .message {
                    max-width: 70%;
                    margin-bottom: 16px;
                    padding: 12px 16px;
                    border-radius: 16px;
                    position: relative;
                }

                .own-message {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    margin-left: auto;
                    border-bottom-right-radius: 4px;
                }

                .other-message {
                    background: white;
                    color: #333;
                    border: 1px solid #e1e5e9;
                    border-bottom-left-radius: 4px;
                }

                .system-message {
                    background: #f1f5f9;
                    color: #64748b;
                    text-align: center;
                    max-width: none;
                    margin: 8px auto;
                    font-style: italic;
                    font-size: 14px;
                }

                .message-sender {
                    font-weight: 600;
                    font-size: 12px;
                    margin-bottom: 4px;
                    color: #667eea;
                }

                .message-content {
                    word-wrap: break-word;
                    line-height: 1.4;
                }

                .message-time {
                    font-size: 11px;
                    opacity: 0.7;
                    margin-top: 4px;
                    text-align: right;
                }

                .other-message .message-time {
                    text-align: left;
                }

                .typing-indicator {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    color: #666;
                    font-size: 14px;
                    font-style: italic;
                }

                .typing-dots {
                    display: flex;
                    gap: 4px;
                }

                .typing-dots span {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #667eea;
                    animation: typing 1.4s infinite ease-in-out;
                }

                .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
                .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

                @keyframes typing {
                    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }

                /* Input Area Styles */
                .input-container {
                    padding: 16px 24px;
                    background: white;
                    border-top: 1px solid #e1e5e9;
                }

                .recipient-selector {
                    margin-bottom: 12px;
                }

                .recipient-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 14px;
                }

                .recipient-input:focus {
                    outline: none;
                    border-color: #667eea;
                }

                .message-input-row {
                    display: flex;
                    gap: 12px;
                    align-items: flex-end;
                }

                .message-input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 2px solid #e1e5e9;
                    border-radius: 16px;
                    font-size: 14px;
                    resize: none;
                    max-height: 120px;
                    font-family: inherit;
                    transition: border-color 0.2s;
                }

                .message-input:focus {
                    outline: none;
                    border-color: #667eea;
                }

                .send-button {
                    width: 48px;
                    height: 48px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;
                }

                .send-button:hover:not(:disabled) {
                    transform: scale(1.05);
                }

                .send-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                /* Responsive Design */
                @media (max-width: 768px) {
                    .chat-container {
                        width: 100%;
                        height: 100%;
                        border-radius: 0;
                    }

                    .sidebar {
                        display: none;
                    }

                    .message {
                        max-width: 85%;
                    }

                    .chat-header {
                        padding: 12px 16px;
                    }

                    .input-container {
                        padding: 12px 16px;
                    }
                }
            `}</style>
        </div>
    );
}