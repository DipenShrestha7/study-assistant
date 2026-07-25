import React, { useState, useEffect, useRef } from "react";
import {
  fetchAllDocuments,
  uploadStudyDocument,
  queryDocumentContext,
  fetchMessagesForDocument,
  renameStudyDocument,
  deleteStudyDocument,
  type StudyDocument,
} from "./api/client";
import {
  Upload,
  MessageSquare,
  FileText,
  Send,
  Loader2,
  EllipsisVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

interface FileActionMenuProps {
  onClose?: () => void;
}

export default function App({ onClose = () => {} }: FileActionMenuProps) {
  // State elements mapped directly to our procedural data flows
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<{
    type: "rename" | "delete";
    doc: StudyDocument;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [_, setCurrentDocument] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const activeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeMenuContentRef = useRef<HTMLDivElement | null>(null);
  const parsedId: number | null = (() => {
    const pathMatch = window.location.pathname.match(/\/documents\/(\d+)/);
    if (pathMatch && pathMatch[1]) {
      const id = parseInt(pathMatch[1], 10);
      return isNaN(id) ? null : id;
    }
    return null;
  })();
  const handleToggleMenu = (fileId: number) => {
    setIsMenuOpen((currentMenuId) =>
      currentMenuId === fileId ? null : fileId,
    );
  };

  const closeMenu = () => {
    setIsMenuOpen(null);
    onClose();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideActiveMenu =
        activeMenuButtonRef.current?.contains(target) ||
        activeMenuContentRef.current?.contains(target);

      if (isMenuOpen !== null && !clickedInsideActiveMenu) {
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen, onClose]);

  // Synchronize component mounting with active database records
  useEffect(() => {
    fetchAllDocuments()
      .then(setDocuments)
      .catch((err) => console.error("Failed to load documents:", err));
    setSelectedDocId(parsedId);
  }, []);

  useEffect(() => {
    if (selectedDocId) {
      fetchMessagesForDocument(selectedDocId)
        .then((msgs) => {
          const formattedMsgs: ChatMessage[] = msgs.map((msg) => ({
            role: msg.role === "user" ? "user" : "ai",
            text: msg.content,
          }));
          const visibleMessages = formattedMsgs.filter((msg) => {
            // Hide tool/log messages entirely when loading saved chat history.
            if (typeof msg.text !== "string") return true;
            const trimmedText = msg.text.trim();
            if (
              trimmedText.startsWith("LOG:") ||
              trimmedText.startsWith("__LOG__:") ||
              trimmedText.includes("Context verified successfully")
            ) {
              return false;
            }
            return true;
          });
          setMessages(visibleMessages);
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

  const closeActionModal = () => {
    setActiveModal(null);
    setRenameDraft("");
    setActionError(null);
    setActionLoading(false);
  };

  const openRenameModal = (doc: StudyDocument) => {
    setActiveModal({ type: "rename", doc });
    setRenameDraft(doc.filename);
    setActionError(null);
    setActionLoading(false);
    closeMenu();
  };

  const openDeleteModal = (doc: StudyDocument) => {
    setActiveModal({ type: "delete", doc });
    setActionError(null);
    setActionLoading(false);
    closeMenu();
  };

  const handleRenameDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal?.doc || activeModal.type !== "rename") return;

    const nextName = renameDraft.trim();
    if (!nextName) {
      setActionError("Please enter a filename.");
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const updatedDoc = await renameStudyDocument(
        activeModal.doc.id,
        nextName,
      );
      setDocuments((prev) =>
        prev.map((item) => (item.id === updatedDoc.id ? updatedDoc : item)),
      );
      closeActionModal();
    } catch (err) {
      console.error("Rename failed:", err);
      setActionError("Unable to rename this document right now.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!activeModal?.doc || activeModal.type !== "delete") return;

    setActionLoading(true);
    setActionError(null);

    try {
      await deleteStudyDocument(activeModal.doc.id);
      setDocuments((prev) =>
        prev.filter((item) => item.id !== activeModal.doc.id),
      );
      if (selectedDocId === activeModal.doc.id) {
        setSelectedDocId(null);
        setMessages([]);
      }
      closeActionModal();
    } catch (err) {
      console.error("Delete failed:", err);
      setActionError("Unable to delete this document right now.");
    } finally {
      setActionLoading(false);
    }
  };

  // Form submit handler for context retrieval questions
  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedDocId) return;

    const userQueryText = question;

    // 1. Only push the user's question to the chat history array at the start.
    // DO NOT push an empty AI bubble here!
    setMessages((prev) => [...prev, { role: "user", text: userQueryText }]);

    setQuestion("");
    setLoadingAnswer(true); // Shows the "Analyzing study context..." box

    try {
      let isFirstToken = true;

      await queryDocumentContext(
        selectedDocId,
        userQueryText,
        (newChunkText) => {
          // 2. When the first real text chunk arrives:
          if (isFirstToken && newChunkText.trim() !== "") {
            setLoadingAnswer(false); // Hide the loading box instantly
            isFirstToken = false;

            // Create the AI message block containing the first token right now
            setMessages((prev) => [
              ...prev,
              { role: "ai", text: newChunkText },
            ]);
            return; // Exit out of this execution path for the first chunk
          }

          // 3. For all subsequent text chunks, append them immutably as normal
          if (!isFirstToken) {
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              if (lastIndex < 0) return prev;

              const lastMessage = prev[lastIndex];

              if (lastMessage && lastMessage.role === "ai") {
                const updatedMessages = [...prev];
                updatedMessages[lastIndex] = {
                  ...lastMessage,
                  text: lastMessage.text + newChunkText,
                };
                return updatedMessages;
              }
              return prev;
            });
          }
        },
      );
    } catch (err) {
      console.error("Query engine failed:", err);
      setLoadingAnswer(false);

      // If an error happens before any text arrives, append a clean error block
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "An error occurred while analyzing the document." },
      ]);
    } finally {
      setLoadingAnswer(false);
    }
  };

  function formatSavedMessage(content: string) {
    let formatted = content
      // Strip lines starting with LOG markers or tool indicators
      .replace(/^LOG:.*$/gm, "")
      .replace(/^__LOG__:\s*.*$/gm, "")
      .replace(/Context verified successfully/g, "")
      .replace(/<br\s*\/?/gi, "\n")
      .trim();

    const conclusionLines: string[] = [];
    formatted = formatted
      .split("\n")
      .filter((line) => {
        const match = line.match(/^\|\s*Conclusion\s*\|\s*(.*)$/i);
        if (match) {
          conclusionLines.push(match[1].trim().split("|")[0].trim());
          return false;
        }
        return true;
      })
      .join("\n")
      .trim();

    if (conclusionLines.length > 0) {
      formatted =
        `${formatted}\n\n**Conclusion:** ${conclusionLines.join(" ")}`.trim();
    }

    return formatted;
  }

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
            <div
              key={doc.id}
              onClick={() => {
                setSelectedDocId(doc.id);
                setMessages([]);
                window.history.replaceState({}, "", `/documents/${doc.id}`);
                setCurrentDocument(doc.id);
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
              <div className="relative ml-auto">
                <button
                  ref={isMenuOpen === doc.id ? activeMenuButtonRef : null}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleMenu(doc.id);
                  }}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <EllipsisVertical className="w-4 h-4" />
                </button>
                {isMenuOpen === doc.id && (
                  <div
                    ref={isMenuOpen === doc.id ? activeMenuContentRef : null}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-2 w-44 origin-top-right rounded-xl bg-[#11131e] border border-slate-800 p-1.5 shadow-2xl z-50"
                  >
                    <div className="flex flex-col gap-0.5">
                      {/* Rename Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(doc);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-[#1b1f32] hover:text-white rounded-lg transition-colors text-left group"
                      >
                        <Pencil className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
                        <span>Rename</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(doc);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 rounded-lg transition-colors text-left group"
                      >
                        <Trash2 className="w-4 h-4 text-rose-400/80 group-hover:text-rose-400 transition-colors" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                  className={`flex gap-3 w-full ${msg.role === "user" ? "max-w-3xl ml-auto flex-row-reverse" : "max-w-full"}`}
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
                    className={`w-full p-4 rounded-xl text-sm leading-relaxed shadow-sm border ${
                      msg.role === "user"
                        ? "bg-indigo-600/10 border-indigo-500/20 text-indigo-100"
                        : "bg-slate-800/80 border-slate-700/60 text-slate-200"
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      components={{
                        // 1. Heading Styles
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-2xl font-bold text-slate-100 my-4 border-b border-slate-700 pb-2"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-xl font-semibold text-slate-100 mt-6 mb-3"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-lg font-medium text-slate-200 mt-4 mb-2"
                            {...props}
                          />
                        ),
                        // 1. Table Outer Border
                        table: ({ node, ...props }) => (
                          <div className="overflow-x-auto my-4 rounded-lg border border-slate-700/60 shadow-sm">
                            <table
                              className="table-auto w-full divide-y divide-slate-700/60 text-sm text-left border-collapse"
                              {...props}
                            />
                          </div>
                        ),

                        // 2. Table Headers with right border
                        th: ({ node, ...props }) => (
                          <th
                            className="first:w-36 px-4 py-3 font-semibold bg-slate-800/80 text-slate-100 border-r border-slate-700/60 last:border-r-0"
                            {...props}
                          />
                        ),
                        tbody: ({ node, ...props }) => (
                          <tbody
                            className="divide-y divide-slate-800 bg-slate-900 text-slate-300"
                            {...props}
                          />
                        ),

                        // 3. Table Rows with horizontal division
                        tr: ({ node, ...props }) => (
                          <tr
                            className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-800/30 transition-colors"
                            {...props}
                          />
                        ),

                        // 4. Table Cells with right border
                        td: ({ node, ...props }) => (
                          <td
                            className="first:w-36 px-4 py-3 align-top text-slate-300 border-r border-slate-700/60 last:border-r-0"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {formatSavedMessage(msg.text)}
                    </ReactMarkdown>
                  </div>
                  <div ref={messagesEndRef} />
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

      {activeModal && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4"
          onClick={closeActionModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#11131e] shadow-2xl"
          >
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-3">
                {activeModal.type === "rename" ? (
                  <div className="rounded-lg bg-indigo-600/10 p-2 text-indigo-400">
                    <Pencil className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {activeModal.type === "rename"
                      ? "Rename document"
                      : "Delete document"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeModal.type === "rename"
                      ? "Update the document title shown in your library."
                      : "This action will remove the guide and its chat history."}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4">
              {activeModal.type === "rename" ? (
                <form onSubmit={handleRenameDocument} className="space-y-4">
                  <label className="block text-sm text-slate-300">
                    <span className="mb-2 block">New name</span>
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                  </label>
                  {actionError && (
                    <p className="text-sm text-rose-400">{actionError}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeActionModal}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {actionLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Delete{" "}
                    <span className="font-medium text-white">
                      {activeModal.doc.filename}
                    </span>
                    ?
                  </p>
                  {actionError && (
                    <p className="text-sm text-rose-400">{actionError}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeActionModal}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteDocument}
                      disabled={actionLoading}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                    >
                      {actionLoading ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
