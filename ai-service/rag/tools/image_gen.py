# rag/tools/image_gen.py
import urllib.parse
from langchain_core.tools import tool


# @tool(return_direct=True) is ESSENTIAL. This guarantees the
# agent stops after one tool call and returns the image link directly.
@tool(return_direct=True)
def image_tool(prompt: str) -> str:
    """Use this tool ONLY when the user explicitly requests an image, diagram,
    illustration, or picture. Input MUST be a detailed visual description in English."""

    cleaned_prompt = prompt.strip().strip('"').strip("'")

    # 1. Integrate the visual grounding rules directly.
    # We force the model to use simple outline icons and lines on white.
    # This addresses the earlier issue of artistic hallucination.
    diagram_prompt = (
        f"A clean, minimal 2D vector educational diagram of {cleaned_prompt}. "
        "Flat design, only simple clean outlines for icons (like 'image_3.png'), "
        "connected by simple, solid black lines, minimal clutter, plain white background."
    )

    encoded_prompt = urllib.parse.quote(diagram_prompt)

    # We use FLUX (high-quality open model) with nologo and a fixed seed.
    image_url = (
        f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        f"?width=1024&height=1024&nologo=true&model=flux&seed=22"
    )

    # Return Markdown format so it renders directly.
    return f"\n\n![Generated Diagram]({image_url})\n\n"
