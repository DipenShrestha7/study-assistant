import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

// Explicit type layout for database metadata records
export interface StudyDocument {
  id: number;
  filename: string;
  createdAt: string;
}

/**
 * Procedural API client wrapping our application network targets.
 */

// 1. Fetches historical material lists from the backend
export async function fetchAllDocuments(): Promise<StudyDocument[]> {
  const response = await axios.get(`${API_BASE_URL}/documents`);
  return response.data;
}

// 2. Transmits raw local files using standard multipart Form payloads
export async function uploadStudyDocument(file: File): Promise<StudyDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

// 3. Submits user questions matching a targeted document database primary key ID
export async function queryDocumentContext(
  docId: number,
  question: string,
): Promise<string> {
  const response = await axios.post(`${API_BASE_URL}/query`, {
    docId,
    question,
  });
  return response.data.answer;
}

export async function fetchMessagesForDocument(
  docId: number,
): Promise<{ role: "user" | "assistant"; content: string }> {
  const response = await axios.get(`${API_BASE_URL}/messages/${docId}`);
  return response.data;
}
