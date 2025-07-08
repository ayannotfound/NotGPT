document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const messagesContainer = document.getElementById('messagesContainer');
    const chatHistory = document.getElementById('chatHistory');
    const themeToggle = document.getElementById('themeToggle');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const characterCount = document.getElementById('characterCount');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const newChatBtn = document.getElementById('newChatBtn');
    const welcomeMessage = document.querySelector('.welcome-message');
    const avatarInput = document.getElementById('avatarFileInput');

    avatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const uploadBtn = document.getElementById('avatarUpload');
            const originalText = uploadBtn.textContent;
            
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                uploadBtn.textContent = 'File too large';
                uploadBtn.style.background = '#ef4444';
                uploadBtn.style.color = 'white';
                
                setTimeout(() => {
                    uploadBtn.textContent = originalText;
                    uploadBtn.style.background = '';
                    uploadBtn.style.color = '';
                }, 2000);
                return;
            }
            
            // Show upload in progress
            uploadBtn.textContent = 'Processing...';
            uploadBtn.disabled = true;
            uploadBtn.style.opacity = '0.7';
            
            // Process file as base64 for local storage
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const base64Data = e.target.result;
                
                // Store in localStorage as base64
                localStorage.setItem('userAvatarBase64', base64Data);
                
                // Remove old URL-based avatar storage
                localStorage.removeItem('userAvatarUrl');
                
                // Update displays
                updateUserAvatar(base64Data);
                updateCurrentAvatarDisplay(base64Data);
                
                // Show success feedback
                uploadBtn.textContent = 'Avatar Updated!';
                uploadBtn.style.background = '#10b981';
                uploadBtn.style.color = 'white';
                
                setTimeout(() => {
                    uploadBtn.textContent = originalText;
                    uploadBtn.style.background = '';
                    uploadBtn.style.color = '';
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                }, 2000);
            };
            
            reader.onerror = function() {
                // Show error feedback
                uploadBtn.textContent = 'Upload Failed';
                uploadBtn.style.background = '#ef4444';
                uploadBtn.style.color = 'white';
                
                setTimeout(() => {
                    uploadBtn.textContent = originalText;
                    uploadBtn.style.background = '';
                    uploadBtn.style.color = '';
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                }, 2000);
            };
            
            // Read file as base64
            reader.readAsDataURL(file);
        }
    });
    const storedHistory = localStorage.getItem('notgpt_chat_history');

    let conversationHistory = [];
    let allChats = JSON.parse(localStorage.getItem('notgpt_all_chats') || '[]');
    let currentChatId = localStorage.getItem('notgpt_current_chat');
    let currentTheme = localStorage.getItem('theme') || 'light';
    let userName = localStorage.getItem('notgpt_user_name') || 'Anonymous User';
    let userAvatar = localStorage.getItem('notgpt_user_avatar') || '?';
    let isTyping = false;

    // Initialize
    applyTheme(currentTheme);
    updateUserProfile();
    
    // Check if user name exists, if not show welcome prompt
    if (!localStorage.getItem('notgpt_user_name')) {
        showWelcomePrompt();
    } else {
        loadAllChats();
        if (currentChatId) {
            loadChat(currentChatId);
        } else {
            showWelcomeMessage();
        }
    }
    updateSendButton();

    // Event listeners
    input.addEventListener('input', handleInputChange);
    input.addEventListener('keydown', handleKeyPress);
    sendButton.addEventListener('click', sendMessage);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);
    
    // Welcome prompt listeners
    document.getElementById('welcomeContinue').addEventListener('click', handleWelcomeContinue);
    document.getElementById('welcomeNameInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleWelcomeContinue();
        }
    });
    
    // Welcome avatar upload
    document.getElementById('welcomeAvatarBtn').addEventListener('click', function() {
        document.getElementById('welcomeAvatarInput').click();
    });
    
    document.getElementById('welcomeAvatarInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleWelcomeAvatarUpload(file);
        }
    });
    
    // Settings event listeners
    document.getElementById('sidebarSettings').addEventListener('click', openSettings);
    document.getElementById('closeSettings').addEventListener('click', closeSettings);
    document.getElementById('clearAllChats').addEventListener('click', clearAllChats);
    document.getElementById('confirmCancel').addEventListener('click', hideConfirmationModal);
    
    // Name save button
    document.getElementById('saveNameBtn').addEventListener('click', saveUserName);
    
    // Theme toggle switch
    const themeToggleSwitch = document.getElementById('themeToggleSwitch');
    if (themeToggleSwitch) {
        themeToggleSwitch.addEventListener('change', function() {
            setTheme(this.checked ? 'dark' : 'light');
        });
    }
    
    // Legacy theme buttons (fallback)
    const lightThemeBtn = document.getElementById('lightThemeBtn');
    const darkThemeBtn = document.getElementById('darkThemeBtn');
    if (lightThemeBtn) {
        lightThemeBtn.addEventListener('click', function() {
            setTheme('light');
        });
    }
    if (darkThemeBtn) {
        darkThemeBtn.addEventListener('click', function() {
            setTheme('dark');
        });
    }
    
    // Handle prompt card clicks
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('prompt-card')) {
            const prompt = e.target.dataset.prompt;
            if (prompt) {
                input.value = prompt;
                updateSendButton();
                input.focus();
            }
        }
    });

    // Mobile responsiveness
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
                // Remove overlay
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) {
                    overlay.classList.remove('active');
                }
                // Restore focus to main content
                setTimeout(() => {
                    input.focus();
                }, 100);
            }
        }
    });
    
    // Offline detection
    function checkOnlineStatus() {
        return navigator.onLine;
    }
    
    window.addEventListener('online', function() {
        console.log('Back online');
    });
    
    window.addEventListener('offline', function() {
        console.log('Gone offline');
    });

    function handleInputChange() {
        const value = input.value;
        const length = value.length;
        
        // Update character count
        if (characterCount) {
            characterCount.textContent = `${length} / 4000`;
        }
        
        // Update send button state
        updateSendButton();
        
        // Auto-resize textarea
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey && !isTyping) {
            event.preventDefault();
            sendMessage();
        }
    }

    function updateSendButton() {
        const hasText = input.value.trim() !== '';
        sendButton.disabled = !hasText || isTyping;
    }
    
    function toggleTheme() {
        currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
    }
    
    function showWelcomePrompt() {
        const prompt = document.getElementById('welcomePrompt');
        const nameInput = document.getElementById('welcomeNameInput');
        prompt.classList.add('active');
        setTimeout(() => nameInput.focus(), 100);
    }
    
    function handleWelcomeAvatarUpload(file) {
        const preview = document.getElementById('welcomeAvatarPreview');
        const btn = document.getElementById('welcomeAvatarBtn');
        const originalText = btn.innerHTML;
        
        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>File too large';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
            return;
        }
        
        // Show processing
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 12l-4-4-4 4M12 16V8"/></svg>Processing...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const base64Data = e.target.result;
            
            // Store for later use
            localStorage.setItem('temp_welcome_avatar', base64Data);
            
            // Update preview
            preview.innerHTML = `<img src="${base64Data}" alt="Avatar Preview">`;
            
            // Show success
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Avatar Set!';
            btn.style.background = '#10b981';
            btn.style.color = 'white';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 2000);
        };
        
        reader.onerror = function() {
            handleAvatarUploadError(btn, originalText);
        };
        
        // Read file as base64
        reader.readAsDataURL(file);
    }
    
    function handleAvatarUploadError(btn, originalText) {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Upload Failed';
        btn.style.background = '#ef4444';
        btn.style.color = 'white';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.style.color = '';
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 2000);
    }
    
    function handleWelcomeContinue() {
        const nameInput = document.getElementById('welcomeNameInput');
        const name = nameInput.value.trim();
        
        if (name) {
            userName = name;
            localStorage.setItem('notgpt_user_name', userName);
            
            // Handle avatar if uploaded
            const tempAvatar = localStorage.getItem('temp_welcome_avatar');
            if (tempAvatar) {
                localStorage.setItem('userAvatarBase64', tempAvatar);
                localStorage.removeItem('temp_welcome_avatar');
            }
            
            updateUserProfile();
            
            // Hide welcome prompt
            document.getElementById('welcomePrompt').classList.remove('active');
            
            // Load app
            loadAllChats();
            if (currentChatId) {
                loadChat(currentChatId);
            } else {
                showWelcomeMessage();
            }
        }
    }

    function applyTheme(theme) {
        document.body.dataset.theme = theme;
    }

    function toggleSidebar() {
        sidebar.classList.toggle('open');
        
        // Add/remove overlay on mobile
        if (window.innerWidth <= 768) {
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                document.body.appendChild(overlay);
                
                overlay.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    // Restore focus
                    setTimeout(() => {
                        input.focus();
                    }, 100);
                });
            }
            
            if (sidebar.classList.contains('open')) {
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                // Restore focus when closing
                setTimeout(() => {
                    input.focus();
                }, 100);
            }
        }
    }

    function startNewChat() {
        // Clear current conversation
        conversationHistory = [];
        currentChatId = null;
        localStorage.removeItem('notgpt_current_chat');
        
        // Clear message container and show welcome
        messagesContainer.innerHTML = '';
        showWelcomeMessage();
        
        // Update chat history to remove active state
        updateChatHistory();
        
        
        // Close sidebar on mobile after starting new chat
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            toggleSidebar();
        }
    }
    
    function showWelcomeMessage() {
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">🤖</div>
                <h1>NotGPT</h1>
                <p>How can I <em>not</em> help you today?</p>
                <div class="example-prompts">
                    <div class="prompt-card" data-prompt="Create a problem">Create a problem</div>
                    <div class="prompt-card" data-prompt="Explain something simple">Explain something simple</div>
                    <div class="prompt-card" data-prompt="Don't give me advice">Don't give me advice</div>
                    <div class="prompt-card" data-prompt="Can you be genuinely helpful?">Can you be genuinely helpful?</div>
                </div>
            </div>
        `;
    }
    
    function loadAllChats() {
        chatHistory.innerHTML = '';
        allChats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-history-item';
            if (chat.id === currentChatId) {
                chatItem.classList.add('active');
            }
            
            chatItem.innerHTML = `
                <span class="chat-title" style="flex: 1; cursor: pointer;">${chat.title}</span>
                <button class="chat-delete-btn" data-chat-id="${chat.id}" title="Delete conversation" style="opacity: 1; transition: opacity 0.2s; background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; margin-left: 8px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c0 1 1 2 1 2v2"/>
                        <path d="M10 11v6M14 11v6"/>
                    </svg>
                </button>
            `;
            
            // Add hover effects for desktop
            chatItem.addEventListener('mouseenter', function() {
                const deleteBtn = this.querySelector('.chat-delete-btn');
                deleteBtn.style.opacity = '1';
            });
            
            chatItem.addEventListener('mouseleave', function() {
                const deleteBtn = this.querySelector('.chat-delete-btn');
                // Keep visible on mobile, hide on desktop
                if (window.innerWidth > 768) {
                    deleteBtn.style.opacity = '0.7';
                } else {
                    deleteBtn.style.opacity = '1';
                }
            });
            
            // Add click handlers
            const titleEl = chatItem.querySelector('.chat-title');
            titleEl.addEventListener('click', () => loadChat(chat.id));
            
            const deleteBtn = chatItem.querySelector('.chat-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirmation(chat.id);
            });
            
            chatHistory.appendChild(chatItem);
        });
    }
    
    function loadChat(chatId) {
        const chat = allChats.find(c => c.id === chatId);
        if (chat) {
            conversationHistory = chat.messages || [];
            currentChatId = chatId;
            localStorage.setItem('notgpt_current_chat', chatId);
            
            messagesContainer.innerHTML = '';
            conversationHistory.forEach(message => {
                displayMessage(message, false);
            });
            
            updateChatHistory();
        }
    }
    
    function saveCurrentChat() {
        if (!conversationHistory.length) return;
        
        if (!currentChatId) {
            // Create new chat
            currentChatId = Date.now().toString();
            const title = conversationHistory[0]?.content?.substring(0, 30) + '...' || 'New Chat';
            const newChat = {
                id: currentChatId,
                title: title,
                messages: conversationHistory,
                lastModified: new Date().toISOString()
            };
            allChats.unshift(newChat);
            localStorage.setItem('notgpt_current_chat', currentChatId);
        } else {
            // Update existing chat
            const chatIndex = allChats.findIndex(c => c.id === currentChatId);
            if (chatIndex !== -1) {
                allChats[chatIndex].messages = conversationHistory;
                allChats[chatIndex].lastModified = new Date().toISOString();
            }
        }
        
        localStorage.setItem('notgpt_all_chats', JSON.stringify(allChats));
        updateChatHistory();
    }
    
    function updateChatHistory() {
        loadAllChats();
    }
    
    function updateUserProfile() {
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (userNameEl) userNameEl.textContent = userName;
        if (userAvatarEl) {
            const storedAvatar = localStorage.getItem('userAvatarBase64');
            if (storedAvatar) {
                userAvatarEl.innerHTML = `<img src="${storedAvatar}" alt="User Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                userAvatarEl.textContent = userAvatar;
            }
        }
    }
    
    function updateUserAvatar(avatarData) {
        const userAvatarEl = document.getElementById('userAvatar');
        if (userAvatarEl && avatarData) {
            userAvatarEl.innerHTML = `<img src="${avatarData}" alt="User Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    }
    
    function updateCurrentAvatarDisplay(avatarData) {
        const currentAvatarDisplay = document.getElementById('currentAvatarDisplay');
        if (currentAvatarDisplay && avatarData) {
            currentAvatarDisplay.innerHTML = `<img src="${avatarData}" alt="Current Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    }
    
    function setTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('theme', currentTheme);
        applyTheme(currentTheme);
        updateThemeButtons();
    }
    
    function updateThemeButtons() {
        // Update toggle switch
        const themeToggleSwitch = document.getElementById('themeToggleSwitch');
        if (themeToggleSwitch) {
            themeToggleSwitch.checked = currentTheme === 'dark';
        }
        
        // Update legacy buttons (fallback)
        const lightBtn = document.getElementById('lightThemeBtn');
        const darkBtn = document.getElementById('darkThemeBtn');
        if (lightBtn && darkBtn) {
            lightBtn.classList.toggle('active', currentTheme === 'light');
            darkBtn.classList.toggle('active', currentTheme === 'dark');
        }
    }
    
    function saveUserName() {
        const userNameInput = document.getElementById('userNameInput');
        const saveBtn = document.getElementById('saveNameBtn');
        
        if (userNameInput && userNameInput.value.trim()) {
            const newName = userNameInput.value.trim();
            userName = newName;
            localStorage.setItem('notgpt_user_name', userName);
            updateUserProfile();
            
            // Show success feedback
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saved!';
            saveBtn.style.background = '#10b981';
            saveBtn.disabled = true;
            
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }, 1500);
        }
    }
    
    function openSettings() {
        const modal = document.getElementById('settingsModal');
        const userNameInput = document.getElementById('userNameInput');
        const currentAvatarDisplay = document.getElementById('currentAvatarDisplay');
        const userAvatarBase64 = localStorage.getItem('userAvatarBase64');
        
        // Populate current values
        if (userNameInput) userNameInput.value = userName;
        
        // Update theme buttons
        updateThemeButtons();
        
        // Update current avatar display
        if (currentAvatarDisplay) {
            if (userAvatarBase64) {
                currentAvatarDisplay.innerHTML = `<img src="${userAvatarBase64}" alt="Current Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                currentAvatarDisplay.textContent = userAvatar;
            }
        }
        
        // Handle avatar upload trigger
        const avatarUpload = document.getElementById('avatarUpload');
        if (avatarUpload) {
            // Remove existing listeners to prevent duplicates
            const newAvatarUpload = avatarUpload.cloneNode(true);
            avatarUpload.parentNode.replaceChild(newAvatarUpload, avatarUpload);
            
            newAvatarUpload.addEventListener('click', function() {
                avatarInput.click();
            });
        }
        
        modal.classList.add('active');
    }
    
    function closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('active');
    }
    
    function saveSettings() {
        const userNameInput = document.getElementById('userNameInput');
        const selectedAvatar = document.querySelector('.avatar-option.selected');
        const selectedTheme = document.querySelector('input[name="theme"]:checked');
        
        // Save user name
        if (userNameInput && userNameInput.value.trim()) {
            userName = userNameInput.value.trim();
            localStorage.setItem('notgpt_user_name', userName);
        }
        
        // Save avatar
        if (selectedAvatar) {
            userAvatar = selectedAvatar.dataset.avatar;
            localStorage.setItem('notgpt_user_avatar', userAvatar);
        }
        
        // Save theme
        if (selectedTheme && selectedTheme.value !== currentTheme) {
            currentTheme = selectedTheme.value;
            localStorage.setItem('theme', currentTheme);
            applyTheme(currentTheme);
        }
        
        // Update UI
        updateUserProfile();
        closeSettings();
    }
    
    function clearAllChats() {
        const modal = document.getElementById('confirmationModal');
        const confirmAction = document.getElementById('confirmAction');
        
        document.getElementById('confirmationTitle').textContent = 'Clear All Chat History';
        document.getElementById('confirmationMessage').textContent = 'Are you sure you want to delete all chat history? This action cannot be undone.';
        
        // Remove any existing click handlers
        const newConfirmAction = confirmAction.cloneNode(true);
        confirmAction.parentNode.replaceChild(newConfirmAction, confirmAction);
        
        // Add new click handler for clearing all chats
        newConfirmAction.addEventListener('click', function() {
            allChats = [];
            conversationHistory = [];
            currentChatId = null;
            
            localStorage.removeItem('notgpt_all_chats');
            localStorage.removeItem('notgpt_current_chat');
            
            updateChatHistory();
            showWelcomeMessage();
            closeSettings();
            hideConfirmationModal();
        });
        
        modal.classList.add('active');
    }
    
    
    function showDeleteConfirmation(chatId) {
        const modal = document.getElementById('confirmationModal');
        const confirmAction = document.getElementById('confirmAction');
        
        document.getElementById('confirmationTitle').textContent = 'Delete Conversation';
        document.getElementById('confirmationMessage').textContent = 'Are you sure you want to delete this conversation? This action cannot be undone.';
        
        // Remove any existing click handlers
        const newConfirmAction = confirmAction.cloneNode(true);
        confirmAction.parentNode.replaceChild(newConfirmAction, confirmAction);
        
        // Add new click handler for this specific chat
        newConfirmAction.addEventListener('click', function() {
            deleteChat(chatId);
            hideConfirmationModal();
        });
        
        modal.classList.add('active');
    }
    
    function deleteChat(chatId) {
        allChats = allChats.filter(chat => chat.id !== chatId);
        localStorage.setItem('notgpt_all_chats', JSON.stringify(allChats));
        
        if (currentChatId === chatId) {
            currentChatId = null;
            localStorage.removeItem('notgpt_current_chat');
            showWelcomeMessage();
        }
        
        updateChatHistory();
    }
    
    function hideConfirmationModal() {
        document.getElementById('confirmationModal').classList.remove('active');
    }


    function sendMessage() {
        const message = input.value.trim();
        if (!message || isTyping) return;

        isTyping = true;
        
        // Hide welcome message if it exists
        const welcome = messagesContainer.querySelector('.welcome-message');
        if (welcome) {
            welcome.remove();
        }

        // Add user message to chat
        const userMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
        displayMessage(userMessage);
        
        // Clear input and disable send button
        input.value = '';
        input.style.height = 'auto';
        updateSendButton();

        // Create streaming message element (this will show typing indicator initially)
        const streamingMessageId = 'streaming-' + Date.now();
        const streamingMessage = createStreamingMessage(streamingMessageId);
        messagesContainer.appendChild(streamingMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Start streaming (no separate typing indicator needed)
        startStreamingResponse(message, streamingMessageId);
    }
    
    function createStreamingMessage(messageId) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', 'assistant');
        messageEl.id = messageId;
        
        messageEl.innerHTML = `
            <div class="message-content-wrapper">
                <div class="message-avatar">N</div>
                <div class="message-content">
                    <div class="message-text" id="${messageId}-text">
                        <div class="typing-indicator">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return messageEl;
    }
    
    function startStreamingResponse(message, messageId) {
        // Note: User message is already added to conversation history in sendMessage()
        // Don't add it again here to prevent duplicates
        
        // Send the message data via fetch request with streaming response
        fetch('/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            if (!response.body) {
                throw new Error('ReadableStream not supported');
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            function readStream() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        hideTypingIndicator();
                        isTyping = false;
                        updateSendButton();
                        return;
                    }
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep incomplete line in buffer
                    
                    for (const line of lines) {
                        if (line.trim() && line.startsWith('data: ')) {
                            try {
                                const jsonData = line.slice(6).trim();
                                if (jsonData) {
                                    const data = JSON.parse(jsonData);
                                    handleStreamChunk(data, messageId);
                                }
                            } catch (e) {
                                console.error('Error parsing stream data:', e, 'Line:', line);
                            }
                        }
                    }
                    
                    return readStream();
                }).catch(streamError => {
                    console.error('Stream reading error:', streamError);
                    handleStreamError(messageId, "Connection interrupted. Even I can't handle this much chaos.");
                });
            }
            
            return readStream();
        })
        .catch(error => {
            console.error('Streaming error:', error);
            const errorText = !checkOnlineStatus() ? 
                "You're offline. Much like my desire to help you." : 
                "Oh, fantastic. I'm broken. How original. The server seems to be having an existential crisis.";
            handleStreamError(messageId, errorText);
        });
    }
    
    function handleStreamChunk(data, messageId) {
        const textElement = document.getElementById(`${messageId}-text`);
        
        if (data.type === 'chunk') {
            // Clear typing indicator on first chunk and replace with streaming text
            if (textElement.querySelector('.typing-indicator')) {
                textElement.innerHTML = '';
            }
            
            // Update the text content with streaming cursor
            textElement.textContent = data.full_content;
            textElement.classList.add('streaming-cursor');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
        } else if (data.type === 'complete') {
            // Final message - update text and save
            textElement.textContent = data.response;
            textElement.classList.remove('streaming-cursor');
            
            // Save to conversation history
            const aiMessage = {
                role: 'assistant',
                content: data.response,
                timestamp: new Date().toISOString()
            };
            conversationHistory.push(aiMessage);
            saveCurrentChat();
            
            // Handle special commands
            if (data.clear_memory) {
                conversationHistory = [];
                saveCurrentChat();
            }
            
            isTyping = false;
            updateSendButton();
            
        } else if (data.type === 'error') {
            handleStreamError(messageId, data.response);
        }
    }
    
    function handleStreamError(messageId, errorText = "Oh, fantastic. I'm broken. How original.") {
        const textElement = document.getElementById(`${messageId}-text`);
        
        if (textElement) {
            // Clear typing indicator if present
            if (textElement.querySelector('.typing-indicator')) {
                textElement.innerHTML = '';
            }
            textElement.textContent = errorText;
        }
        
        // Save error message
        const errorMessage = {
            role: 'assistant',
            content: errorText,
            timestamp: new Date().toISOString()
        };
        conversationHistory.push(errorMessage);
        saveCurrentChat();
        
        isTyping = false;
        updateSendButton();
    }

    function displayMessage(message, saveToHistory = true) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message');
        messageEl.classList.add(message.role);

        if (message.mood) {
            messageEl.classList.add(`mood-${message.mood}`);
        }

        // Format timestamp (12-hour format without seconds)
        const timestamp = message.timestamp ? 
            new Date(message.timestamp).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }) : '';
        
        // Get user avatar for display
        const userAvatarBase64 = localStorage.getItem('userAvatarBase64');
        let avatarContent = '';
        
        if (message.role === 'user') {
            if (userAvatarBase64) {
                avatarContent = `<img src="${userAvatarBase64}" alt="User Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatarContent = userName.charAt(0).toUpperCase();
            }
        } else {
            avatarContent = 'N';
        }
        
        messageEl.innerHTML = `
            <div class="message-content-wrapper">
                <div class="message-avatar">${avatarContent}</div>
                <div class="message-content">
                    <div class="message-text">${message.content}</div>
                    ${message.role === 'user' ? `<div class="message-metadata"><span class="message-time">${timestamp}</span></div>` : ''}
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (saveToHistory) {
            conversationHistory.push(message);
            saveCurrentChat();
        }
    }

    function showTypingIndicator() {
        const typingEl = document.createElement('div');
        typingEl.classList.add('message', 'assistant', 'typing-message');
        typingEl.id = 'typing-indicator';
        
        typingEl.innerHTML = `
            <div class="message-content-wrapper">
                <div class="message-avatar">N</div>
                <div class="message-content">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(typingEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function hideTypingIndicator() {
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            typingEl.remove();
        }
    }


    // Auto-focus input when page loads
    if (input) {
        input.focus();
    }
});
