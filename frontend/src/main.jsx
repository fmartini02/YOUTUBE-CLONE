import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { rilevaCodec } from "./api";
import "./App.css";

// Una volta per dispositivo: quali codec video decodifica bene (vedi
// api/codecDevice.js). Non si aspetta: dura pochi millisecondi, e un video
// aperto prima della fine parte comunque col codec scelto dal server.
rilevaCodec();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
