const imageInput = document.getElementById("wasteImage");
const preview = document.getElementById("preview");
const analyzeButton = document.getElementById("analyzeButton");
const result = document.getElementById("result");

let scanCount = 0;
let recycleCount = 0;
let points = 0;
let imageURL = null;

// Display uploaded image
imageInput.addEventListener("change", function () {
    const file = this.files[0];

    result.style.display = "none";

    if (imageURL) {
        URL.revokeObjectURL(imageURL);
        imageURL = null;
    }

    if (!file) {
        preview.style.display = "none";
        return;
    }

    if (!file.type.startsWith("image/")) {
        alert("Please select a valid image.");
        this.value = "";
        preview.style.display = "none";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("Please choose an image smaller than 5 MB.");
        this.value = "";
        preview.style.display = "none";
        return;
    }

    imageURL = URL.createObjectURL(file);
    preview.src = imageURL;
    preview.style.display = "block";
});

// Analyze image using AI backend
analyzeButton.addEventListener("click", async function () {
    const file = imageInput.files[0];

    if (!file) {
        alert("Please upload a waste image first!");
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing Image...";
    
    result.style.display = "block";
    result.innerHTML = "<p>🤖 AI is analyzing your image. Please wait...</p>";

    try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error(data.message || "Image analysis failed.");
        }

        const category = data.category;
        const confidence = data.confidence;
        const suggestion = data.suggestion;

        let icon = "🔍";
        const label = category.toLowerCase();

        if (/plastic|bottle|container/.test(label)) {
            icon = "🧴";
        } else if (/paper|carton|book|newspaper/.test(label)) {
            icon = "📄";
        } else if (/food|fruit|vegetable|organic/.test(label)) {
            icon = "🍃";
        } else if (/glass|jar/.test(label)) {
            icon = "🫙";
        } else if (/metal|can|aluminum|aluminium/.test(label)) {
            icon = "🥫";
        }

      
        // Count only labels that appear recyclable.
        // This is a rough demo rule, not a verified waste classification.
        if (/plastic|bottle|paper|carton|glass|metal|aluminum|aluminium/.test(label)) {
            recycleCount++;
        }

        document.getElementById("scanCount").textContent = scanCount;
        document.getElementById("recycleCount").textContent = recycleCount;
        document.getElementById("pointsCount").textContent = points;
        document.getElementById("ecoPoints").textContent = points + " Points";

        result.innerHTML = `
            <h3>${icon} AI Image Analysis Result</h3>
            <p><strong>Predicted Label:</strong> ${escapeHTML(category)}</p>
            <p><strong>Model Confidence:</strong> ${confidence}%</p>
            <p><strong>Suggestion:</strong> ${escapeHTML(suggestion)}</p>
            <p><strong>EcoPoints Earned:</strong> +${earnedPoints} 🌱</p>
            <p><small>Note: This is a general image-classification model,
            not a waste-specialized model. Its prediction may be incorrect.
            Confirm the waste type and local disposal rules before recycling.</small></p>
        `;

    } catch (error) {
        result.innerHTML = `
            <h3>⚠️ Analysis Error</h3>
            <p>${escapeHTML(error.message)}</p>
            <p>Please check that the Flask server is running and try again.</p>
        `;
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze Waste";
        result.style.display = "block";
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
});

// Safely display text returned by the backend
function escapeHTML(value) {
    const element = document.createElement("div");
    element.textContent = String(value);
    return element.innerHTML;
} 
// Waste Analysis History
let wasteHistory = JSON.parse(
    localStorage.getItem("reloopHistory") || "[]"
);


function displayHistory() {
    const historyList = document.getElementById("historyList");
    const totalScans = document.getElementById("historyTotalScans");
    const totalPoints = document.getElementById("historyTotalPoints");

    if (!historyL
    totalScans.textContent = wasteHistory.length;

    totalPoints.textContent = wasteHistory.reduce(
        (sum, item) => sum + item.points,
        0
    );

    if (wasteHistory.length === 0) {
        historyList.innerHTML =
            "<p>No scans yet. Analyze an image to get started!</p>";
        return;
    }

    historyList.innerHTML = wasteHistory.map(item => `
        <div class="history-card">
            <h3>${escapeHTML(item.category)}</h3>
            <p><strong>Suggestion:</strong> ${escapeHTML(item.suggestion)}</p>
            <p><strong>EcoPoints:</strong> +${item.points} 🌱</p>
            <small>${escapeHTML(item.date)}</small>
        </div>
    `).join("");
}

function saveHistory(category, suggestion, earnedPoints) {
    wasteHistory.unshift({
        category: category,
        suggestion: suggestion,
        points: earnedPoints,
        date: new Date().toLocaleString()
    });

    localStorage.setItem("reloopHistory", JSON.stringify(wasteHistory));
    displayHistory();
}

document.getElementById("clearHistoryButton")?.addEventListener("click", function () {
    if (confirm("Are you sure you want to clear your scan history?")) {
        wasteHistory = [];
        localStorage.removeItem("reloopHistory");
        displayHistory();
    }
});

// Show previously saved history when the page opens
displayHistory();
async function loadLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");

    if (!leaderboardList) return;

    try {
        const response = await fetch("/api/leaderboard");
        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error("Could not load leaderboard");
        }

        if (data.leaderboard.length === 0) {
            leaderboardList.innerHTML =
                "<p>No Eco Warriors yet. Register to get started!</p>";
            return;
        }

        leaderboardList.innerHTML = data.leaderboard.map(user => `
            <div class="leaderboard-card">
                <span class="rank">${user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : user.rank} ${user.rank}</span>
                <div class="warrior-info">
                    <h3>${escapeLeaderboardText(user.username)}</h3>
                    <p>Eco Warrior</p>
                </div>
                <strong>${user.points} Points</strong>
            </div>
        `).join("");

    } catch (error) {
        console.error("Leaderboard error:", error);
        leaderboardList.innerHTML =
            "<p>Leaderboard could not load. Please try again.</p>";
    }
}

function escapeLeaderboardText(value) {
    const element = document.createElement("span");
    element.textContent = String(value);
    return element.innerHTML;
}

document.addEventListener("DOMContentLoaded", loadLeaderboard);
// Registration
const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const logoutButton = document.getElementById("logout-button");
const accountPoints = document.getElementById("account-points");

async function sendAuthRequest(url, username, password) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

function showAccount(data) {
    authMessage.textContent = "Welcome, " + data.username + "!";
    accountPoints.textContent = "Your EcoPoints: " + data.points;
    logoutButton.hidden = false;
    loadLeaderboard();
}

registerForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;

    try {
        const data = await sendAuthRequest(
            "/api/register",
            username,
            password
        );

        showAccount(data);
        registerForm.reset();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

// Login
loginForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        const data = await sendAuthRequest(
            "/api/login",
            username,
            password
        );

        showAccount(data);
        loginForm.reset();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

// Check whether a user is already logged in
async function checkCurrentUser() {
    try {
        const response = await fetch("/api/me");

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        showAccount(data);
    } catch (error) {
        console.error("Account check failed:", error);
    }
}

// Logout
logoutButton?.addEventListener("click", async function () {
    try {
        const response = await fetch("/api/logout", {
            method: "POST"
        });

        if (response.ok) {
            authMessage.textContent = "You have logged out.";
            accountPoints.textContent = "";
            logoutButton.hidden = true;
        }
    } catch (error) {
        authMessage.textContent = "Could not log out. Try again.";
    }
});

checkCurrentUser();