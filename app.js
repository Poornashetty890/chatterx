const ws = new WebSocket("ws://localhost:8080");

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    document.getElementById("chat").innerHTML += `<p>${data.message}</p>`;
};

function sendMessage() {
    const msg = document.getElementById("msg").value;
    ws.send(JSON.stringify({type:"chat", message: msg}));
}
