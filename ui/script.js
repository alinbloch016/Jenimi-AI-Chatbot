(() => {
    "use strict";

    const state = {
        currentChatId: null,
        processing: false,
    };

    const $ = (id) => document.getElementById(id);

    const historyList = $("historyList");
    const welcome = $("welcome");
    const messages = $("messages");
    const chatArea = $("chatArea");
    const messageForm = $("messageForm");
    const messageInput = $("messageInput");
    const sendButton = $("sendButton");
    const newChatButton = $("newChatButton");
    const sidebarToggle = $("sidebarToggle");

    function setProcessing(value) {
        state.processing = value;
        messageInput.disabled = value;
        sendButton.disabled = value;
        sendButton.classList.toggle("is-loading", value);
    }

    async function api(path, options = {}) {
        let response;

        try {
            response = await fetch(path, {
                ...options,
                headers: {
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {}),
                },
                cache: "no-store",
            });
        } catch (error) {
            throw new Error("Python backend is not connected. Make sure app.py is running.");
        }

        const text = await response.text();
        let data;

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            throw new Error(`Server returned invalid JSON (HTTP ${response.status}).`);
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
        }

        return data;
    }

    function updateMessageScrollbar() {
        if (!messages) return false;

        const hasOverflow =
            messages.scrollHeight > messages.clientHeight + 2;

        messages.classList.toggle("has-overflow", hasOverflow);
        return hasOverflow;
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            const hasOverflow = updateMessageScrollbar();

            if (hasOverflow) {
                messages.scrollTop = messages.scrollHeight;
            }

            requestAnimationFrame(updateMessageScrollbar);
        });
    }

    function showWelcome(show) {
        welcome.style.display = show ? "flex" : "none";
    }

    function clearMessages() {
        messages.innerHTML = "";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderInline(value) {
        let text = escapeHtml(value);
        text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
        text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
        text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
        text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
        return text;
    }

    // Safe, lightweight Markdown renderer for Ollama output.
    function renderMarkdown(markdown) {
        const source = String(markdown ?? "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        const lines = source.split("\n");
        const output = [];
        let paragraph = [];
        let listType = null;
        let inCode = false;
        let codeLanguage = "";
        let codeLines = [];

        function flushParagraph() {
            if (!paragraph.length) return;
            const text = paragraph.join(" ").trim();
            if (text) output.push(`<p>${renderInline(text)}</p>`);
            paragraph = [];
        }

        function closeList() {
            if (!listType) return;
            output.push(`</${listType}>`);
            listType = null;
        }

        function closeCode() {
            const language = codeLanguage
                ? ` data-language="${escapeHtml(codeLanguage)}"`
                : "";

            output.push(
                `<pre class="code-block"${language}><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`
            );

            codeLanguage = "";
            codeLines = [];
            inCode = false;
        }

        for (const line of lines) {
            const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);

            if (fence) {
                flushParagraph();
                closeList();

                if (inCode) {
                    closeCode();
                } else {
                    inCode = true;
                    codeLanguage = fence[1] || "";
                }

                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (!line.trim()) {
                flushParagraph();
                closeList();
                continue;
            }

            const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);

            if (heading) {
                flushParagraph();
                closeList();

                const level = heading[1].length;
                output.push(
                    `<h${level}>${renderInline(heading[2].trim())}</h${level}>`
                );

                continue;
            }

            const unordered = line.match(/^\s*[-*+]\s+(.+)$/);

            if (unordered) {
                flushParagraph();

                if (listType !== "ul") {
                    closeList();
                    output.push("<ul>");
                    listType = "ul";
                }

                output.push(`<li>${renderInline(unordered[1])}</li>`);
                continue;
            }

            const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);

            if (ordered) {
                flushParagraph();

                if (listType !== "ol") {
                    closeList();
                    output.push("<ol>");
                    listType = "ol";
                }

                output.push(`<li>${renderInline(ordered[1])}</li>`);
                continue;
            }

            if (/^\s*(---+|___+)\s*$/.test(line)) {
                flushParagraph();
                closeList();
                output.push("<hr>");
                continue;
            }

            if (line.startsWith("> ")) {
                flushParagraph();
                closeList();
                output.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
                continue;
            }

            if (listType) closeList();
            paragraph.push(line.trim());
        }

        flushParagraph();
        closeList();
        if (inCode) closeCode();

        return output.join("") || "<p></p>";
    }

    function addMessage(content, role) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "message-content";

        if (role === "assistant") {
            bubble.innerHTML = renderMarkdown(content);
        } else {
            bubble.textContent = String(content ?? "");
        }

        wrapper.appendChild(bubble);
        messages.appendChild(wrapper);
        scrollToBottom();
    }

    function addTyping() {
        removeTyping();

        const wrapper = document.createElement("div");
        wrapper.id = "typingMessage";
        wrapper.className = "message assistant typing-message";

        const dots = document.createElement("div");
        dots.className = "typing-indicator";

        for (let i = 0; i < 3; i += 1) {
            dots.appendChild(document.createElement("span"));
        }

        wrapper.appendChild(dots);
        messages.appendChild(wrapper);
        scrollToBottom();
    }

    function removeTyping() {
        const typing = $("typingMessage");
        if (typing) typing.remove();
    }

    function formatTitle(title) {
        return String(title || "New Conversation").trim() || "New Conversation";
    }

    function createHistoryItem(chat) {
        const item = document.createElement("div");
        item.className = "history-item";
        item.dataset.chatId = String(chat.id);

        if (Number(chat.id) === Number(state.currentChatId)) {
            item.classList.add("active");
        }

        const title = document.createElement("button");
        title.type = "button";
        title.className = "history-title";
        title.textContent = formatTitle(chat.title);
        title.title = formatTitle(chat.title);
        title.addEventListener("click", () => openChat(chat.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-chat";
        deleteButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 7L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
        deleteButton.title = "Delete conversation";
        deleteButton.setAttribute("aria-label", "Delete conversation");
        deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteChat(chat.id);
        });

        item.append(title, deleteButton);
        return item;
    }

    function addTemporaryChatToHistory(chat) {
        const empty = historyList.querySelector(".empty-history");
        if (empty) empty.remove();

        const existing = historyList.querySelector(
            `[data-chat-id="${String(chat.id)}"]`
        );

        if (existing) {
            existing.remove();
        }

        historyList.prepend(createHistoryItem(chat));
    }

    async function createChatImmediately() {
        const data = await api("/api/chats", {
            method: "POST",
            body: JSON.stringify({ title: "New Conversation" }),
        });

        state.currentChatId = Number(data.id);

        addTemporaryChatToHistory({
            id: state.currentChatId,
            title: data.title || "New Conversation",
        });

        return state.currentChatId;
    }

    async function loadHistory() {
        try {
            const data = await api("/api/chats", { method: "GET" });
            const chats = data.chats || [];

            historyList.innerHTML = "";

            if (!chats.length) {
                const empty = document.createElement("div");
                empty.className = "empty-history";
                empty.textContent = "No recent chats";
                historyList.appendChild(empty);
                return;
            }

            chats.forEach((chat) => {
                historyList.appendChild(createHistoryItem(chat));
            });
        } catch (error) {
            console.error("Recent chats error:", error);
            historyList.innerHTML = "";

            const errorItem = document.createElement("div");
            errorItem.className = "empty-history error-history";
            errorItem.textContent = "Unable to load recent chats";
            historyList.appendChild(errorItem);
        }
    }

    async function openChat(chatId) {
        if (state.processing) return;

        try {
            const data = await api(
                `/api/chats/${encodeURIComponent(chatId)}/messages`,
                { method: "GET" }
            );

            state.currentChatId = Number(chatId);
            clearMessages();

            const chatMessages = data.messages || [];
            showWelcome(chatMessages.length === 0);

            chatMessages.forEach((message) => {
                addMessage(
                    message.content,
                    message.role === "user" ? "user" : "assistant"
                );
            });

            await loadHistory();
            messageInput.focus();
        } catch (error) {
            console.error("Open chat error:", error);
            showError(error.message);
        }
    }

    function startNewChat() {
        if (state.processing) return;

        state.currentChatId = null;
        clearMessages();
        showWelcome(true);
        messageInput.value = "";
        messageInput.focus();
    }

    function showError(message) {
        window.alert(message || "Something went wrong.");
    }

    function showDeleteDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "dialog-overlay";

            const dialog = document.createElement("div");
            dialog.className = "dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");

            const title = document.createElement("h3");
            title.textContent = "Delete conversation?";

            const text = document.createElement("p");
            text.textContent = "This conversation will be permanently removed from this device.";

            const actions = document.createElement("div");
            actions.className = "dialog-actions";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "dialog-button secondary";
            cancel.textContent = "Cancel";

            const confirm = document.createElement("button");
            confirm.type = "button";
            confirm.className = "dialog-button danger";
            confirm.textContent = "Delete";

            function close(value) {
                overlay.remove();
                document.removeEventListener("keydown", onKeyDown);
                resolve(value);
            }

            function onKeyDown(event) {
                if (event.key === "Escape") close(false);
            }

            cancel.addEventListener("click", () => close(false));
            confirm.addEventListener("click", () => close(true));

            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) close(false);
            });

            document.addEventListener("keydown", onKeyDown);

            actions.append(cancel, confirm);
            dialog.append(title, text, actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            confirm.focus();
        });
    }

    async function deleteChat(chatId) {
        if (state.processing) return;

        const confirmed = await showDeleteDialog();
        if (!confirmed) return;

        try {
            await api(`/api/chats/${encodeURIComponent(chatId)}`, {
                method: "DELETE",
            });

            if (Number(state.currentChatId) === Number(chatId)) {
                state.currentChatId = null;
                clearMessages();
                showWelcome(true);
            }

            await loadHistory();
            messageInput.focus();
        } catch (error) {
            console.error("Delete chat error:", error);
            showError(error.message);
        }
    }

    async function sendMessage() {
        if (state.processing) return;

        const text = messageInput.value.trim();

        if (!text) {
            messageInput.focus();
            return;
        }

        setProcessing(true);
        showWelcome(false);
        addMessage(text, "user");
        messageInput.value = "";
        addTyping();

        try {
            // The sidebar entry appears immediately after Send is pressed.
            if (!state.currentChatId) {
                await createChatImmediately();
            }

            const data = await api("/api/chat", {
                method: "POST",
                body: JSON.stringify({
                    chat_id: state.currentChatId,
                    message: text,
                }),
            });

            state.currentChatId = Number(data.chat_id);
            removeTyping();
            addMessage(data.message || data.response || "", "assistant");

            // The backend has now generated the real conversation title.
            await loadHistory();
        } catch (error) {
            removeTyping();
            addMessage(`Error: ${error.message}`, "assistant");
            console.error("Send error:", error);
        } finally {
            setProcessing(false);
            messageInput.focus();
        }
    }

    function setSidebarCollapsed(collapsed) {
        const app = document.querySelector(".app");
        if (!app) return;

        app.classList.toggle("sidebar-collapsed", collapsed);

        if (sidebarToggle) {
            sidebarToggle.setAttribute(
                "aria-label",
                collapsed ? "Open sidebar" : "Collapse sidebar"
            );
            sidebarToggle.title = collapsed ? "Open sidebar" : "Collapse sidebar";
        }
    }

    async function checkBackend() {
        try {
            const data = await api("/api/status", { method: "GET" });
            document.body.classList.toggle("ollama-offline", !data.ollama);
        } catch (error) {
            console.error("Backend status error:", error);
        }
    }

    messageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage();
    });

    newChatButton.addEventListener("click", (event) => {
        event.preventDefault();
        startNewChat();
    });

    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            const app = document.querySelector(".app");
            setSidebarCollapsed(!app.classList.contains("sidebar-collapsed"));
        });
    }

    setSidebarCollapsed(false);

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    if (window.ResizeObserver) {
        const messageResizeObserver = new ResizeObserver(() => {
            updateMessageScrollbar();
        });

        messageResizeObserver.observe(messages);
    }

    window.addEventListener("resize", updateMessageScrollbar);

    (async function initialize() {
        await loadHistory();
        await checkBackend();
        messageInput.focus();
        setInterval(checkBackend, 10000);
    })();
})();
