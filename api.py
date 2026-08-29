import requests

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
OLLAMA_CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"

PREFERRED_MODELS = [
    "llama3.2:3b",
    "llama3.2",
    "llama3.1:8b",
    "llama3.1",
    "llama3",
    "qwen2.5:3b",
    "qwen2.5",
    "gemma3:4b",
    "gemma3",
    "mistral",
]


def get_installed_models():
    try:
        response = requests.get(OLLAMA_TAGS_URL, timeout=5)
        response.raise_for_status()
        data = response.json()
        return [
            item.get("name")
            for item in data.get("models", [])
            if item.get("name")
        ]
    except (requests.RequestException, ValueError):
        return []


def check_ollama():
    try:
        response = requests.get(OLLAMA_TAGS_URL, timeout=5)
        return response.status_code == 200
    except requests.RequestException:
        return False


def choose_model():
    models = get_installed_models()
    if not models:
        return None

    lookup = {model.lower(): model for model in models}
    for preferred in PREFERRED_MODELS:
        if preferred.lower() in lookup:
            return lookup[preferred.lower()]

    return models[0]


def _clean_history(history):
    cleaned = []
    if not isinstance(history, list):
        return cleaned

    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            cleaned.append({"role": role, "content": content})

    return cleaned


def _ollama(messages, model=None, timeout=300):
    selected_model = model or choose_model()
    if not selected_model:
        return {
            "success": False,
            "error": "Ollama is running, but no model is installed.",
        }

    try:
        response = requests.post(
            OLLAMA_CHAT_URL,
            json={
                "model": selected_model,
                "messages": messages,
                "stream": False,
                "keep_alive": "10m",
            },
            timeout=timeout,
        )

        if response.status_code != 200:
            return {
                "success": False,
                "error": (
                    f"Ollama returned HTTP {response.status_code}: "
                    f"{response.text}"
                ),
            }

        data = response.json()
        content = str(data.get("message", {}).get("content", "")).strip()
        if not content:
            return {"success": False, "error": "Ollama returned an empty response."}

        return {"success": True, "content": content, "model": selected_model}

    except requests.Timeout:
        return {"success": False, "error": "The AI took too long to respond."}
    except requests.RequestException as error:
        return {"success": False, "error": f"Could not connect to Ollama: {error}"}
    except ValueError:
        return {"success": False, "error": "Ollama returned invalid JSON."}


def get_response(message, history=None):
    if not check_ollama():
        return {
            "success": False,
            "error": "Ollama is not running. Start Ollama and try again.",
        }

    messages = [
        {
            "role": "system",
            "content": (
                "You are Jenimi, a helpful, intelligent and professional AI assistant. "
                "Give clear, useful answers. Be concise when the task is simple and detailed "
                "when the task requires it. Format responses cleanly using Markdown: use short "
                "headings when helpful, bullet or numbered lists for multiple points, blank lines "
                "between sections, bold for important terms, and fenced code blocks for code. "
                "Do not write one huge wall of text. Keep explanations easy to scan."
            ),
        }
    ]
    messages.extend(_clean_history(history))
    messages.append({"role": "user", "content": message})

    result = _ollama(messages)
    if not result["success"]:
        return result

    return {
        "success": True,
        "response": result["content"],
        "model": result["model"],
    }


def quick_chat_title(message):
    """Create an immediate short sidebar title without a second Ollama request."""
    text = " ".join(str(message or "").split()).strip()
    if not text:
        return "New Conversation"

    replacements = [
        ("how do i ", "How to "),
        ("how can i ", "How to "),
        ("can you help me ", "Help with "),
        ("please help me ", "Help with "),
        ("explain ", "Explain "),
        ("write ", "Writing "),
        ("create ", "Create "),
        ("build ", "Build "),
        ("fix ", "Fix "),
        ("make ", "Make "),
    ]

    lower = text.lower()
    title = None
    for prefix, replacement in replacements:
        if lower.startswith(prefix):
            remainder = text[len(prefix):].strip(" .?!:")
            title = replacement + remainder
            break

    if title is None:
        title = text

    words = title.split()
    if len(words) > 6:
        title = " ".join(words[:6])

    if len(title) > 48:
        title = title[:48].rsplit(" ", 1)[0]

    return title or "New Conversation"


def generate_chat_title(conversation):
    """Generate a short title from the actual conversation, not a copied prompt."""
    if not conversation:
        return "New Conversation"

    model = choose_model()
    if not model:
        return "New Conversation"

    transcript_parts = []
    for item in conversation:
        role = item.get("role")
        content = str(item.get("content", "")).strip()
        if content and role in {"user", "assistant"}:
            transcript_parts.append(f"{role.title()}: {content}")

    transcript = "\n\n".join(transcript_parts)[-10000:]

    prompt = (
        "Create a short sidebar title for this conversation.\n\n"
        "Rules:\n"
        "- Understand the overall topic and task from the conversation.\n"
        "- Do not copy the user's prompt verbatim.\n"
        "- Do not make it a question.\n"
        "- Do not use quotes.\n"
        "- Do not include 'Title:' or any prefix.\n"
        "- Use 2 to 6 words.\n"
        "- Make it specific and natural.\n\n"
        f"Conversation:\n{transcript}"
    )

    result = _ollama(
        [
            {
                "role": "system",
                "content": "You create concise, professional conversation titles.",
            },
            {"role": "user", "content": prompt},
        ],
        model=model,
        timeout=60,
    )

    if not result["success"]:
        return "New Conversation"

    title = result["content"].strip()
    title = title.replace("\n", " ").replace('"', "").replace("'", "")
    if title.lower().startswith("title:"):
        title = title[6:].strip()

    title = " ".join(title.split())
    if len(title) > 60:
        title = title[:60].rsplit(" ", 1)[0]

    return title or "New Conversation"
