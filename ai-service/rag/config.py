import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI

load_dotenv()

embeddings = OpenAIEmbeddings(
    openai_api_base="https://openrouter.ai/api/v1",
    model="openai/text-embedding-3-small",
    openai_api_key=os.getenv("OPENROUTER_API_KEY"),
)

llm = ChatOpenAI(
    openai_api_base="https://openrouter.ai/api/v1",
    model="openai/gpt-oss-120b:free",
    openai_api_key=os.getenv("OPENROUTER_API_KEY"),
    temperature=0,
    streaming=True,  # Enable streaming for immediate token delivery
)
