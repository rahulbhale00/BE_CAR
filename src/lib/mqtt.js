import mqtt from "mqtt";

let client = null;

export const connectMQTT = () => {
  if (client) return client;

  console.log("Connecting to MQTT...");

  client = mqtt.connect("ws://10.105.184.200:9001", {
    protocol: "ws",
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    clientId: "nextjs_" + Math.random().toString(16).substr(2, 8),
  });

  client.on("connect", () => {
    console.log("MQTT Connected!");
  });

  client.on("error", (err) => {
    console.log("MQTT Error:", err.message);
    client = null; // reset so reconnect works
  });

  client.on("close", () => {
    console.log("MQTT connection closed");
  });

  client.on("offline", () => {
    console.log("MQTT offline");
  });

  return client;
};

export const sendCommand = (cmd) => {
  if (client && client.connected) {
    client.publish("robot/control", cmd);
    console.log("Sent:", cmd);
  } else {
    console.log("MQTT not connected — attempting reconnect");
    client = null;
    connectMQTT();
  }
};