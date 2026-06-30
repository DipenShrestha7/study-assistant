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

  const aiResponse = await queryDocumentFromAIService(
    doc.externalId,
    question,
    historyPayload,
  );

  await messageModel.create({
    document_id: docId,
    role: "user",
    content: question,
  });

  await messageModel.create({
    document_id: docId,
    role: "assistant",
    content: aiResponse.answer,
  });
  return reply.send({ answer: aiResponse.answer });
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
