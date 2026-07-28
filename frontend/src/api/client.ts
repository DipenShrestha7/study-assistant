import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface StudyDocument {
  id: number;
  filename: string;
  createdAt: string;
}

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
  onTokenReceived: (token: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ docId, question }),
  });

  if (!response.ok) {
    throw new Error(`Server connection error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");

  if (!reader) {
    throw new Error("ReadableStream not supported on this response channel.");
  }

  // 1. Maintain a persistent data stream buffer
  let assemblyBuffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // 2. Add raw data to our assembly stream
    assemblyBuffer += decoder.decode(value, { stream: true });

    // 3. Break the string down whenever a newline occurs
    let lines = assemblyBuffer.split("\n");

    // 4. Leave the last incomplete line fragment in the buffer for the next chunk
    assemblyBuffer = lines.pop() || "";

    // 5. Evaluate every complete line built so far
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const trimmedLine = currentLine.trim();

      // Skip the line entirely if it is an internal log statement
      if (
        trimmedLine.startsWith("LOG:") ||
        trimmedLine.startsWith("__LOG__:") ||
        trimmedLine.includes("Context verified successfully")
      ) {
        console.log("Filtered System Log:", trimmedLine); // Stays in dev tools console
        continue;
      }

      // 6. Send the clean line string down to React, appending the newline back
      // so your paragraph styling remains intact.
      onTokenReceived(currentLine + "\n");
    }
  }

  // 7. Flush any remaining text segment sitting in the buffer after stream closure
  if (assemblyBuffer) {
    const finalTrim = assemblyBuffer.trim();
    if (
      !finalTrim.startsWith("LOG:") &&
      !finalTrim.startsWith("__LOG__:") &&
      !finalTrim.includes("Context verified successfully")
    ) {
      onTokenReceived(assemblyBuffer);
    }
  }
}

export async function fetchMessagesForDocument(
  docId: number,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const response = await axios.get(`${API_BASE_URL}/messages/${docId}`);
  return response.data;
}

export async function renameStudyDocument(
  docId: number,
  filename: string,
): Promise<StudyDocument> {
  const response = await axios.patch(
    `${API_BASE_URL}/documents/${docId}/rename`,
    {
      filename,
    },
  );
  return response.data;
}

export async function deleteStudyDocument(docId: number): Promise<void> {
  await axios.delete(`${API_BASE_URL}/documents/${docId}`);
}
