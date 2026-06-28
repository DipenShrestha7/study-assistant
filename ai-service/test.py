import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

load_dotenv()

def run_terminal_bot():
    print("Initializing connection to OpenRouter...")

    llm = ChatOpenAI(
        openai_api_base="https://openrouter.ai/api/v1",
        model="openai/gpt-oss-120b:free",
        openai_api_key=os.getenv("AI_API_KEY"),
        temperature=0.7,
    )
    
    print("\n🤖 Bot Ready! Type 'exit' or 'quit' to stop the session.\n")
    
    while True:
        user_query = input("You: ")
        
        if user_query.lower() in ["exit", "quit"]:
            print("Goodbye!")
            break
            
        if not user_query.strip():
            continue   
        try:
            print("Thinking...")
            response = llm.invoke([HumanMessage(content=user_query)])
            print(f"\nBot: {response.content}\n" + "-"*40)
            
        except Exception as e:
            print(f"\n❌ Error occurred: {e}\n")

if __name__ == "__main__":
    run_terminal_bot()