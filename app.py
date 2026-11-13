import os
import sqlite3
from io import BytesIO

from flask import Flask, jsonify, request, session, send_from_directory
from PIL import Image
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "reloop.db")
app.secret_key = os.environ.get("SECRET_KEY", "local-development-key")


# Database connection
def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


# Create database
def init_db():
    connection = get_db()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            points INTEGER NOT NULL DEFAULT 0
        )
    """)

    connection.commit()
    connection.close()


init_db()


# Load AI model
classifier = None


def load_model():
    global classifier

    try:
        from transformers import pipeline

        print("Loading AI model. First load may take time...")

        classifier = pipeline(
            "image-classification",
            model="google/vit-base-patch16-224"
        )

        print("AI model ready!")

    except Exception as error:
        print("AI model could not load:", error)
        classifier = None


# Home page
@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


# Frontend files
@app.route("/<path:filename>")
def serve_file(filename):
    return send_from_directory(BASE_DIR, filename)


# Health check
@app.route("/api/health")
def health():
    return jsonify({
        "status": "success",
        "message": "ReLoop AI backend is running!"
    })


# Register user
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not 3 <= len(username) <= 30:
        return jsonify({
            "status": "error",
            "message": "Username must be 3 to 30 characters."
        }), 400

    if len(password) < 8:
        return jsonify({
            "status": "error",
            "message": "Password must contain at least 8 characters."
        }), 400

    connection = get_db()

    try:
        cursor = connection.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, generate_password_hash(password))
        )

        connection.commit()

        session.clear()
        session["user_id"] = cursor.lastrowid

        return jsonify({
            "status": "success",
            "message": "Account created successfully.",
            "username": username,
            "points": 0
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({
            "status": "error",
            "message": "Username already exists."
        }), 409

    finally:
        connection.close()


# Login
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    connection = get_db()

    user = connection.execute(
        "SELECT * FROM users WHERE username = ?",
        (username,)
    ).fetchone()

    connection.close()

    if user is None or not check_password_hash(
        user["password"], password
    ):
        return jsonify({
            "status": "error",
            "message": "Incorrect username or password."
        }), 401

    session.clear()
    session["user_id"] = user["id"]

    return jsonify({
        "status": "success",
        "message": "Login successful.",
        "username": user["username"],
        "points": user["points"]
    })


# Current user
@app.route("/api/me")
def current_user():
    user_id = session.get("user_id")

    if user_id is None:
        return jsonify({
            "status": "error",
            "message": "Please log in."
        }), 401

    connection = get_db()

    user = connection.execute(
        "SELECT username, points FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    connection.close()

    if user is None:
        session.clear()

        return jsonify({
            "status": "error",
            "message": "User not found."
        }), 404

    return jsonify({
        "status": "success",
        "username": user["username"],
        "points": user["points"]
    })


# Logout
@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({
        "status": "success",
        "message": "Logged out successfully."
    })


# Add EcoPoints
@app.route("/api/points", methods=["POST"])
def award_points():
    user_id = session.get("user_id")

    if user_id is None:
        return jsonify({
            "status": "error",
            "message": "Please log in to earn EcoPoints."
        }), 401

    data = request.get_json(silent=True) or {}

    try:
        points = int(data.get("points", 0))
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "message": "Invalid points value."
        }), 400

    if not 0 <= points <= 15:
        return jsonify({
            "status": "error",
            "message": "Points must be between 0 and 15."
        }), 400

    connection = get_db()

    connection.execute(
        "UPDATE users SET points = points + ? WHERE id = ?",
        (points, user_id)
    )

    user = connection.execute(
        "SELECT username, points FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    connection.commit()
    connection.close()

    return jsonify({
        "status": "success",
        "earned_points": points,
        "username": user["username"],
        "total_points": user["points"]
    })


# Leaderboard
@app.route("/api/leaderboard")
def leaderboard():
    connection = get_db()

    users = connection.execute("""
        SELECT username, points
        FROM users
        ORDER BY points DESC, username ASC
        LIMIT 20
    """).fetchall()

    connection.close()

    return jsonify({
        "status": "success",
        "leaderboard": [
            {
                "rank": index + 1,
                "username": user["username"],
                "points": user["points"]
            }
            for index, user in enumerate(users)
        ]
    })


# Analyze image
@app.route("/api/analyze", methods=["POST"])
def analyze():
    if "image" not in request.files:
        return jsonify({
            "status": "error",
            "message": "Please upload an image."
        }), 400

    if classifier is None:
        return jsonify({
            "status": "error",
            "message": (
                "AI model is unavailable. Check the terminal "
                "for the model loading error."
            )
        }), 503

    try:
        uploaded_file = request.files["image"]

        image = Image.open(
            BytesIO(uploaded_file.read())
        ).convert("RGB")

        prediction = classifier(image)[0]

        category = prediction["label"]
        confidence = round(prediction["score"] * 100, 2)

        label = category.lower()

        if any(word in label for word in (
            "banana", "apple", "orange", "fruit",
            "vegetable", "food", "mango"
        )):
            suggestion = (
                "Suitable fruit and vegetable scraps can be composted."
            )
            points = 15

        elif any(word in label for word in (
            "paper", "cardboard", "newspaper", "carton"
        )):
            suggestion = (
                "Keep paper clean and dry before recycling."
            )
            points = 10

        elif any(word in label for word in (
            "plastic", "bottle", "wrapper"
        )):
            suggestion = (
                "Keep plastic clean and check local recycling rules."
            )
            points = 10

        elif any(word in label for word in (
            "glass", "jar", "metal", "can", "aluminum", "aluminium"
        )):
            suggestion = (
                "Check local recycling rules for this material."
            )
            points = 15

        else:
            suggestion = (
                "Check local waste-management guidelines before disposal."
            )
            points = 0

        return jsonify({
            "status": "success",
            "category": category,
            "confidence": confidence,
            "suggestion": suggestion,
            "suggested_points": points,
            "message": "Image classified by a general AI model."
        })

    except Exception:
        app.logger.exception("Image analysis failed")

        return jsonify({
            "status": "error",
            "message": "Could not analyze this image. Please try another."
        }), 500


# Start server
if __name__ == "__main__":
    load_model()
    app.run(debug=True)