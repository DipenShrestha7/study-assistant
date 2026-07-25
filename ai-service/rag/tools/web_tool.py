from langchain_tavily import TavilySearch

web_tool = TavilySearch(
    max_results=1,
    include_raw_content=False,
    search_depth="advanced",
    description=(
        "STRICT CONDITION: Use this tool ONLY IF the user explicitly asks you to search the web, "
        "or look up live data outside their PDF. Otherwise, stick to Document_Search."
    ),
)
