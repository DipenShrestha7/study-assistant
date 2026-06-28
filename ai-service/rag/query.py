import os
from langchain_community.vectorstores import Chroma
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from config import embeddings, llm

# Map to the same Chroma database storage path
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "../chroma_db")

def query_vector_db_context(document_id: str, question: str) -> str:
    """
    Retrieves matching document chunks from Chroma based on structural metadata 
    filtering and uses them as an anchor context to answer the user's prompt.
    """
    # Mount the local vector store instance
    db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    
    # Configure the retriever to isolate chunks tied directly to this specific file
    retriever = db.as_retriever(
        search_kwargs={"filter": {"document_id": document_id}, "k": 4}
    )
    
    # Establish our expert baseline instructional system template
    system_prompt = (
        "You are an expert study assistant. Use the following pieces of retrieved context "
        "to answer the question. If you don't know the answer, say that you don't know.\n\n"
        "{context}"
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
    ])
    
    # Assemble the sequential document-stuffing execution layer
    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    rag_chain = create_retrieval_chain(retriever, question_answer_chain)
    
    # Run the pipeline and return the generated raw text answer string
    response = rag_chain.invoke({"input": question})
    return response["answer"]