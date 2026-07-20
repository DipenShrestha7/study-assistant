import type { FastifyRequest, FastifyReply } from "fastify";
import {
  uploadFileToAIService,
  queryDocumentFromAIService,
} from "../services/aiService.js";
import documentModel from "../models/document.js";
import messageModel from "../models/messages.js";

/**
 * Handles incoming multipart file uploads, routes them to the AI pipeline,
 * and commits the metadata tracking ID to PostgreSQL.
 */
export async function uploadStudyMaterial(request: any, reply: FastifyReply) {
  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: "No file uploaded" });
  }

  const fileBuffer = await data.toBuffer();
  const aiResponse = await uploadFileToAIService(fileBuffer, data.filename);

  // Cast as any so TypeScript allows accessing dynamic database fields cleanly
  const doc = (await documentModel.create({
    filename: data.filename,
    externalId: aiResponse.document_id,
  })) as any;

  return reply.status(201).send(doc);
}

/**
 * Accepts a user query and document ID reference, then passes it down
 * to the local Chroma vector store context engine.
 */
export async function queryStudyMaterial(
  request: FastifyRequest<{ Body: { docId: number; question: string } }>,
  reply: FastifyReply,
) {
  if (request.method === "OPTIONS") {
    return reply
      .status(204)
      .header("Access-Control-Allow-Origin", "http://localhost:5173")
      .header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
      .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
      .send();
  }
  const { docId, question } = request.body;

  const doc = (await documentModel.findByPk(docId)) as any;
  if (!doc) {
    return reply.status(404).send({ error: "Document not found" });
  }

  const databaseHistory = await messageModel.findAll({
    where: { document_id: String(docId) },
    order: [["createdAt", "DESC"]],
    limit: 4,
  });

  const historyPayload = databaseHistory.reverse().map((msg: any) => ({
    role: msg.role,
    content: msg.content,
  }));

  try {
    // 1. Fire the AI Service wrapper BEFORE saving anything to the DB
    const aiResponseStream = await queryDocumentFromAIService(
      doc.externalId,
      question,
      historyPayload,
    );

    reply.raw.setHeader("Content-Type", "text/plain");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    reply.raw.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    reply.raw.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    reply.raw.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    let fullAssistantResponse = "";

    aiResponseStream.on("data", (chunk: Buffer) => {
      fullAssistantResponse += chunk.toString();
    });

    aiResponseStream.on("end", async () => {
      try {
        await messageModel.create({
          document_id: docId,
          role: "user",
          content: question,
        });

        await messageModel.create({
          document_id: docId,
          role: "assistant",
          content: fullAssistantResponse.trim(),
        });
      } catch (dbError) {
        request.log.error({ err: dbError }, "Failed to save response:");
      }
    });

    // Pipe the stream out to the frontend
    aiResponseStream.pipe(reply.raw);
    await reply;
  } catch (error) {
    request.log.error({ err: error }, "Streaming transaction failure:", {});

    // 4. Because nothing was written to the DB yet, your database stays perfectly clean!
    // Simply send an error status code to the frontend so your UI can display a toast notification.
    return reply
      .status(500)
      .send({ error: "AI communication channel dropped" });
  }
}

/**
 * Fetches all indexed document metadata histories to display on the user sidebar.
 */
export async function getAllDocuments(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const docs = await documentModel.findAll({ order: [["createdAt", "DESC"]] });
  return reply.send(docs);
}

/**
 * Fetches all the chats for a specific document
 */
export async function getMessagesForDocument(
  request: FastifyRequest<{ Params: { docId: string } }>,
  reply: FastifyReply,
) {
  const messages = await messageModel.findAll({
    where: { document_id: request.params.docId },
    order: [["createdAt", "ASC"]],
  });
  return reply.send(messages);
}
export async function renameStudyDocument(
  request: FastifyRequest<{ Params: { docId: string }; Body: { filename: string } }>,
  reply: FastifyReply,
) {
  const docId = Number(request.params.docId);
  const { filename } = request.body;

  if (!Number.isInteger(docId) || docId <= 0) {
    return reply.status(400).send({ error: "Invalid document id" });
  }

  if (!filename?.trim()) {
    return reply.status(400).send({ error: "Filename is required" });
  }

  const doc = await documentModel.findByPk(docId);
  if (!doc) {
    return reply.status(404).send({ error: "Document not found" });
  }

  await doc.update({ filename: filename.trim() });
  return reply.send(doc);
}

export async function deleteStudyDocument(
  request: FastifyRequest<{ Params: { docId: string } }>,
  reply: FastifyReply,
) {
  const docId = Number(request.params.docId);

  if (!Number.isInteger(docId) || docId <= 0) {
    return reply.status(400).send({ error: "Invalid document id" });
  }

  const doc = await documentModel.findByPk(docId);
  if (!doc) {
    return reply.status(404).send({ error: "Document not found" });
  }

  await messageModel.destroy({ where: { document_id: String(docId) } });
  await doc.destroy();

  return reply.status(200).send({ success: true });
}
