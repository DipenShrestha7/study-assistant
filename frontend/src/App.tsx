import React, { useState, useEffect } from "react";
import {
  fetchAllDocuments,
  uploadStudyDocument,
  queryDocumentContext,
  fetchMessagesForDocument,
  type StudyDocument,
} from "./api/client";
import { Upload, MessageSquare, FileText, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

export default function App() {
  // State elements mapped directly to our procedural data flows
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  // Synchronize component mounting with active database records
  useEffect(() => {
    fetchAllDocuments()
      .then(setDocuments)
      .catch((err) => console.error("Failed to load documents:", err));
  }, []);

  useEffect(() => {
    if (selectedDocId) {
      fetchMessagesForDocument(selectedDocId)
        .then((msgs) => {
          const formattedMsgs: ChatMessage[] = msgs.map((msg) => ({
            role: msg.role === "user" ? "user" : "ai",
            text: msg.content,
          }));
          setMessages(formattedMsgs);
        })
        .catch((err) => console.error("Failed to load messages:", err));
    }
  }, [selectedDocId]);

  // Form submit handler for new file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    setUploading(true);
    try {
      const newDoc = await uploadStudyDocument(e.target.files[0]);
      setDocuments((prev) => [newDoc, ...prev]);
      setSelectedDocId(newDoc.id);
      setMessages([]); // Wipe history clean for the new document stream
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  // Form submit handler for context retrieval questions
  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedDocId) return;

    const userQueryText = question;
    setMessages((prev) => [...prev, { role: "user", text: userQueryText }]);
    setQuestion("");
    setLoadingAnswer(true);

    try {
      const aiResponseText = await queryDocumentContext(
        selectedDocId,
        userQueryText,
      );
      setMessages((prev) => [...prev, { role: "ai", text: aiResponseText }]);
    } catch (err) {
      console.error("Query engine failed:", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "An error occurred while analyzing the document." },
      ]);
    } finally {
      setLoadingAnswer(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans antialiased">
      {/* Sidebar: Document Management Panels */}
      <aside className="w-80 bg-slate-950 border-r border-slate-800 p-4 flex flex-col gap-4">
        <label className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg cursor-pointer transition select-none shadow-md">
          {uploading ? (
            <Loader2 className="animate-spin h-5 w-5" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          {uploading ? "Processing PDF..." : "Upload Study Material"}
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            Uploaded Guides
          </h3>
          {documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => {
                setSelectedDocId(doc.id);
                setMessages([]);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition group border ${
                selectedDocId === doc.id
                  ? "bg-indigo-600/10 border-indigo-500 text-white font-medium"
                  : "bg-transparent border-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText
                className={`h-4 w-4 shrink-0 ${selectedDocId === doc.id ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400"}`}
              />
              <span className="truncate">{doc.filename}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Container: Chat Experience */}
      <main className="flex-1 flex flex-col bg-slate-900">
        {selectedDocId ? (
          <>
            {/* Scrollable Message Box */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 max-w-3xl ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"}`}
                  >
                    {msg.role === "user" ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`p-4 rounded-xl text-sm leading-relaxed shadow-sm border ${
                      msg.role === "user"
                        ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-100"
                        : "bg-slate-800/80 border-slate-700/60 text-slate-200"
                    }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}

              {/* Dynamic Answer Generation Loading Indicator */}
              {loadingAnswer && (
                <div className="flex gap-3 max-w-3xl">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-emerald-600 text-white shadow-sm">
                    <Loader2 className="animate-spin h-4 w-4" />
                  </div>
                  <div className="p-4 bg-slate-800/80 border border-slate-700/60 rounded-xl text-sm text-slate-400 italic">
                    Analyzing study context and generating reference answer...
                  </div>
                </div>
              )}
            </div>

            {/* Form Input Message bar */}
            <form
              onSubmit={handleSendQuestion}
              className="p-4 border-t border-slate-800 bg-slate-950 flex gap-2 shadow-xl"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything about the document..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 transition"
                disabled={loadingAnswer}
              />
              <button
                type="submit"
                disabled={loadingAnswer || !question.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white p-2.5 rounded-lg transition shadow-md shrink-0 flex items-center justify-center"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </>
        ) : (
          /* Landing/Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 select-none">
            <div className="h-16 w-16 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center text-slate-400 shadow-md">
              <FileText className="h-8 w-8 stroke-[1.5]" />
            </div>
            <div className="text-center">
              <p className="font-medium text-slate-400 text-sm">
                No study guide selected
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Upload a PDF or select an existing element in the sidebar to
                begin RAG execution.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
