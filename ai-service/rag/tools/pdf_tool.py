from langchain.agents import Tool


def create_pdf_tool(rewrite_query, raw_history, llm, retriever):
    def search_local_pdf(query: str) -> str:
        new_query = rewrite_query(query, raw_history, llm)
        print("Original Query:", query)
        print("Rewritten Query:", new_query)
        docs = retriever.invoke(new_query)
        return "\n\n".join([doc.page_content for doc in docs])

    return Tool(
        name="Document_Search",
        func=search_local_pdf,
        description=(
            "CRITICAL: Use this tool first for any academic questions regarding the specific uploaded course syllabus, "
            "document, textbook, or file material."
        ),
    )
