import os
import uvicorn
import shutil
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, AliasChoices
from dotenv import load_dotenv
from typing import List, Dict, Optional

load_dotenv()

from rag.ingest import ingest_pdf
from rag.query import create_query_response_generator

app = FastAPI(title="AI Study Assistant Vector Service")


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
        document_id = ingest_pdf(file_path)
        return {"document_id": document_id}

    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@app.post("/query")
async def handle_document_query(payload: QueryRequest):
    """
    Procedural endpoint executing context retrieval and LLM completion pipelines.
    """
    return StreamingResponse(
        create_query_response_generator(
            payload.document_id, payload.question, payload.history
        ),
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
