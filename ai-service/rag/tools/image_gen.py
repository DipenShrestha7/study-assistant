import urllib.parse
from langchain_core.tools import Tool


def generate_image_func(prompt: str) -> str:
    """
    Encodes the prompt into a Pollinations image URL and returns
    Markdown image syntax so frontends render it automatically.
    """
    # Clean the input prompt
    cleaned_prompt = prompt.strip().strip('"').strip("'")
    encoded_prompt = urllib.parse.quote(cleaned_prompt)

    # Construct the rendering URL
    image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&model=flux"

    # Return markdown image string
    return f"\n\n![Generated Illustration]({image_url})\n\n"


image_tool = Tool(
    name="Image_Generator",
    func=generate_image_func,
    description=(
        "Use this tool ONLY when the user explicitly requests an image, diagram, "
        "illustration, or picture. Input must be a detailed description of the image in English."
    ),
)
