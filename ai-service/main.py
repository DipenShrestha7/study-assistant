import os
import shutil
import uuid
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel, Field, AliasChoices
from dotenv import load_dotenv
from typing import List, Dict, Optional

# 1. Force environment variables to load BEFORE anything else compiles
load_dotenv()

# 2. Safely import LangChain components
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_chroma import Chroma
from langchain_classic.chains import create_retrieval_chain, create_history_aware_retriever
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

app = FastAPI(title="AI Study Assistant Vector Service")
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

embeddings = OpenAIEmbeddings(
    openai_api_base="https://openrouter.ai/api/v1", 
    model="openai/text-embedding-3-small", 
    openai_api_key=os.getenv("OPENROUTER_API_KEY")
)

class QueryRequest(BaseModel):
    document_id: str
    question: str
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("history", "chat_history"),
    )

@app.post("/ingest")
async def handle_file_ingestion(file: UploadFile = File(...)):
    """
    Procedural endpoint that handles the PDF parsing, text splitting, 
    and vector database storage sequence directly.
    """
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        document_id = str(uuid.uuid4())
        
        loader = PyPDFLoader(file_path)
        pages = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_documents(pages)
        
        for chunk in chunks:
            chunk.metadata["document_id"] = document_id

        # Uses the globally fixed OpenRouter configuration
        Chroma.from_documents(
            documents=chunks, 
            embedding=embeddings, 
            persist_directory=CHROMA_DIR
        )
        return {"document_id": document_id}
        
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/query")
async def handle_document_query(payload: QueryRequest):
    """
    Procedural endpoint executing context retrieval and LLM completion pipelines.
    """
    llm = ChatOpenAI(
        openai_api_base="https://openrouter.ai/api/v1",
        model="openai/gpt-oss-120b:free",
        openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        temperature=0.7,
    )
    
    # Uses the exact same shared embedding engine instance
    db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    retriever = db.as_retriever(
        search_kwargs={"filter": {"document_id": payload.document_id}, "k": 4}
    )
    
    chat_history = []
    for turn in payload.history:
        if turn["role"] == "user":
            chat_history.append(HumanMessage(content=turn["content"]))
        else:
            chat_history.append(AIMessage(content=turn["content"]))

    # 2. Contextualize Chain: Rewrites lazy prompts ("explain it more") into a clean search query
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question which might reference context in the chat history, "
        "formulate a standalone question which can be understood without the chat history. "
        "Do NOT answer the question, just reformulate it if needed and otherwise return it as is."
    )
    
    contextualize_q_prompt = ChatPromptTemplate.from_messages([
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    
    # Wraps your existing retriever to look at the history before querying Chroma
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )

    system_prompt = (
        "You are an expert study assistant. Use the following pieces of retrieved context "
        "to answer the question. If you don't know the answer, say that you don't know.\n\n"
        "{context}"
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder("chat_history"), # Injects history into final answer generation context
        ("human", "{input}"),
    ])
    
    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
    
    response = rag_chain.invoke({"input": payload.question,"chat_history": chat_history})
    return {"answer": response["answer"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)