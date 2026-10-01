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
      const roomId = new URLSearchParams(
        location.hash.slice(1)
      ).get("room");

      if (roomId) {
        this.join(roomId);
      }
    }

    createPeer() {

      const peer = new Peer({

        debug: 3,

        config: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302"
            },
            {
              urls: "stun:global.stun.twilio.com:3478"
            }
          ]
        }
      });

      peer.on("error", (err) => {
        console.error("PeerJS Error:", err);
      });

      peer.on("disconnected", () => {
        console.warn("Peer disconnected");
      });

      peer.on("close", () => {
        console.warn("Peer closed");
      });

      return peer;
    }

    startHost() {

      if (!window.Peer) {
        this.setStatus(
          "Online play could not load. Check your internet connection."
        );
        return;
      }

      if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
      ) {
        this.setStatus(
          "Online invites need this game hosted on an HTTPS website."
        );
        return;
      }

      this.online = true;
      this.role = "X";
      this.connected = false;

      this.setStatus("Creating your invite...");

      this.peer = this.createPeer();

      this.peer.on("open", (id) => {

        console.log("Host Peer ID:", id);

        const url = new URL(location.href);

        url.hash =
          `room=${encodeURIComponent(id)}`;

        this.inviteUrl = url.toString();

        this.setStatus(
          "Invite ready · you are Player 1 · waiting for your friend"
        );
      });

      this.peer.on("connection", (connection) => {

        console.log(
          "Incoming connection from:",
          connection.peer
        );

        if (this.connection) {
          connection.close();
          return;
        }

        this.bind(connection);
      });

      this.peer.on("error",
        (error) => this.handleError(error)
      );
    }

    join(roomId) {

      if (!window.Peer) {
        this.setStatus(
          "Online play could not load. Check your internet connection."
        );
        return;
      }

      if (!roomId) {
        this.setStatus("Invalid invite link");
        return;
      }

      this.online = true;
      this.role = "O";

      this.setStatus(
        "Connecting to your friend..."
      );

      this.peer = this.createPeer();

      this.peer.on("open", () => {

        console.log(
          "My Peer ID:",
          this.peer.id
        );

        console.log(
          "Joining Room:",
          roomId
        );

        const connection = this.peer.connect(
          roomId,
          {
            reliable: true
          }
        );

        connection.on(
          "error",
          (err) => {
            console.error(
              "Connection Error:",
              err
            );
          }
        );

        this.bind(connection);
      });

      this.peer.on("error",
        (error) => this.handleError(error)
      );
    }

    bind(connection) {

      this.connection = connection;

      connection.on("open", () => {

        console.log(
          "Connection established"
        );

        this.connected = true;

        this.setStatus(
          `Connected · you are Player ${
            this.role === "X"
              ? "1"
              : "2"
          }`
        );

        if (this.role === "O") {
          this.send({
            type: "join"
          });
        }
      });

      connection.on("data",
        (message) => {
          console.log(
            "Received:",
            message
          );

          this.onMessage(message);
        }
      );

      connection.on("close", () => {

        console.warn(
          "Connection closed"
        );

        this.connected = false;

        this.setStatus(
          "Your friend disconnected"
        );
      });

      connection.on("error", (err) => {

        console.error(
          "Connection Error:",
          err
        );

        this.connected = false;

        this.setStatus(
          "Connection interrupted. Try the invite again."
        );
      });
    }

    handleError(error) {

      console.error(
        "Peer Error:",
        error
      );

      switch (error.type) {

        case "peer-unavailable":
          this.setStatus(
            "Invite not found. Ask your friend to create a new one."
          );
          break;

        case "network":
          this.setStatus(
            "Network issue detected."
          );
          break;

        case "server-error":
          this.setStatus(
            "PeerJS server issue."
          );
          break;

        default:
          this.setStatus(
            `Connection failed: ${error.type || "Unknown Error"}`
          );
      }
    }

    send(message) {

      if (
        this.connection &&
        this.connected
      ) {

        console.log(
          "Sending:",
          message
        );

        this.connection.send(message);
      }
    }
  }

  window.OnlineMatch = OnlineMatch;

})();