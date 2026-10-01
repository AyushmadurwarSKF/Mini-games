(function () {
  class OnlineMatch {
    constructor({ onMessage, onChange }) {
      this.onMessage = onMessage;
      this.onChange = onChange;
      this.peer = null;
      this.connection = null;
      this.role = "X";
      this.online = false;
      this.connected = false;
      this.status = "Playing on this device";
      this.inviteUrl = "";
    }

    setStatus(message) {
      this.status = message;
      this.onChange();
    }

    startFromUrl() {
      const roomId = new URLSearchParams(location.hash.slice(1)).get("room");
      if (roomId) this.join(roomId);
    }

    startHost() {
      if (!window.Peer) {
        this.setStatus("Online play could not load. Check your internet connection.");
        return;
      }
      if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        this.setStatus("Online invites need this game hosted on an HTTPS website.");
        return;
      }

      this.online = true;
      this.role = "X";
      this.connected = false;
      this.setStatus("Creating your invite...");
      this.peer = new Peer();
      this.peer.on("open", (id) => {
        const url = new URL(location.href);
        url.hash = `room=${encodeURIComponent(id)}`;
        this.inviteUrl = url.toString();
        this.setStatus("Invite ready · you are Player 1 · waiting for your friend");
      });
      this.peer.on("connection", (connection) => {
        if (this.connection) {
          connection.close();
          return;
        }
        this.bind(connection);
      });
      this.peer.on("error", (error) => this.handleError(error));
    }

    join(roomId) {
      if (!window.Peer) {
        this.setStatus("Online play could not load. Check your internet connection.");
        return;
      }
      this.online = true;
      this.role = "O";
      this.setStatus("Connecting to your friend...");
      this.peer = new Peer();
      this.peer.on("open", () => this.bind(this.peer.connect(roomId, { reliable: true })));
      this.peer.on("error", (error) => this.handleError(error));
    }

    bind(connection) {
      this.connection = connection;
      connection.on("open", () => {
        this.connected = true;
        this.setStatus(`Connected · you are Player ${this.role === "X" ? "1" : "2"}`);
        if (this.role === "O") this.send({ type: "join" });
      });
      connection.on("data", (message) => this.onMessage(message));
      connection.on("close", () => {
        this.connected = false;
        this.setStatus("Your friend disconnected");
      });
      connection.on("error", () => this.setStatus("Connection interrupted. Try the invite again."));
    }

    handleError(error) {
      this.setStatus(error.type === "peer-unavailable"
        ? "Invite not found. Ask your friend to create a new one."
        : "Could not connect. Check your internet and try again.");
    }

    send(message) {
      if (this.connection && this.connected) this.connection.send(message);
    }
  }

  window.OnlineMatch = OnlineMatch;
})();