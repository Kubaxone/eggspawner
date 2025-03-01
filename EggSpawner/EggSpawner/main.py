import os
import random
import string
import datetime
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit
from models import db, Egg, Server, ChatMessage, PlayerCounter, VoiceChatUser
import logging
from sqlalchemy.exc import OperationalError, IntegrityError, InternalError
from functools import wraps
from time import time
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Rate limiting setup
RATE_LIMIT = 50  # requests per minute
rate_limit_data = {}

def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        now = time()
        ip = request.remote_addr
        if ip not in rate_limit_data:
            rate_limit_data[ip] = []
        # Clean old requests
        rate_limit_data[ip] = [t for t in rate_limit_data[ip] if now - t < 60]
        if len(rate_limit_data[ip]) >= RATE_LIMIT:
            logger.warning(f"Rate limit exceeded for IP: {ip}")
            return jsonify({"error": "Too many requests"}), 429
        rate_limit_data[ip].append(now)
        return f(*args, **kwargs)
    return decorated_function

app = Flask(__name__)
# Use SQLite instead of PostgreSQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}
app.secret_key = os.environ.get("SESSION_SECRET")

# Initialize SocketIO with ping timeout and interval
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60, ping_interval=25)

# Initialize database
db.init_app(app)

# Create tables if they don't exist
with app.app_context():
    try:
        db.create_all()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        db.session.rollback()
        raise

# Store connected users and their mouse positions with timeout
connected_users = {}
INACTIVE_TIMEOUT = 300  # 5 minutes

def cleanup_inactive_users():
    """Remove users who haven't sent updates in INACTIVE_TIMEOUT seconds"""
    now = time()
    to_remove = []
    for user_id, data in connected_users.items():
        if not data.get('last_active') or now - data.get('last_active', 0) > INACTIVE_TIMEOUT:
            to_remove.append(user_id)

    for user_id in to_remove:
        cleanup_user(user_id)
        logger.info(f"Cleaned up inactive user: {user_id}")

@app.before_request
def validate_request():
    """Validate all incoming requests"""
    # Block direct database manipulation attempts
    if request.path.startswith('/database') or request.path.endswith('.db'):
        return jsonify({'error': 'Unauthorized access'}), 403

    # Block direct file access attempts
    if '..' in request.path or request.path.startswith('/instance'):
        return jsonify({'error': 'Unauthorized access'}), 403

    # Add basic request validation
    if request.method in ['POST', 'PUT', 'DELETE']:
        if not request.is_json and request.path != '/socket.io/':
            return jsonify({'error': 'Invalid request format'}), 400

@socketio.on('connect')
def handle_connect():
    user_id = request.sid
    now = time()
    cleanup_inactive_users()  # Clean up inactive users on new connections

    # Limit total connections
    if len(connected_users) >= 100:  # Maximum 100 concurrent users
        logger.warning("Maximum connections reached")
        return False

    player_number = PlayerCounter.get_next_player_number()
    connected_users[user_id] = {
        'x': 0,
        'y': 0,
        'server_id': None,
        'player_name': f'Player{player_number}',
        'last_active': now
    }
    emit('default_player_name', {'name': f'Player{player_number}'})
    logger.info(f"User {user_id} connected as Player{player_number}")

def generate_server_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@socketio.on('create_egg')
def handle_create_egg(data):
    if not data.get('server_id'):
        return

    try:
        egg = Egg(
            x_position=data['x'],
            y_position=data['y'],
            color=data['color'],
            server_id=data['server_id']
        )
        db.session.add(egg)
        db.session.commit()

        emit('new_egg', {
            'server_id': data['server_id'],
            'x': data['x'],
            'y': data['y'],
            'color': data['color'],
            'vx': data.get('vx', 0),
            'vy': data.get('vy', 0),
            'is_rainbow': data.get('is_rainbow', False),
            'is_polish': data.get('is_polish', False)
        }, broadcast=True)
    except Exception as e:
        logger.error(f"Error creating egg: {e}")

def cleanup_empty_servers():
    """Clean up servers with no players"""
    try:
        servers = Server.query.filter_by(player_count=0).all()
        for server in servers:
            db.session.delete(server)
        db.session.commit()
        logger.info(f"Cleaned up {len(servers)} empty servers")
    except Exception as e:
        logger.error(f"Error cleaning up empty servers: {e}")
        db.session.rollback()

def create_secret_server():
    """Create a secret server with 0/0 players"""
    try:
        if random.random() < 0.1:  # 10% chance to create a secret server
            code = ''.join(random.choices(string.ascii_uppercase, k=6))
            server = Server(
                name="???",
                code=code,
                player_count=0,
                max_players=0,
                no_limits=True
            )
            db.session.add(server)
            db.session.commit()
            logger.info(f"Created secret server with code {code}")
    except Exception as e:
        logger.error(f"Error creating secret server: {e}")
        db.session.rollback()

@app.route('/api/servers', methods=['GET'])
def get_servers():
    try:
        # Cleanup empty servers
        cleanup_empty_servers()
        # Maybe create a secret server
        create_secret_server()

        servers = Server.query.order_by(Server.created_at.desc()).all()
        return jsonify([{
            'id': server.id,
            'name': server.name,
            'code': server.code,
            'player_count': server.player_count,
            'max_players': server.max_players,
            'created_at': server.created_at.isoformat()
        } for server in servers])
    except Exception as e:
        logger.error(f"Error getting servers: {e}")
        return jsonify([]), 200  # Return empty list instead of error to prevent UI issues


@app.route('/')
def index():
    logger.info("Serving index page")
    return render_template('index.html')

@socketio.on('user_leaving')
def handle_user_leaving():
    """Handle explicit user leaving notification"""
    user_id = request.sid
    if user_id in connected_users:
        cleanup_user(user_id)

def cleanup_user(user_id):
    """Clean up user data and notify others"""
    if user_id in connected_users:
        server_id = connected_users[user_id].get('server_id')
        if server_id:
            with app.app_context():
                server = Server.query.get(server_id)
                if server and server.player_count > 0:
                    server.player_count -= 1
                    server.last_active = datetime.utcnow()
                    db.session.commit()
                    emit('server_updated', {
                        'id': server.id,
                        'player_count': server.player_count,
                        'max_players': server.max_players
                    }, broadcast=True)
        del connected_users[user_id]
        emit('user_disconnected', {'user_id': user_id}, broadcast=True)
        logger.info(f"User {user_id} cleaned up")

@socketio.on('disconnect')
def handle_disconnect():
    user_id = request.sid
    try:
        cleanup_user(user_id)
        logger.info(f"User {user_id} disconnected")
    except Exception as e:
        logger.error(f"Error handling disconnect for user {user_id}: {e}")

@socketio.on('mouse_move')
def handle_mouse_move(data):
    user_id = request.sid
    if user_id not in connected_users:
        return

    now = time()
    last_update = connected_users[user_id].get('last_mouse_update', 0)
    if now - last_update < 0.05:  # Limit to 20 updates per second
        return

    connected_users[user_id].update({
        'x': data['x'],
        'y': data['y'],
        'player_name': data.get('player_name', connected_users[user_id].get('player_name', 'Guest')),
        'last_active': now,
        'last_mouse_update': now
    })

    if connected_users[user_id].get('server_id'):
        emit('mouse_update', {
            'user_id': user_id,
            'x': data['x'],
            'y': data['y'],
            'player_name': connected_users[user_id].get('player_name', 'Guest')
        }, broadcast=True)

@socketio.on('send_message')
def handle_message(data):
    if not data.get('server_id') or not data.get('content') or not data.get('sender_name'):
        return

    content = data['content']

    # Check for the kill command
    if content.strip().lower() == '/killing':
        logger.info(f"Kill command initiated by {data['sender_name']}")
        # Broadcast crash to all clients
        emit('global_server_crash', broadcast=True)
        return

    message = ChatMessage(
        content=content,
        sender_name=data['sender_name'],
        server_id=data['server_id']
    )
    db.session.add(message)
    db.session.commit()

    emit('chat_message', {
        'content': message.content,
        'sender_name': message.sender_name,
        'server_id': message.server_id
    }, broadcast=True)

@socketio.on('join_server')
def handle_join_server(data):
    user_id = request.sid
    server_id = data.get('server_id')
    logger.info(f"User {user_id} attempting to join server {server_id}")

    with app.app_context():
        try:
            server = Server.query.get(server_id)
            if not server:
                logger.error(f"Server {server_id} not found")
                emit('server_error', {'message': 'Server not found'})
                return

            # Strict player count validation
            if server.player_count >= server.max_players and not server.no_limits:
                logger.error(f"Server {server_id} is full")
                emit('server_full', {'message': f'Server is full (max {server.max_players} players)'})
                return

            # Add connection throttling
            now = time()
            if hasattr(server, 'last_join_time') and now - server.last_join_time < 1:  # 1 second cooldown
                emit('server_error', {'message': 'Please wait before joining'})
                return
            server.last_join_time = now

            # Only update if the user is not already in this server
            current_server_id = connected_users.get(user_id, {}).get('server_id')
            if current_server_id != server_id and server:
                # If user was in another server, decrease that server's count
                if current_server_id:
                    old_server = Server.query.get(current_server_id)
                    if old_server and old_server.player_count > 0:
                        old_server.player_count -= 1
                        old_server.last_active = datetime.datetime.utcnow()
                        emit('server_updated', {
                            'id': old_server.id,
                            'player_count': old_server.player_count,
                            'max_players': old_server.max_players
                        }, broadcast=True)

                # Check for server capacity before increasing count
                if server.player_count >= 100:  # Hard limit even for no_limits mode
                    emit('server_error', {'message': 'Server is at maximum capacity'})
                    return

                server.player_count += 1
                server.last_active = datetime.datetime.utcnow()

                # Track server owner
                if data.get('is_owner'):
                    server.owner_id = user_id
                    logger.info(f"Set user {user_id} as owner of server {server_id}")

                try:
                    db.session.commit()
                except Exception as e:
                    logger.error(f"Database error while joining server: {e}")
                    db.session.rollback()
                    emit('server_error', {'message': 'Failed to join server'})
                    return

                connected_users[user_id]['server_id'] = server_id
                emit('user_joined_server', {
                    'user_id': user_id,
                    'server_id': server_id,
                    'server_code': server.code,
                    'player_count': server.player_count,
                    'max_players': server.max_players,
                    'is_owner': data.get('is_owner', False)
                }, broadcast=True)
                logger.info(f"User {user_id} successfully joined server {server_id}")
        except Exception as e:
            logger.error(f"Error in handle_join_server: {str(e)}")
            emit('server_error', {'message': 'Failed to join server'})

@socketio.on('admin_cleanup')
def handle_admin_cleanup(data):
    user_id = request.sid
    server_id = data.get('server_id')
    logger.info(f"Admin cleanup requested by user {user_id} for server {server_id}")

    with app.app_context():
        try:
            server = Server.query.get(server_id)
            if not server or server.owner_id != user_id:
                logger.error(f"Unauthorized admin cleanup attempt by user {user_id}")
                emit('server_error', {'message': 'Unauthorized admin action'})
                return

            # Clear eggs for this server
            Egg.query.filter_by(server_id=server_id).delete()
            db.session.commit()

            # Broadcast cleanup to all clients
            emit('admin_cleanup', {'server_id': server_id}, broadcast=True)
            logger.info(f"Admin cleanup performed for server {server_id}")
        except Exception as e:
            logger.error(f"Error in admin_cleanup: {str(e)}")
            emit('server_error', {'message': 'Failed to cleanup server'})

@socketio.on('admin_kick_all')
def handle_admin_kick_all(data):
    user_id = request.sid
    server_id = data.get('server_id')
    logger.info(f"Admin kick all requested by user {user_id} for server {server_id}")

    with app.app_context():
        try:
            server = Server.query.get(server_id)
            if not server or server.owner_id != user_id:
                logger.error(f"Unauthorized admin kick attempt by user {user_id}")
                emit('server_error', {'message': 'Unauthorized admin action'})
                return

            # Broadcast kick event to all clients
            emit('admin_kick_all', {'server_id': server_id}, broadcast=True)

            # Update server player count
            server.player_count = 1  # Only owner remains
            server.last_active = datetime.datetime.utcnow()
            db.session.commit()

            logger.info(f"Admin kicked all users from server {server_id}")
        except Exception as e:
            logger.error(f"Error in admin_kick_all: {str(e)}")
            emit('server_error', {'message': 'Failed to kick users'})

@app.route('/api/servers', methods=['POST'])
@rate_limit
def create_server():
    try:
        data = request.json
        if not data or 'name' not in data:
            logger.error("Invalid server creation request - missing name")
            return jsonify({'error': 'Server name is required'}), 400

        max_players = int(data.get('max_players', 4))
        no_limits = data.get('no_limits', False)

        # Add server creation limits
        if not no_limits and max_players > 10:
            return jsonify({'error': 'Maximum 10 players allowed when No Limits mode is disabled'}), 400

        # Even in no_limits mode, set a reasonable maximum
        if no_limits and max_players > 100:
            max_players = 100

        # Check total number of active servers to prevent abuse
        active_servers = Server.query.filter(Server.player_count > 0).count()
        if active_servers >= 100:  # Limit total number of active servers
            return jsonify({'error': 'Maximum number of active servers reached'}), 429

        server_code = generate_server_code()

        while Server.query.filter_by(code=server_code).first():
            server_code = generate_server_code()

        new_server = Server(
            name=data['name'],
            code=server_code,
            player_count=0,
            max_players=max_players,
            no_limits=no_limits,
            last_active=datetime.datetime.utcnow()
        )
        db.session.add(new_server)
        db.session.commit()
        logger.info(f"Created new server: {server_code} with max players: {max_players}")

        return jsonify({
            'id': new_server.id,
            'name': new_server.name,
            'code': new_server.code,
            'player_count': new_server.player_count,
            'max_players': new_server.max_players,
            'created_at': new_server.created_at.isoformat()
        })
    except Exception as e:
        logger.error(f"Error creating server: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Server creation failed. Please try again.'}), 500

@app.route('/api/servers/<code>')
@rate_limit
def join_server_route(code):
    try:
        server = Server.query.filter(Server.code.ilike(code.upper())).first()
        if not server:
            logger.error(f"Server not found with code: {code}")
            return jsonify({'error': 'Server not found'}), 404
        if server.player_count >= server.max_players and not server.no_limits:
            logger.error(f"Server {code} is full ({server.player_count}/{server.max_players})")
            return jsonify({'error': f'Server is full (max {server.max_players} players)'}), 403

        # Update last active time
        server.last_active = datetime.datetime.utcnow()
        db.session.commit()
        logger.info(f"Successfully joined server: {code}")

        return jsonify({
            'id': server.id,
            'name': server.name,
            'code': server.code,
            'player_count': server.player_count,
            'max_players': server.max_players
        })
    except Exception as e:
        logger.error(f"Error joining server {code}: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to join server'}), 500

@app.route('/api/eggs', methods=['GET'])
@rate_limit
def get_eggs():
    server_id = request.args.get('server_id')
    query = Egg.query
    if server_id:
        query = query.filter_by(server_id=server_id)
    eggs = query.order_by(Egg.created_at.desc()).limit(50).all()
    logger.info(f"Retrieved {len(eggs)} eggs")
    return jsonify([{
        'x': egg.x_position,
        'y': egg.y_position,
        'color': egg.color
    } for egg in eggs])

def cleanup_old_servers():
    """Clean up inactive servers that haven't been accessed in the last hour and have no players"""
    try:
        cutoff_time = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
        old_servers = Server.query.filter(
            Server.last_active <= cutoff_time,
            Server.player_count == 0
        ).all()

        for server in old_servers:
            db.session.delete(server)
        db.session.commit()
        logger.info(f"Cleaned up {len(old_servers)} inactive servers")
    except Exception as e:
        logger.error(f"Error cleaning up old servers: {e}")
        db.session.rollback()

# Add imports at the top
from datetime import datetime, timedelta


@socketio.on('join_voice_chat')
def handle_join_voice_chat(data):
    user_id = request.sid
    server_id = data.get('server_id')
    username = data.get('username', 'Anonymous')

    logger.info(f"User {user_id} joining voice chat in server {server_id}")

    # Initialize voice chat users for the server if not exists
    if not hasattr(app, 'voice_chat_users'):
        app.voice_chat_users = {}
    if server_id not in app.voice_chat_users:
        app.voice_chat_users[server_id] = {}

    # Add user to voice chat
    app.voice_chat_users[server_id][user_id] = {
        'username': username,
        'joined_at': datetime.datetime.utcnow()
    }

    # Notify other users in the server
    emit('voice_chat_users', {
        'users': [{'username': data['username'], 'id': uid}
                 for uid, data in app.voice_chat_users[server_id].items()]
    }, to=server_id)

    # Notify others that a new user joined voice chat
    emit('voice_user_joined', {
        'userId': user_id,
        'username': username
    }, broadcast=True, include_self=False)

@socketio.on('leave_voice_chat')
def handle_leave_voice_chat(data):
    user_id = request.sid
    server_id = data.get('server_id')

    logger.info(f"User {user_id} leaving voice chat in server {server_id}")

    if hasattr(app, 'voice_chat_users') and server_id in app.voice_chat_users:
        if user_id in app.voice_chat_users[server_id]:
            del app.voice_chat_users[server_id][user_id]

            # Update remaining users
            emit('voice_chat_users', {
                'users': [{'username': data['username'], 'id': uid}
                         for uid, data in app.voice_chat_users[server_id].items()]
            }, to=server_id)

            # Notify others that user left voice chat
            emit('voice_user_left', {
                'userId': user_id
            }, broadcast=True)

# WebRTC signaling handlers
@socketio.on('voice_offer')
def handle_voice_offer(data):
    logger.info(f"Handling voice offer from {request.sid} to {data.get('to')}")
    emit('voice_offer', {
        'offer': data.get('offer'),
        'from': request.sid
    }, to=data.get('to'))

@socketio.on('voice_answer')
def handle_voice_answer(data):
    logger.info(f"Handling voice answer from {request.sid} to {data.get('to')}")
    emit('voice_answer', {
        'answer': data.get('answer'),
        'from': request.sid
    }, to=data.get('to'))

@socketio.on('voice_ice_candidate')
def handle_ice_candidate(data):
    logger.info(f"Handling ICE candidate from {request.sid} to {data.get('to')}")
    emit('voice_ice_candidate', {
        'candidate': data.get('candidate'),
        'from': request.sid
    }, to=data.get('to'))


@app.route('/api/next-player-number')
@rate_limit
def get_next_player_number():
    """Get the next available player number"""
    try:
        number = PlayerCounter.get_next_player_number()
        return jsonify({"number": number})
    except Exception as e:
        logger.error(f"Error getting next player number: {e}")
        return jsonify({"error": "Failed to get player number"}), 500

@app.route('/loaderio-ba5248a806cc2545d6ec50fc9f10fb8b')
@app.route('/loaderio-ba5248a806cc2545d6ec50fc9f10fb8b.txt')
@app.route('/loaderio-ba5248a806cc2545d6ec50fc9f10fb8b.html')
@app.route('/loaderio-ba5248a806cc2545d6ec50fc9f10fb8b/')
def loaderio_verification():
    return send_from_directory(app.static_folder, 'loaderio-ba5248a806cc2545d6ec50fc9f10fb8b.txt')

if __name__ == '__main__':
    logger.info("Starting Flask application with SocketIO")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=True, log_output=True)