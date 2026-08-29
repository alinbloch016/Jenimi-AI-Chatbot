# Jenimi AI Chatbot

Jenimi is a local AI chatbot application built with **Python, Flask, SQLite, HTML, CSS, JavaScript, and Ollama**. The project is designed to keep conversation data on the local device while using a locally running Ollama model for AI responses.

## Project Structure

```text
AI_Chatbot/
├── app.py
├── api.py
├── requirements.txt
│
├── backend/
│   ├── __init__.py
│   └── database.py
│
└── ui/
    ├── index.html
    ├── script.js
    └── style.css
```

## Main Technologies

- **Python** — application/backend logic
- **Flask** — local web server and HTTP API
- **SQLite** — local conversation storage
- **Ollama** — local AI model runtime
- **Requests** — communication between Python and Ollama
- **HTML/CSS/JavaScript** — frontend interface

## How the Application Works

The application uses this basic flow:

```text
Browser UI
    ↓
Flask application
    ↓
Python API layer
    ↓
Ollama running locally
    ↓
Selected local AI model
    ↓
AI response
    ↓
SQLite conversation storage
    ↓
Browser UI
```

The Flask application serves the frontend from the `ui/` directory and exposes API endpoints for chats and messages.

## Requirements

The project requires:

- Python 3.x
- Ollama installed and running
- At least one Ollama model installed

Python dependencies are listed in `requirements.txt`:

```text
Flask>=3.0,<4
requests>=2.31,<3
```

## Installation

### 1. Install Python dependencies

Open a terminal in the project directory:

```bash
pip install -r requirements.txt
```

### 2. Install and start Ollama

Install Ollama separately and make sure it is running.

Check installed models with:

```bash
ollama list
```

If no model is installed, install one supported by your machine. For example:

```bash
ollama pull llama3.2:3b
```

The project does not hard-code only one model. `api.py` checks the models available from Ollama and chooses from its preferred model list, falling back to the first installed model if none of the preferred names are present.

## Running Jenimi

Run:

```bash
python app.py
```

The application starts a Flask server at:

```text
http://127.0.0.1:5000
```

`app.py` also opens that address in the default web browser automatically.

Do **not** open `ui/index.html` directly as a `file://` page. The frontend is intended to be served by Flask.

## Ollama Configuration

The Ollama API is configured in `api.py`:

```python
OLLAMA_BASE_URL = "http://127.0.0.1:11434"
```

The application uses:

```text
http://127.0.0.1:11434/api/tags
```

to discover installed models and:

```text
http://127.0.0.1:11434/api/chat
```

to generate responses.

The preferred model order currently includes:

```text
llama3.2:3b
llama3.2
llama3.1:8b
llama3.1
llama3
qwen2.5:3b
qwen2.5
gemma3:4b
gemma3
mistral
```

If none of those exact names are installed, the first model returned by Ollama is selected.

## Chat and Message Storage

Conversation data is stored locally using SQLite.

The database location is:

```text
~/.ai_assistant/ai_assistant.db
```

The database is created automatically when the application starts.

### Database tables

#### `chats`

Stores:

- chat ID
- chat title
- creation time
- last update time

#### `messages`

Stores:

- message ID
- chat ID
- role
- message content
- creation time

The supported message roles are:

```text
user
assistant
```

Deleting a chat also deletes its messages through the application's delete operation.

## Creating a Conversation

A new chat initially receives:

```text
New Conversation
```

When the first message is sent, the backend creates the chat if necessary, generates the AI response, saves the user and assistant messages, and then generates a short sidebar title from the conversation.

The title-generation rules ask the model to:

- understand the overall topic
- avoid copying the user's prompt verbatim
- avoid making the title a question
- avoid quotes
- use 2–6 words
- make the title specific and natural

There is also a `quick_chat_title()` helper in `api.py`, but the current `/api/chat` route uses `generate_chat_title()` after the conversation response has been generated.

## AI Response Formatting

The system prompt sent to Ollama asks Jenimi to provide clean Markdown formatting.

It specifically encourages:

- short headings when useful
- bullet lists
- numbered lists
- blank lines between sections
- bold important terms
- fenced code blocks
- avoiding a single large wall of text

The frontend contains a lightweight Markdown renderer in `ui/script.js`. It supports:

- headings (`#`, `##`, `###`)
- unordered lists
- ordered lists
- bold
- italic
- inline code
- fenced code blocks
- horizontal rules
- blockquotes

User messages are inserted as text rather than interpreted as HTML.

## Frontend

The frontend is contained in:

```text
ui/index.html
ui/style.css
ui/script.js
```

### `index.html`

Defines the main application layout:

- Jenimi branding
- collapsible sidebar
- New Chat button
- Recent Chats list
- welcome screen
- conversation area
- message composer
- Send button
- composer notice

### `style.css`

Contains the visual design for:

- dark theme
- sidebar
- recent chats
- buttons
- welcome screen
- message bubbles/content
- Markdown output
- composer
- responsive behavior
- sidebar collapsed state
- scrollbar styling

### `script.js`

Handles:

- API requests
- loading recent chats
- opening conversations
- creating new conversations
- sending messages
- displaying assistant responses
- Markdown rendering
- deleting conversations
- sidebar toggling
- message scrolling
- loading/processing state

## Flask API Endpoints

### Check Ollama status

```http
GET /api/status
```

Returns Ollama connection status and detected models.

### Get chats

```http
GET /api/chats
```

Returns recent conversations.

### Create a chat

```http
POST /api/chats
```

Creates a conversation titled `New Conversation`.

### Get chat messages

```http
GET /api/chats/<chat_id>/messages
```

Returns messages for a specific conversation.

### Delete a chat

```http
DELETE /api/chats/<chat_id>
```

Deletes the selected conversation.

### Send a message

```http
POST /api/chat
```

Example request:

```json
{
  "chat_id": 1,
  "message": "Explain how Python lists work."
}
```

For a new conversation, `chat_id` can be omitted or sent as an empty/null value.

The endpoint:

1. validates the message
2. creates a new chat when necessary
3. loads previous conversation messages
4. sends the conversation to Ollama
5. saves the user message
6. saves the assistant response
7. generates a conversation title
8. returns the response and title

## Important Implementation Details

### Ollama responses are currently non-streaming

`api.py` sends:

```json
"stream": false
```

to Ollama.

This means the Flask endpoint waits for the complete model response before returning it to the browser. The current implementation therefore does **not** provide token-by-token streaming.

### Model loading

The Ollama request uses:

```json
"keep_alive": "10m"
```

which asks Ollama to keep the model loaded for approximately 10 minutes after a request.

Actual response speed depends on the selected model and the computer running Ollama.

### Timeouts

The normal Ollama chat request uses a timeout of 300 seconds.

The title-generation request uses a timeout of 60 seconds.

## Error Handling

The application handles several common problems:

- Ollama not running
- no Ollama model installed
- invalid Ollama response
- Ollama timeout
- invalid chat ID
- missing chat
- empty user message
- failed HTTP connection

The frontend also checks whether Flask returned valid JSON and reports an error if it receives an unexpected response.

## Local Data

Conversation storage is local to the machine running the application.

The project does not contain a login or account system, and the database implementation shown in this archive stores conversations in the local user's `.ai_assistant` directory.

Ollama is also configured to use its local HTTP endpoint:

```text
127.0.0.1:11434
```

## Customizing Jenimi's Behavior

The main Jenimi system prompt is defined in `api.py` inside `get_response()`.

The current prompt describes Jenimi as:

```text
a helpful, intelligent and professional AI assistant
```

and asks it to produce clear answers with clean Markdown formatting.

This prompt can be edited to change Jenimi's personality, response style, or domain focus.

## Customizing the UI

Most frontend changes can be made in:

```text
ui/style.css
```

Structure changes belong in:

```text
ui/index.html
```

Interactive behavior belongs in:

```text
ui/script.js
```

## Troubleshooting

### "Ollama is not running"

Start Ollama and verify:

```bash
ollama list
```

Then restart Jenimi.

### "No model is installed"

Install a model, for example:

```bash
ollama pull llama3.2:3b
```

Then restart Jenimi.

### Port 5000 is already in use

The current Flask configuration uses:

```text
127.0.0.1:5000
```

Change the `port` value at the bottom of `app.py` if another application is already using that port.

### The UI does not appear when opening `index.html`

Run the application with:

```bash
python app.py
```

and open:

```text
http://127.0.0.1:5000
```

The frontend is designed to be served through Flask.

## Project Limitations

Based on the code in this archive:

1. AI generation is currently non-streaming.
2. There is no user authentication.
3. There is no cloud synchronization.
4. The application depends on Ollama being available locally.
5. The model is selected automatically from installed Ollama models rather than through a frontend model selector.
6. Chat titles require an additional Ollama title-generation request after the main response.
7. The application is configured for a local Flask server on `127.0.0.1:5000`.

## License

No license file or explicit license declaration is included in the supplied project archive.

If this project is distributed publicly, add an appropriate `LICENSE` file and update this section.

## Summary

Jenimi is a local-first AI chatbot that combines a browser-based interface with a Python Flask backend, SQLite conversation storage, and locally hosted Ollama models. The current implementation provides chat history, conversation persistence, automatic conversation titles, Markdown-formatted AI responses, chat deletion, and automatic Ollama model discovery.
