from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Egg(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    x_position = db.Column(db.Float, nullable=False)
    y_position = db.Column(db.Float, nullable=False)
    color = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    server_id = db.Column(db.Integer, db.ForeignKey('server.id', ondelete='CASCADE'), nullable=True)
    server = db.relationship('Server', back_populates='eggs')

class Server(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(6), unique=True, nullable=False, index=True)  # Add index for faster lookups
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_active = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    player_count = db.Column(db.Integer, default=0)
    max_players = db.Column(db.Integer, default=4)
    eggs = db.relationship('Egg', back_populates='server', lazy=True, cascade='all, delete-orphan')
    messages = db.relationship('ChatMessage', backref='server', lazy=True, cascade='all, delete-orphan')
    owner_id = db.Column(db.String(100))  # Store socket ID of server owner
    no_limits = db.Column(db.Boolean, default=False)  # For No Limits mode
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)  # Add last seen timestamp
    active = db.Column(db.Boolean, default=True)  # Add active status
    voice_chat_users = db.relationship('VoiceChatUser', backref='server', lazy=True, cascade='all, delete-orphan')

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(500), nullable=False)
    sender_name = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)  # Add index for faster message sorting
    server_id = db.Column(db.Integer, db.ForeignKey('server.id', ondelete='CASCADE'), nullable=False)

class VoiceChatUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), nullable=False)  # Socket ID
    username = db.Column(db.String(50), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    server_id = db.Column(db.Integer, db.ForeignKey('server.id', ondelete='CASCADE'), nullable=False)

class PlayerCounter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    total_players = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @classmethod
    def get_next_player_number(cls):
        counter = cls.query.first()
        if not counter:
            counter = cls(total_players=1)
            db.session.add(counter)
        else:
            counter.total_players += 1
        db.session.commit()
        return counter.total_players