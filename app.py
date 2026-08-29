from flask import Flask, jsonify, request, send_from_directory
import threading
import webbrowser

from api import check_ollama, get_installed_models, get_response, generate_chat_title
from backend.database import (
    initialize_database,
    create_chat,
    get_chats,
    get_chat,
    get_messages,
    save_message,
    update_chat_title,
    delete_chat,
)

app = Flask(__name__, static_folder="ui", static_url_path="")

initialize_database()


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.route("/")
def index():
    return send_from_directory("ui", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("ui", path)


@app.get("/api/status")
def status():
    return jsonify({
        "success": True,
        "ollama": check_ollama(),
        "models": get_installed_models(),
    })


@app.get("/api/chats")
def chats():
    return jsonify({"success": True, "chats": get_chats()})


@app.post("/api/chats")
def new_chat():
    chat_id = create_chat("New Conversation")
    return jsonify({"success": True, "id": chat_id, "title": "New Conversation"})


@app.get("/api/chats/<int:chat_id>/messages")
def chat_messages(chat_id):
    if not get_chat(chat_id):
        return jsonify({"success": False, "error": "Chat not found."}), 404
    return jsonify({"success": True, "messages": get_messages(chat_id)})


@app.delete("/api/chats/<int:chat_id>")
def remove_chat(chat_id):
    if not get_chat(chat_id):
        return jsonify({"success": False, "error": "Chat not found."}), 404
    delete_chat(chat_id)
    return jsonify({"success": True})


@app.post("/api/chat")
def chat():
    try:
        data = request.get_json(silent=True) or {}
        message = str(data.get("message", "")).strip()
        chat_id = data.get("chat_id")

        if not message:
            return jsonify({"success": False, "error": "Message cannot be empty."}), 400

        # A new conversation is created atomically with its first message.
        if chat_id in (None, "", 0, "null"):
            chat_id = create_chat("New Conversation")
        else:
            try:
                chat_id = int(chat_id)
            except (TypeError, ValueError):
                return jsonify({"success": False, "error": "Invalid chat ID."}), 400

            if not get_chat(chat_id):
                return jsonify({"success": False, "error": "Chat not found."}), 404

        previous_messages = get_messages(chat_id)
        history = [
            {"role": item["role"], "content": item["content"]}
            for item in previous_messages
            if item["role"] in {"user", "assistant"}
        ]

        result = get_response(message, history)
        if not result.get("success"):
            # If the AI failed on a newly created empty chat, remove it so the
            # sidebar does not accumulate broken conversations.
            if not previous_messages:
                delete_chat(chat_id)
            return jsonify(result), 503

        save_message(chat_id, "user", message)
        answer = result["response"]
        save_message(chat_id, "assistant", answer)

        conversation = [
            {"role": item["role"], "content": item["content"]}
            for item in get_messages(chat_id)
        ]

        title = generate_chat_title(conversation)
        update_chat_title(chat_id, title)

        return jsonify({
            "success": True,
            "chat_id": chat_id,
            "message": answer,
            "response": answer,
            "title": title,
            "model": result.get("model"),
        })

    except Exception as error:
        app.logger.exception("Chat request failed")
        return jsonify({"success": False, "error": str(error)}), 500


def open_browser():
    webbrowser.open("http://127.0.0.1:5000")


if __name__ == "__main__":
    print("=" * 55)
    print("JENIMI AI")
    print("=" * 55)
    print("Frontend : http://127.0.0.1:5000")
    print("AI       : Ollama")

    if check_ollama():
        print("Ollama   : connected")
        models = get_installed_models()
        print("Models   :", ", ".join(models) if models else "none")
    else:
        print("Ollama   : not running")

    threading.Timer(1.0, open_browser).start()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        use_reloader=False,
    )
