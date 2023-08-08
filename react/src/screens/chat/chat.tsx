import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { Box } from "@mui/material";

import BG from "../../assets/HBG.jpg";
import { SocketInstance } from "../../socket/socket";
import "./chat.css";

interface ChatMessage {
  user: string;
  message: string;
}
function ChatScreen() {
  const [username, setUsername] = useState("");
  const [connectedClients, setConnectedClients] = useState([]);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const navigate = useNavigate();

  const handleUsernameChange = (e:any) => {
    setUsername(e.target.value);
  };

  const handleMessageChange = (e:any) => {
    setMessage(e.target.value);
  };

  const handleSendMessage = () => {
    if (message.trim() !== "") {
      // Send the message through the chat server
      // You should implement this functionality using your SocketInstance
      // For example: SocketInstance.sendMessage(message);
      
      // Clear the message input
      setMessage("");
    }
  };

  useEffect(() => {
    const connectedClientsCallback = (data:any) => {
      setConnectedClients(data.clients);
    };
    SocketInstance.subscribe("connected_clients", connectedClientsCallback);

    // Simulated chat history
    setChatHistory([
      { user: "User1", message: "Hello!" },
      { user: "User2", message: "Hi there!" },
      // Add more chat messages here
    ]);

    return () => {
      SocketInstance.unsubscribe(
        "connected_clients",
        connectedClientsCallback
      );
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundImage: `url(${BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "50%",
          height: "80%",
          top: "20%",
          marginTop: "-5%",
          left: "20%",
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(5px)",
          borderRadius: "10px",
          display: "flex",
          flexDirection: "column",
          padding: "1rem",
        }}
      >
        <Typography variant="h4" gutterBottom style={{marginTop: "-0%", color: "#80ff00",borderBottom:"2px solid purple" }}>
          The Abyss.
        </Typography>
        <div
          style={{
            minHeight: '60vh', overflow: 'auto'
          }}
        >
          {chatHistory.map((chat, index) => (
            <Typography key={index} variant="body1" gutterBottom  style={{ color: "#80ff00" }}>
              <strong>{chat.user}:</strong> {chat.message}
            </Typography>
          ))}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <TextField
            label="Message"
            value={message}
            color="secondary"
            focused
            onChange={handleMessageChange}
            variant="outlined"
            InputProps={{
              sx: {
                color: "#80ff00",
              },
            }}
            style={{
              width: "550px",
              marginRight: "1rem",
            }}
          />
          <Button
            variant="contained"
            color="secondary"
            onClick={handleSendMessage}
            style={{
              marginTop: "1rem",
            }}
          >
            Send
          </Button>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: "250px",
            padding: "1rem",
            background: "rgba(0, 0, 0, 0.7)",
            color: "#80ff00",
            borderRadius: "10px",
          }}
        >
          <Typography variant="h6" gutterBottom>
            Connected Clients
          </Typography>
          {connectedClients.map((client, index) => (
            <Typography key={index} variant="body1" gutterBottom>
              {client}
            </Typography>
          ))}
        </Paper>
      </div>
    </div>
  );
  
}

export default ChatScreen;
