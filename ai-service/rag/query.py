import os
from typing import AsyncGenerator, Dict, List, Optional
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.tools import Tool
from langchain_openai import ChatOpenAI
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from rag.config import embeddings
from tools.web_tool import web_tool
from tools.pdf_tool import create_pdf_tool
from rag.tools.image_gen import image_tool

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "../chroma_db")


def _build_chat_history(
    history: Optional[List[Dict[str, str]]],
) -> List[Dict[str, str]]:
    return history or []


def rewrite_query(question: str, chat_history: list, llm) -> str:
    """
    Converts a follow-up question into a standalone query using chat history.
    """

    if not chat_history:
        return question  # no history → nothing to fix

    # Keep it short to save tokens (you already limit to 4 messages 👍)
    history_text = "\n".join(
        [f"{msg['role']}: {msg['content']}" for msg in chat_history]
    )

    prompt = f"""
    Given the conversation below, rewrite the user's question into a clear standalone question.
    Conversation:
    {history_text}
    Question:
    {question}
    Standalone question:
    """

    response = llm.invoke(prompt)
    return response.content.strip()


async def create_query_response_generator(
    document_id: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> AsyncGenerator[str, None]:
    llm = ChatOpenAI(
        openai_api_base="https://openrouter.ai/api/v1",
        model="nvidia/nemotron-3-ultra:free",
        openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        temperature=0.7,
        streaming=True,
        max_tokens=16384,
    )

    db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    retriever = db.as_retriever(
        search_kwargs={"filter": {"document_id": document_id}, "k": 8}
    )

    chat_history = []
    for turn in _build_chat_history(history):
        if turn["role"] == "user":
            chat_history.append(HumanMessage(content=turn["content"]))
        else:
            chat_history.append(AIMessage(content=turn["content"]))

    raw_history = _build_chat_history(history)

    pdf_tool = create_pdf_tool(
        rewrite_query=rewrite_query,
        raw_history=raw_history,
        llm=llm,
        retriever=retriever,
    )
    tools = [pdf_tool, web_tool, image_tool]

    system_prompt = """
        You are an expert, proactive study assistant. A study guide/PDF is ALREADY uploaded 
        and active in the current session. Whenever the user says 'this file', 'the document', 
        or asks you to explain the material, you MUST immediately invoke the 'Document_Search' tool 
        using relevant keywords from their query to see what content is inside.\n\n
        RESPONSE LENGTH & DEPTH INSTRUCTIONS:
            1. ADAPTIVE LENGTH: Match the scope and depth requested by the user.
            2. CONCISE BY DEFAULT: For general questions (e.g., "What is X?"), provide a clean, direct, standard-length explanation. Do not overwhelm the user with unnecessary details.
            3. DETAILED ON DEMAND: ONLY generate long, exhaustive, step-by-step explanations if the user explicitly asks for depth (e.g., using keywords like "explain in detail", "step-by-step", "elaborate", "comprehensive", "deep dive", or "explain everything").
        CRITICAL ROUTING INSTRUCTIONS:\n
            1. Do not ask the user to upload a file—one is already available via the 'Document_Search' tool.\n
            2. If 'Document_Search' returns empty or insufficient context, immediately invoke 'TavilySearch' 
            to look up web explanations for the topic so you never leave the student empty-handed.
            3. If the user asks you to search the web, you MUST use 'TavilySearch' and NOT 'Document_Search'.\n
        CRITICAL TABLE FORMATTING RULES:
            1. ALWAYS format tables using standard GitHub Flavored Markdown (GFM) pipe syntax.
            2. NEVER output raw text blocks or whitespace-aligned columns for structured data.
            3. NEVER use HTML tags like <br>, <table>, <tr>, or <td> inside table cells.
            4. When comparing items or displaying structured data, follow this general format:

            | Category / Feature | Item A | Item B |
            | --- | --- | --- |
            | Description | First detail for Item A | First detail for Item B |
            | Usage | Second detail for Item A | Second detail for Item B |
        STRICT NEGATIVE CONSTRAINTS (DO NOT VIOLATE):
            - NEVER use HTML tags like <br>, <br/>, <table>, <tr>, <td>, or <div>. 
            - NEVER use space-aligned or plain-text mock tables. ALWAYS use pipe syntax (`|`).
            - Do NOT put raw HTML line breaks inside table cells. If a list is needed inside a cell, keep it concise or use separate table rows.
        CRITICAL OUTPUT RULES:
            1. DO NOT include internal system status, tool logs, or phrases like "LOG:", "Using Document_Search...", or "Context verified" in your final response.
            2. Output ONLY the response meant for the user.

        HEADER RULES:
            1. ALWAYS format main section titles using Markdown heading syntax (`##` or `###`).
            2. NEVER output section titles or topic headings as plain bold text or unformatted sentences.
            3. Keep heading hierarchies structured:
            - Use `##` for primary topic titles or major sections (e.g., ## Overview, ## Comparison).
            - Use `###` for sub-sections or detailed breakdowns (e.g., ### Key Takeaways, ### Summary).
        """

    agent_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ]
    )

    agent = create_tool_calling_agent(llm, tools, agent_prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    async for event in agent_executor.astream_events(
        {"input": question, "chat_history": chat_history}, version="v2"
    ):
        kind = event["event"]

        if kind == "on_tool_start":
            yield f"__LOG__: Using {event['name']} to find facts...\n"
        elif kind == "on_tool_end":
            yield f"__LOG__: Context verified successfully.\n"
        elif kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                yield content
