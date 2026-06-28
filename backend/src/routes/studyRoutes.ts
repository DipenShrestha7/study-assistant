import type { FastifyInstance } from "fastify";
import {
  uploadStudyMaterial,
  queryStudyMaterial,
  getAllDocuments,
  getMessagesForDocument,
} from "../controllers/studyController.js";

/**
 * Procedural routing engine mapping explicit entry points to business controllers.
 */
export async function studyRoutes(fastify: FastifyInstance) {
  fastify.post("/upload", uploadStudyMaterial);

  fastify.post("/query", queryStudyMaterial);

  fastify.get("/documents", getAllDocuments);

  fastify.get("/messages/:docId", getMessagesForDocument);
}
