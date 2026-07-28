import axios from "axios";
import FormData from "form-data";
import { Readable } from "stream";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
console.log("AI URL:", AI_SERVICE_URL);
/**
 * Sends a raw file buffer over HTTP to the Python AI service for extraction and vector storage.
 */
export async function uploadFileToAIService(
  fileBuffer: Buffer,
  filename: string,
): Promise<{ document_id: string }> {
  const formData = new FormData();
  formData.append("file", fileBuffer, filename);

  const response = await axios.post(`${AI_SERVICE_URL}/ingest`, formData, {
    headers: formData.getHeaders(),
  });

  return response.data;
}

/**
 * Queries the Python AI service using a specific document's unique UUID and a question string.
 */
export async function queryDocumentFromAIService(
  documentId: string,
  question: string,
  history: any,
): Promise<Readable> {
  const response = await axios.post(
    `${AI_SERVICE_URL}/query`,
    {
      document_id: documentId,
      question,
      history,
    },
    { responseType: "stream" },
  ); // Set responseType to 'stream' for streaming responses

  return response.data;
}
