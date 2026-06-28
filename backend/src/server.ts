import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { sequelize } from "./config/db.js"; // Adjust name to match your config/db.ts exactly
import { studyRoutes } from "./routes/studyRoutes.js";

dotenv.config();

const fastify = Fastify({ logger: true, bodyLimit: 52428800 }); // 50MB limit for file uploads

// Bind necessary plugins sequentially
await fastify.register(cors, { origin: "*" });
await fastify.register(multipart);

// Mount your procedural endpoint routes under the "/api" prefix
await fastify.register(studyRoutes, { prefix: "/api" });

async function startServer() {
  try {
    // 1. Verify credentials match your local Postgres setup
    await sequelize.authenticate();
    console.log("Successfully connected to local PostgreSQL database.");

    // 2. CRITICAL: This checks your local DB and builds the tables automatically!
    await sequelize.sync({ alter: true });
    console.log("Database tables synchronized successfully.");

    // 3. Start listening for your frontend app
    const port = Number(process.env.PORT || 5000);
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log("Backend running on http://localhost:5000");
  } catch (error) {
    console.error("Error starting the backend server:", error);
  }
}

startServer();
