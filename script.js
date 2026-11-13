// ==========================================
// ReLoop AI - Main JavaScript
// ==========================================

// HTML Elements
const imageInput = document.getElementById("wasteImage");
const preview = document.getElementById("preview");
const analyzeButton = document.getElementById("analyzeButton");
const result = document.getElementById("result");

// Dashboard counters
let scanCount = 0;
let recycleCount = 0;
let points = 0;
let imageURL = null;


// ==========================================
// 1. IMAGE UPLOAD AND PREVIEW
// ==========================================

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


// ==========================================
// 2. AI WASTE IMAGE ANALYSIS
// ==========================================

analyzeButton.addEventListener("click", async function () {

    const file = imageInput.files[0];

    if (!file) {
        alert("Please upload a waste image first!");
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing Image...";

    result.style.display = "block";
    result.innerHTML =
        "<p>🤖 AI is analyzing your image. Please wait...</p>";

    try {

        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error(
                data.message || "Image analysis failed."
            );
        }

        const category = data.category;
        const confidence = data.confidence;
        const suggestion = data.suggestion;

        // Get points from Flask backend
        const earnedPoints = Number(data.suggested_points) || 0;

        const label = String(category).toLowerCase();

        // Select category icon
        let icon = "🔍";

        if (/plastic|bottle|container/.test(label)) {
            icon = "🧴";
        }
        else if (/paper|carton|book|newspaper/.test(label)) {
            icon = "📄";
        }
        else if (/food|fruit|vegetable|organic/.test(label)) {
            icon = "🍃";
        }
        else if (/glass|jar/.test(label)) {
            icon = "🫙";
        }
        else if (/metal|can|aluminum|aluminium/.test(label)) {
            icon = "🥫";
        }

        // Update dashboard
        scanCount++;
        points += earnedPoints;

        if (
            /plastic|bottle|paper|carton|glass|metal|aluminum|aluminium/.test(label)
        ) {
            recycleCount++;
        }

        document.getElementById("scanCount").textContent = scanCount;

        document.getElementById("recycleCount").textContent =
            recycleCount;

        document.getElementById("pointsCount").textContent = points;

        document.getElementById("ecoPoints").textContent =
            points + " Points";


        // Save scan in history
        saveHistory(category, suggestion, earnedPoints);


        // Add points to logged-in user's account
        let accountMessage = "";

        try {

            const pointsResponse = await fetch("/api/points", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    points: earnedPoints
                })
            });

            const pointsData = await pointsResponse.json();

            if (
                pointsResponse.ok &&
                pointsData.status === "success"
            ) {

                const accountPointsElement =
                    document.getElementById("account-points");

                if (accountPointsElement) {
                    accountPointsElement.textContent =
                        "Your EcoPoints: " +
                        pointsData.total_points;
                }

                accountMessage =
                    "<p>✅ Points saved to your account!</p>";

                await loadLeaderboard();

            }
            else if (pointsResponse.status === 401) {

                accountMessage =
                    "<p>Login to save points to your account and leaderboard.</p>";

            }
            else {

                accountMessage =
                    "<p>⚠️ Account points could not be updated.</p>";

                console.error(
                    "Points error:",
                    pointsData.message
                );
            }

        }
        catch (error) {

            console.error(
                "Could not update account points:",
                error
            );

            accountMessage =
                "<p>⚠️ Account points could not be updated.</p>";
        }


        // Display result
        result.innerHTML = `
            <h3>${icon} AI Image Analysis Result</h3>

            <p>
                <strong>Predicted Label:</strong>
                ${escapeHTML(category)}
            </p>

            <p>
                <strong>Model Confidence:</strong>
                ${escapeHTML(confidence)}%
            </p>

            <p>
                <strong>Suggestion:</strong>
                ${escapeHTML(suggestion)}
            </p>

            <p>
                <strong>EcoPoints Earned:</strong>
                +${earnedPoints} 🌱
            </p>

            ${accountMessage}

            <p>
                <small>
                    Note: This is a general image-classification model,
                    not a waste-specialized model. Its prediction may
                    be incorrect. Confirm the waste type and local
                    disposal rules before recycling.
                </small>
            </p>
        `;

    }

    catch (error) {

        result.innerHTML = `
            <h3>⚠️ Analysis Error</h3>

            <p>${escapeHTML(error.message)}</p>

            <p>
                Please check that the Flask server is running
                and try again.
            </p>
        `;
    }

    finally {

        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze Waste";

        result.style.display = "block";

        result.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

});


// ==========================================
// 3. SAFE HTML DISPLAY
// ==========================================

function escapeHTML(value) {

    const element = document.createElement("div");

    element.textContent = String(value);

    return element.innerHTML;
}


// ==========================================
// 4. WASTE ANALYSIS HISTORY
// ==========================================

let wasteHistory = [];

try {

    wasteHistory = JSON.parse(
        localStorage.getItem("reloopHistory") || "[]"
    );

    if (!Array.isArray(wasteHistory)) {
        wasteHistory = [];
    }

}
catch (error) {

    wasteHistory = [];

}


function displayHistory() {

    const historyList =
        document.getElementById("historyList");

    const totalScans =
        document.getElementById("historyTotalScans");

    const totalPoints =
        document.getElementById("historyTotalPoints");

    if (!historyList || !totalScans || !totalPoints) {
        return;
    }

    totalScans.textContent = wasteHistory.length;

    totalPoints.textContent = wasteHistory.reduce(
        (sum, item) => sum + (Number(item.points) || 0),
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

            <p>
                <strong>Suggestion:</strong>
                ${escapeHTML(item.suggestion)}
            </p>

            <p>
                <strong>EcoPoints:</strong>
                +${Number(item.points) || 0} 🌱
            </p>

            <small>${escapeHTML(item.date)}</small>

        </div>

    `).join("");

}


// Save new scan
function saveHistory(category, suggestion, earnedPoints) {

    wasteHistory.unshift({

        category: category,

        suggestion: suggestion,

        points: earnedPoints,

        date: new Date().toLocaleString()

    });

    localStorage.setItem(
        "reloopHistory",
        JSON.stringify(wasteHistory)
    );

    displayHistory();
}


// Clear history
document.getElementById("clearHistoryButton")
    ?.addEventListener("click", function () {

        if (
            confirm("Are you sure you want to clear your scan history?")
        ) {

            wasteHistory = [];

            localStorage.removeItem("reloopHistory");

            displayHistory();
        }

    });


// Display previous history
displayHistory();


// ==========================================
// 5. LEADERBOARD
// ==========================================

async function loadLeaderboard() {

    const leaderboardList =
        document.getElementById("leaderboard-list");

    if (!leaderboardList) {
        return;
    }

    try {

        const response = await fetch("/api/leaderboard");

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error("Could not load leaderboard.");
        }

        if (data.leaderboard.length === 0) {

            leaderboardList.innerHTML =
                "<p>No Eco Warriors yet. Register to get started!</p>";

            return;
        }

        leaderboardList.innerHTML =
            data.leaderboard.map(user => `

                <div class="leaderboard-card">

                    <span class="rank">
                        ${
                            user.rank === 1 ? "🥇" :
                            user.rank === 2 ? "🥈" :
                            user.rank === 3 ? "🥉" :
                            user.rank
                        }
                    </span>

                    <div class="warrior-info">

                        <h3>
                            ${escapeHTML(user.username)}
                        </h3>

                        <p>Eco Warrior</p>

                    </div>

                    <strong>
                        ${Number(user.points) || 0} Points
                    </strong>

                </div>

            `).join("");

    }

    catch (error) {

        console.error("Leaderboard error:", error);

        leaderboardList.innerHTML =
            "<p>Leaderboard could not load. Please try again.</p>";
    }
}


// ==========================================
// 6. USER REGISTRATION AND LOGIN
// ==========================================

const registerForm =
    document.getElementById("register-form");

const loginForm =
    document.getElementById("login-form");

const authMessage =
    document.getElementById("auth-message");

const logoutButton =
    document.getElementById("logout-button");

const accountPoints =
    document.getElementById("account-points");


async function sendAuthRequest(url, username, password) {

    const response = await fetch(url, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            username: username,
            password: password
        })

    });

    const data = await response.json();

    if (!response.ok) {

        throw new Error(
            data.message || "Request failed."
        );
    }

    return data;
}


// Show account details
function showAccount(data) {

    if (authMessage) {
        authMessage.textContent =
            "Welcome, " + data.username + "!";
    }

    if (accountPoints) {
        accountPoints.textContent =
            "Your EcoPoints: " + data.points;
    }

    if (logoutButton) {
        logoutButton.hidden = false;
    }

    loadLeaderboard();
}


// Registration
registerForm?.addEventListener("submit", async function (event) {

    event.preventDefault();

    const username =
        document.getElementById("register-username").value.trim();

    const password =
        document.getElementById("register-password").value;

    try {

        const data = await sendAuthRequest(
            "/api/register",
            username,
            password
        );

        showAccount(data);

        registerForm.reset();

    }

    catch (error) {

        authMessage.textContent = error.message;
    }

});


// Login
loginForm?.addEventListener("submit", async function (event) {

    event.preventDefault();

    const username =
        document.getElementById("login-username").value.trim();

    const password =
        document.getElementById("login-password").value;

    try {

        const data = await sendAuthRequest(
            "/api/login",
            username,
            password
        );

        showAccount(data);

        loginForm.reset();

    }

    catch (error) {

        authMessage.textContent = error.message;
    }

});


// ==========================================
// 7. CHECK CURRENT USER
// ==========================================

async function checkCurrentUser() {

    try {

        const response = await fetch("/api/me");

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        showAccount(data);

    }

    catch (error) {

        console.error(
            "Account check failed:",
            error
        );
    }
}


// ==========================================
// 8. LOGOUT
// ==========================================

logoutButton?.addEventListener("click", async function () {

    try {

        const response = await fetch("/api/logout", {
            method: "POST"
        });

        if (response.ok) {

            authMessage.textContent =
                "You have logged out.";

            accountPoints.textContent = "";

            logoutButton.hidden = true;

        }

    }

    catch (error) {

        authMessage.textContent =
            "Could not log out. Try again.";
    }

});


// ==========================================
// 9. INITIALIZE WEBSITE
// ==========================================

loadLeaderboard();

checkCurrentUser();