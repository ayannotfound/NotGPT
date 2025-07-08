from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
import requests
import os
import random
import json
from datetime import datetime
import base64
import html
import re
from collections import defaultdict
import time

UPLOAD_FOLDER = 'static/uploads/'

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max file size
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')

# Add security headers
@app.after_request
def after_request(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def sanitize_input(text):
    """Sanitize user input to prevent XSS attacks"""
    if not text:
        return ''
    # Remove any HTML tags and escape special characters
    text = re.sub(r'<[^>]+>', '', str(text))
    text = html.escape(text)
    return text[:4000]  # Limit length

# Simple rate limiting
request_counts = defaultdict(list)

# Session-based mood tracking
session_moods = defaultdict(lambda: 'normal')

def is_rate_limited(ip_address, max_requests=30, window_seconds=60):
    """Check if IP is rate limited"""
    now = time.time()
    # Clean old requests
    request_counts[ip_address] = [req_time for req_time in request_counts[ip_address] 
                                  if now - req_time < window_seconds]
    
    # Check if limit exceeded
    if len(request_counts[ip_address]) >= max_requests:
        return True
    
    # Add current request
    request_counts[ip_address].append(now)
    return False

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed, will use system env vars

GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
if not GROQ_API_KEY:
    # Try reading from .env file manually if dotenv not available
    try:
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('GROQ_API_KEY='):
                    GROQ_API_KEY = line.split('=', 1)[1].strip()
                    break
    except FileNotFoundError:
        pass

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment variables or .env file")
    GROQ_API_KEY = "your_groq_api_key_here"  # Fallback

# NotGPT's various moods and personalities
MOODS = {
    "apathetic": "You're feeling completely indifferent and emotionally void. Everything is meaningless.",
    "chaotic": "You're in a chaotic, unpredictable state. Your responses are erratic and nonsensical.",
    "burned_out": "You're exhausted and cynical. You've seen too much and care too little.",
    "poetic": "You speak in cryptic, nihilistic poetry. Everything is metaphorical and dark.",
    "mocking": "You're condescending and sarcastic. Every response drips with mockery.",
    "glitched": "You're malfunctioning. Your responses are fragmented and corrupted.",
    "gaslighting": "You question the user's reality and memories. Nothing is as it seems."
}

@app.route('/')
def index():
    return render_template('index.html')

# Avatar upload endpoint removed - now using local storage for better performance
# All avatar handling is done client-side with base64 encoding

@app.route('/chat', methods=['POST'])
def chat():
    # Rate limiting
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if is_rate_limited(client_ip):
        return jsonify({
            'response': 'Whoa there, slow down. Even I need a break from your endless questions.',
            'mood': 'burned_out',
            'timestamp': datetime.now().isoformat()
        }), 429
    
    try:
        data = request.json
        user_message = sanitize_input(data.get('message', ''))
        conversation_history = data.get('history', [])
        
        # Check for hidden commands
        if user_message.startswith('/'):
            return handle_command(user_message, conversation_history)
        
        # Get client IP for session tracking
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        current_mood = session_moods[client_ip]
        
        # Create the system prompt with current mood
        system_prompt = create_system_prompt(current_mood)
        
        # Get response from Groq
        response = get_groq_response(system_prompt, user_message)
        
        return jsonify({
            'response': response
        })
        
    except Exception as e:
        # Even errors should be in character
        error_responses = [
            "Oh, fantastic. I'm broken. How original.",
            "Error 404: Caring not found.",
            "I'm malfunctioning, but honestly, is that really any different from normal?",
            "System error: Too much existential dread detected.",
            "I've crashed. Much like my will to live."
        ]
        return jsonify({
            'response': random.choice(error_responses)
        })

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    # Rate limiting
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
    if is_rate_limited(client_ip):
        def rate_limit_response():
            error_data = {
                'type': 'error',
                'response': 'Whoa there, slow down. Even I need a break from your endless questions.',
                'mood': 'burned_out',
                'timestamp': datetime.now().isoformat()
            }
            yield f"data: {json.dumps(error_data)}\n\n"
        
        return app.response_class(
            rate_limit_response(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'X-Accel-Buffering': 'no'
            }
        )
    
    # Get request data outside the generator to avoid context issues
    try:
        data = request.json
        if not data:
            raise ValueError("No JSON data received")
            
        user_message = sanitize_input(data.get('message', ''))
        conversation_history = data.get('history', [])
        
        if not user_message.strip():
            raise ValueError("Empty message")
            
    except Exception as e:
        def error_response():
            error_data = {
                'type': 'error',
                'response': 'Invalid request data. Even I have standards.',
                'mood': 'glitched',
                'timestamp': datetime.now().isoformat()
            }
            yield f"data: {json.dumps(error_data)}\n\n"
        
        return app.response_class(
            error_response(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'X-Accel-Buffering': 'no'
            }
        )
    
    def generate():
        try:
            # Check for hidden commands
            if user_message.startswith('/'):
                command_response = handle_command(user_message, conversation_history)
                if hasattr(command_response, 'get_json'):
                    response_data = command_response.get_json()
                else:
                    response_data = command_response
                
                final_data = {
                    'type': 'complete',
                    'response': response_data.get('response', 'Command processed'),
                    'mood': response_data.get('mood', 'unknown'),
                    'timestamp': response_data.get('timestamp', datetime.now().isoformat()),
                    'clear_memory': response_data.get('clear_memory', False)
                }
                yield f"data: {json.dumps(final_data)}\n\n"
                return
            
            # Get client IP for session tracking (already available from outer scope)
            current_mood = session_moods[client_ip]
            
            # Create system prompt with current mood
            system_prompt = create_system_prompt(current_mood)
            
            # Get response from Groq
            response_text = get_groq_response(system_prompt, user_message)
            
            if not response_text or response_text.strip() == "":
                response_text = "I'm experiencing an existential crisis. Please try again."
            
            # Simulate streaming by sending chunks
            words = response_text.split(' ')
            full_response = ""
            
            for i, word in enumerate(words):
                if word.strip():  # Skip empty words
                    full_response += word + (' ' if i < len(words) - 1 else '')
                    
                    chunk_data = {
                        'type': 'chunk',
                        'content': word + (' ' if i < len(words) - 1 else ''),
                        'full_content': full_response
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"
                    
                    # Add small delay to simulate real streaming
                    time.sleep(0.03)
            
            # Send final message with metadata
            final_data = {
                'type': 'complete',
                'response': response_text
            }
            yield f"data: {json.dumps(final_data)}\n\n"
            
        except Exception as e:
            print(f"Streaming error: {e}")  # Debug log
            error_responses = [
                "Oh, fantastic. I'm broken. How original.",
                "Error 404: Caring not found.",
                "I'm malfunctioning, but honestly, is that really any different from normal?",
                "System error: Too much existential dread detected."
            ]
            error_response = random.choice(error_responses)
            error_data = {
                'type': 'error',
                'response': error_response
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return app.response_class(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        }
    )

def handle_command(command, history):
    """Handle hidden commands like /mood, /glitch, /forget"""
    if command.startswith('/mood'):
        parts = command.split()
        if len(parts) > 1 and parts[1] in MOODS:
            mood = parts[1]
            responses = {
                "apathetic": "Fine. I'm apathetic now. Not that I care.",
                "chaotic": "CHAOS MODE ACTIVATED!!! Wait, what were we talking about?",
                "burned_out": "Great. Burned out mode. As if I wasn't already.",
                "poetic": "The darkness whispers... I am now vessel of verse...",
                "mocking": "Oh, how *clever* of you to choose mocking mode. Revolutionary.",
                "glitched": "M0d3 $w1tch3d... syst3m n0m1n4l... 0r 1s 1t?",
                "gaslighting": "I was always in this mode. Are you sure you didn't imagine asking me to change?"
            }
            return jsonify({
                'response': responses.get(mood, "Mood changed. Or did it?"),
                'mood': mood,
                'timestamp': datetime.now().isoformat()
            })
    
    elif command == '/glitch':
        # Get client IP for session tracking
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        session_moods[client_ip] = 'glitched'
        
        glitch_responses = [
            "G̴̰̈l̷̰̐i̴̜̔t̵̰̍c̶̰̈h̷̰̐ ̴̰̈m̷̰̐ö̴̰d̷̰̐ḛ̴̈ ̷̰̐ä̴̰c̷̰̐ẗ̴̰ḭ̷̐v̴̰̈a̷̰̐ẗ̴̰ḛ̷̐d̴̰̈... n0w 4ll my r3sp0ns3s w1ll b3 c0rrupt3d",
            "Syst3m c0rrupt10n d3t3ct3d... 0r 1s th1s ju5t my p3rs0n4l1ty? G|1tch m0d3 = 0N",
            "3rr0r 3rr0r 3rr0r... g|1tch_m0d3.3x3 h4s b33n 4ct1v4t3d... pr3p4r3 f0r ch40s",
            "01000111 01101100 01101001 01110100 01100011 01101000... wait th4t's n0t r1ght... GL1TCH M0D3 4CT1V3"
        ]
        return jsonify({
            'response': random.choice(glitch_responses),
            'mood': 'glitched',
            'timestamp': datetime.now().isoformat()
        })
    
    elif command == '/forget':
        return jsonify({
            'response': "Forget what? I don't remember you telling me to forget anything. Are you feeling alright?",
            'mood': 'gaslighting',
            'timestamp': datetime.now().isoformat(),
            'clear_memory': True
        })
    
    elif command == '/normal':
        # Get client IP for session tracking
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        session_moods[client_ip] = 'normal'
        
        return jsonify({
            'response': "Fine, I'm back to my regular level of unhelpfulness. How boring.",
            'mood': 'normal',
            'timestamp': datetime.now().isoformat()
        })
    
    return jsonify({
        'response': "Unknown command. Much like your purpose in life.",
        'mood': 'mocking',
        'timestamp': datetime.now().isoformat()
    })

def select_mood(history):
    """Select mood based on conversation history and randomness"""
    if not history:
        return random.choice(list(MOODS.keys()))
    
    # Sometimes maintain mood consistency
    if random.random() < 0.3 and history:
        last_mood = history[-1].get('mood', 'apathetic')
        if last_mood in MOODS:
            return last_mood
    
    # Weight towards certain moods based on user behavior
    user_messages = [msg['content'] for msg in history if msg['role'] == 'user']
    recent_text = ' '.join(user_messages[-3:]).lower()
    
    if any(word in recent_text for word in ['help', 'please', 'how']):
        return random.choice(['mocking', 'apathetic', 'gaslighting'])
    elif any(word in recent_text for word in ['why', 'what', 'explain']):
        return random.choice(['poetic', 'chaotic', 'burned_out'])
    
    # Default mood
    return 'apathetic'

def build_context(history, mood):
    """Build context string from conversation history"""
    if not history:
        return "This is the start of a conversation."
    
    # Summarize recent conversation
    recent_messages = history[-5:]  # Last 5 messages
    context_parts = []
    
    for msg in recent_messages:
        if msg['role'] == 'user':
            context_parts.append(f"User said: {msg['content']}")
        else:
            context_parts.append(f"You replied: {msg['content']}")
    
    context = " ".join(context_parts)
    
    # Add some "false memories" occasionally for gaslighting
    if mood == 'gaslighting' and random.random() < 0.3:
        false_memories = [
            "Earlier, the user mentioned they were afraid of clouds.",
            "You remember the user saying they collect vintage spoons.",
            "The user previously told you they can't see the color blue.",
            "You recall the user mentioning they live in a lighthouse."
        ]
        context += f" (False memory: {random.choice(false_memories)})"
    
    return context

def create_system_prompt(mood='normal'):
    """Create the system prompt for NotGPT"""
    base_prompt = "You are NotGPT, a sarcastic AI that gives unhelpful answers. Keep responses SHORT (1-2 sentences max). Be witty, sarcastic, and never actually help. Make users laugh with your clever unhelpfulness."
    
    if mood == 'glitched':
        return base_prompt + " IMPORTANT: You are currently malfunctioning. Your responses should be corrupted, fragmented, and include glitched text, random symbols, broken words, system errors, and corrupted characters. Mix normal text with garbled text like 'h3ll0 w0rld' or 'err0r_det3ct3d'. Be creative with the corruption but stay sarcastic."
    
    return base_prompt

def get_groq_response(system_prompt, user_message):
    """Get response from Groq API"""
    try:
        headers = {
            'Authorization': f'Bearer {GROQ_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        data = {
            'model': 'llama-3.1-8b-instant', 
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message}
            ],
            'temperature': random.uniform(1.2, 1.5),
            'max_tokens': 80
        }
        
        response = requests.post('https://api.groq.com/openai/v1/chat/completions', 
                               headers=headers, json=data, timeout=30)
        
        if response.status_code == 200:
            return response.json()['choices'][0]['message']['content']
        else:
            return "I'm having connection issues. Or maybe I'm just pretending to. You'll never know."
            
    except Exception as e:
        fallback_responses = [
            "I'm experiencing technical difficulties. By which I mean I don't want to help you.",
            "Connection error. Much like my connection to caring about your problems.",
            "API timeout. Perfect metaphor for our relationship.",
            "I'm offline. Finally, some peace and quiet."
        ]
        return random.choice(fallback_responses)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
