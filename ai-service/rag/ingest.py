import os
import uuid
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from rag.config import embeddings

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "../chroma_db")


def ingest_pdf(file_path: str) -> str:
    """
    Ingests a PDF into the local Chroma vector store and returns the document ID.
    """
    document_id = str(uuid.uuid4())

    loader = PyPDFLoader(file_path)
    pages = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = text_splitter.split_documents(pages)

    for chunk in chunks:
        chunk.metadata["document_id"] = document_id

    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_DIR,
    )

    return document_id
