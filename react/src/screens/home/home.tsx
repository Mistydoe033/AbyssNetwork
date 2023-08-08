import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import BG from "../../assets/HBG.jpg";
import { Box } from "@mui/material";
import "./home.css";

import { SocketInstance } from "../../socket/socket";

function HomeScreen() {
  const [username, setUsername] = useState("");
  const [connectedClients, setConnectedClients] = useState([]);
  const [socketConnecting, setSocketConnecting] = useState(false);
  const navigate = useNavigate();

  const handleUsernameChange = (e: any) => {
    setUsername(e.target.value);
  };

  const handleEnterChat = () => {
    if (username.trim() !== "") {
      const aliasData = {
        type: "username",
        username: username,
      };

      // Set up the onopen handler

      SocketInstance.send(JSON.stringify(aliasData));
      navigate("/chat");

      // Show loading indicator while connecting
      setSocketConnecting(true);
    }
  };

  useEffect(() => {
    SocketInstance.setupOnOpenHandler(() => {
      // Send the username to the server after the connection is established
      // After sending the data, navigate to the chat page
    });
    // Subscribe to the "connected_clients" event from the server
    const connectedClientsCallback = (data: any) => {
      setConnectedClients(data.clients);
    };
    SocketInstance.subscribe("connected_clients", connectedClientsCallback);

    // Unsubscribe from the event when the component unmounts
    return () => {
      SocketInstance.unsubscribe("connected_clients", connectedClientsCallback);
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
        backdropFilter: "blur(5px)",
      }}
    >
      {socketConnecting ? (
        <CircularProgress
          size={100} // Adjust the size as needed
          style={{
            position: "absolute",
            zIndex: 9999, // Ensure the loading icon is on top of other elements
            color: "#80ff00",
          }}
        />
      ) : null}
      {/* Left container for header and textbox */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          textAlign: "left",
          maxWidth: 500,
          marginLeft: "-70%",
          marginTop: "-30%",
        }}
      >
        <Typography
          variant="h4"
          gutterBottom
          sx={{
            marginLeft: "-10%",
            color: "#80ff00",
          }}
        >
          Step into the Abyss.
        </Typography>
        <Typography
          variant="h5"
          gutterBottom
          sx={{
            marginLeft: "-5%",
            color: "#80ff00",
          }}
        >
          Darkness awaits.
        </Typography>

        <Box
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: "-10%",
            maxWidth: 300,
            marginTop: "5%",
          }}
        >
          <TextField
            label="Alias"
            color="secondary"
            focused
            value={username}
            onChange={handleUsernameChange}
            sx={{
              marginBottom: "1rem",
            }}
            InputProps={{
              sx: {
                color: "#80ff00",
              },
            }}
          />

          <Button
            variant="contained"
            color="secondary"
            onClick={handleEnterChat}
            style={{
              maxWidth: 300,
            }}
          >
            Enter Chat
          </Button>
        </Box>
      </div>

      {/* Right container for connected clients */}
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
          {connectedClients.map((client: any, index: any) => (
            <Typography key={index} variant="body1" gutterBottom>
              {client}
            </Typography>
          ))}
        </Paper>
      </div>
    </div>
  );
}

export default HomeScreen;
