import os
import shutil
import uuid
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel, Field, AliasChoices
from dotenv import load_dotenv
from typing import List, Dict, Optional

load_dotenv()

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_tavily import TavilySearch
from langchain_core.tools import Tool

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent

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
        model="openai/gpt-4o-mini",  # Note: ensure your model explicitly supports OpenAI Tool Calling
        openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        temperature=0.7,
    )
    
    db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    retriever = db.as_retriever(
        search_kwargs={"filter": {"document_id": payload.document_id}, "k": 3}
    )

    def search_local_pdf(query: str) -> str:
        docs = retriever.invoke(query)
        return "\n\n".join([doc.page_content for doc in docs])
    
    pdf_tool = Tool(
        name="Document_Search",
        func=search_local_pdf,
        description="CRITICAL: Use this tool first for any academic questions regarding the specific uploaded course syllabus, document, textbook, or file material."
    )

    web_tool = TavilySearch(max_results=2)
    tools = [pdf_tool, web_tool]

    system_prompt = (
        "You are an expert, proactive study assistant. A study guide/PDF is ALREADY uploaded "
        "and active in the current session. Whenever the user says 'this file', 'the document', "
        "or asks you to explain the material, you MUST immediately invoke the 'Document_Search' tool "
        "using relevant keywords from their query to see what content is inside.\n\n"
        
        "CRITICAL ROUTING INSTRUCTIONS:\n"
        "1. Do not ask the user to upload a file—one is already available via the 'Document_Search' tool.\n"
        "2. If 'Document_Search' returns empty or insufficient context, immediately invoke 'TavilySearch' "
        "   to look up web explanations for the topic so you never leave the student empty-handed."
    )
    
    agent_prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"), 
    ])

    agent = create_tool_calling_agent(llm, tools, agent_prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    
    chat_history = []
    for turn in payload.history:
        if turn["role"] == "user":
            chat_history.append(HumanMessage(content=turn["content"]))
        else:
            chat_history.append(AIMessage(content=turn["content"]))

    response = agent_executor.invoke({
        "input": payload.question,
        "chat_history": chat_history
    })
    
    return {"answer": response["output"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)