import os
import uuid
import re
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from rag.config import embeddings

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "../chroma_db")


def clean_text(text: str) -> str:
    text = re.sub(r"\n+", "\n", text)  # multiple newlines → one
    text = re.sub(r"\s+", " ", text)  # multiple spaces → one
    text = re.sub(r"-\n", "", text)  # fix hyphen line breaks
    text = re.sub(r"\n(?=[a-z])", " ", text)  # join broken sentences
    return text.strip()


def ingest_pdf(file_path: str) -> str:
    document_id = str(uuid.uuid4())

    loader = PyPDFLoader(file_path)
    pages = loader.load()

    # 🔹 Clean text
    for page in pages:
        page.page_content = clean_text(page.page_content.replace("\n", " "))

    # 🔹 Better chunking
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=150, separators=["\n\n", "\n", ".", " ", ""]
    )

    chunks = text_splitter.split_documents(pages)

    # 🔹 Add rich metadata
    for i, chunk in enumerate(chunks):
        chunk.metadata.update(
            {
                "document_id": document_id,
                "chunk_id": i,
                "source": file_path,
                "page": chunk.metadata.get("page", None),
            }
        )

    vectordb = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)

    vectordb.add_documents(chunks)

    return document_id
