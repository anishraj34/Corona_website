require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error("FATAL: JWT_SECRET env variable is not set"); process.exit(1); }
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = process.env.PORT || 8000;

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [`http://localhost:${PORT}`];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(session({ secret: JWT_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
const frontendPath = path.join(__dirname, '../Frontend');
app.use(express.static(frontendPath));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mydatabase")
.then(() => console.log("MongoDB connected ✅"))
.catch(err => console.log(err));

// Schemas
const User = mongoose.model("User", {
    name: String,
    age: Number
});

const AuthUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String },
    avatar: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const AuthUser = mongoose.model("AuthUser", AuthUserSchema);

// Passport Google Strategy (only if credentials are set)
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `http://localhost:${PORT}/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await AuthUser.findOne({ googleId: profile.id });
            if (!user) {
                const emailExists = await AuthUser.findOne({ email: profile.emails[0].value });
                if (emailExists) {
                    emailExists.googleId = profile.id;
                    emailExists.avatar = profile.photos[0]?.value;
                    await emailExists.save();
                    return done(null, emailExists);
                }
                user = await AuthUser.create({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    avatar: profile.photos[0]?.value
                });
            }
            return done(null, user);
        } catch (err) { return done(err, null); }
    }));
}
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { const user = await AuthUser.findById(id); done(null, user); }
    catch (err) { done(err, null); }
});

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Invalid token' }); }
}

const Assessment = mongoose.model("Assessment", {
    name: String,
    age: Number,
    gender: String,
    symptoms: [String],
    riskFactors: [String],
    oxygenLevel: Number,
    bodyTemperature: Number,
    prediction: Number,
    riskLevel: String,
    riskPercent: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const projectRoot = path.join(__dirname, "..");
const columnsPath = path.join(projectRoot, "columns.json");
const modelPath = fs.existsSync(path.join(projectRoot, "final_model.pkl"))
    ? path.join(projectRoot, "final_model.pkl")
    : path.join(projectRoot, "final_model (1).pkl");
const pythonPredictorPath = path.join(__dirname, "predict_model.py");

const NOTEBOOK_COLUMNS = fs.existsSync(columnsPath)
    ? JSON.parse(fs.readFileSync(columnsPath, "utf8"))
    : [
        "patient_id",
        "age",
        "fever",
        "dry_cough",
        "sore_throat",
        "fatigue",
        "headache",
        "shortness_of_breath",
        "loss_of_smell",
        "loss_of_taste",
        "oxygen_level",
        "body_temperature",
        "travel_history",
        "contact_with_patient",
        "chest_pain",
        "gender_Male",
        "comorbidity_Asthma",
        "comorbidity_Diabetes",
        "comorbidity_Heart Disease"
    ];

function toBinary(value) {
    return value ? 1 : 0;
}

function buildNotebookFeatures(input) {
    const symptoms = Array.isArray(input.symptoms) ? input.symptoms : [];
    const riskFactors = Array.isArray(input.riskFactors) ? input.riskFactors : [];
    const age = Number(input.age);
    const oxygenLevel = Number(input.oxygenLevel);
    const bodyTemperature = Number(input.bodyTemperature);
    const gender = String(input.gender || "").toLowerCase();

    const hasSymptom = (id) => symptoms.includes(id);
    const hasRisk = (id) => riskFactors.includes(id);

    return {
        patient_id: 0,
        age,
        fever: toBinary(hasSymptom("fever") || bodyTemperature >= 38),
        dry_cough: toBinary(hasSymptom("cough")),
        sore_throat: toBinary(hasSymptom("sore_throat")),
        fatigue: toBinary(hasSymptom("fatigue")),
        headache: toBinary(hasSymptom("headache")),
        shortness_of_breath: toBinary(hasSymptom("breathing")),
        loss_of_smell: toBinary(hasSymptom("smell")),
        loss_of_taste: toBinary(hasSymptom("taste")),
        oxygen_level: oxygenLevel,
        body_temperature: bodyTemperature,
        travel_history: toBinary(hasRisk("travel_history")),
        contact_with_patient: toBinary(hasRisk("contact_with_infected_person")),
        chest_pain: toBinary(hasSymptom("chest")),
        gender_Male: toBinary(gender === "male"),
        "comorbidity_Asthma": toBinary(hasRisk("asthma") || hasRisk("lung_disease")),
        "comorbidity_Diabetes": toBinary(hasRisk("diabetes")),
        "comorbidity_Heart Disease": toBinary(hasRisk("heart_disease"))
    };
}

function buildResult(prediction, probability, features, source) {
    const oxygenLevel = features.oxygen_level;
    const hasAnySymptom = features.fever || features.dry_cough || features.sore_throat ||
        features.fatigue || features.headache || features.shortness_of_breath ||
        features.loss_of_smell || features.loss_of_taste || features.chest_pain;
    const hasAnyRisk = features.travel_history || features.contact_with_patient ||
        features["comorbidity_Asthma"] || features["comorbidity_Diabetes"] ||
        features["comorbidity_Heart Disease"];
    const vitalsNormal = oxygenLevel >= 95 && features.body_temperature < 38;

    // No symptoms + no risk factors + normal vitals = 0% Low
    if (!hasAnySymptom && !hasAnyRisk && vitalsNormal) {
        return {
            prediction: 0,
            resultText: "COVID risk not detected",
            riskLevel: "Low",
            riskPercent: 0,
            features,
            modelInfo: { source, modelPath: path.basename(modelPath), columns: NOTEBOOK_COLUMNS }
        };
    }

    // probability is already a 0-1 float from ML model, or a 0-100 int from fallback
    const riskPercent = typeof probability === "number" && probability <= 1
        ? Math.round(probability * 100)
        : typeof probability === "number"
            ? Math.round(probability)
            : fallbackRiskPercent(features);

    const dangerousVitals = oxygenLevel < 90;

    let riskLevel = "Low";
    if (dangerousVitals || riskPercent >= 75) riskLevel = "Critical";
    else if (riskPercent >= 50) riskLevel = "High";
    else if (riskPercent >= 25) riskLevel = "Moderate";

    return {
        prediction,
        resultText: prediction ? "COVID risk detected" : "COVID risk not detected",
        riskLevel,
        riskPercent,
        features,
        modelInfo: {
            source,
            modelPath: path.basename(modelPath),
            columns: NOTEBOOK_COLUMNS
        }
    };
}

function fallbackRiskPercent(features) {
    const age = features.age;
    const oxygenLevel = features.oxygen_level;
    const bodyTemperature = features.body_temperature;
    let score = 0;
    if (features.fever) score += 13;
    if (features.dry_cough) score += 9;
    if (features.sore_throat) score += 5;
    if (features.fatigue) score += 7;
    if (features.headache) score += 4;
    if (features.shortness_of_breath) score += 12;
    if (features.loss_of_smell || features.loss_of_taste) score += 10;
    if (features.chest_pain) score += 12;
    if (features.travel_history) score += 8;
    if (features.contact_with_patient) score += 15;
    if (features["comorbidity_Asthma"]) score += 7;
    if (features["comorbidity_Diabetes"]) score += 7;
    if (features["comorbidity_Heart Disease"]) score += 8;
    // Age and vitals only add score when symptoms/risks are already present
    const hasAnySymptomOrRisk = features.fever || features.dry_cough || features.sore_throat ||
        features.fatigue || features.headache || features.shortness_of_breath ||
        features.loss_of_smell || features.loss_of_taste || features.chest_pain ||
        features.travel_history || features.contact_with_patient ||
        features["comorbidity_Asthma"] || features["comorbidity_Diabetes"] ||
        features["comorbidity_Heart Disease"];
    if (hasAnySymptomOrRisk) {
        if (age >= 60) score += 10;
        else if (age >= 40) score += 5;
        if (oxygenLevel < 95) score += 12;
        if (oxygenLevel < 90) score += 12;
        if (bodyTemperature >= 38) score += 8;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function getFallbackPrediction(features) {
    const riskPercent = fallbackRiskPercent(features);
    const prediction = riskPercent >= 40 || features.oxygen_level < 90 ? 1 : 0;
    // Pass riskPercent directly (not divided) — buildResult handles both 0-1 and 0-100
    return buildResult(prediction, riskPercent, features, "javascript fallback");
}

function getPythonCommand() {
    const candidates = [
        ["python"],
        ["py", "-3"],
        ["python3"]
    ];

    for (const candidate of candidates) {
        const check = spawnSync(candidate[0], [...candidate.slice(1), "--version"], {
            encoding: "utf8"
        });

        if (check.status === 0) {
            return candidate;
        }
    }

    return null;
}

function getPrediction(input) {
    const features = buildNotebookFeatures(input);

    if (!fs.existsSync(modelPath) || !fs.existsSync(columnsPath)) {
        return getFallbackPrediction(features);
    }

    const pythonCommand = getPythonCommand();
    if (!pythonCommand) {
        return getFallbackPrediction(features);
    }

    const orderedFeatures = NOTEBOOK_COLUMNS.map((column) => features[column] ?? 0);
    const payload = JSON.stringify({
        modelPath,
        columnsPath,
        features: orderedFeatures
    });

    const result = spawnSync(
        pythonCommand[0],
        [...pythonCommand.slice(1), pythonPredictorPath],
        {
            input: payload,
            encoding: "utf8",
            maxBuffer: 1024 * 1024
        }
    );

    if (result.status !== 0) {
        console.log(result.stderr || "Python model prediction failed");
        return getFallbackPrediction(features);
    }

    try {
        const modelResult = JSON.parse(result.stdout);
        return buildResult(
            Number(modelResult.prediction),
            typeof modelResult.probability === "number" ? modelResult.probability : null,
            features,
            "final_model.pkl"
        );
    } catch (error) {
        return getFallbackPrediction(features);
    };
}

// ─── AUTH ROUTES ───

// Signup
app.post("/api/auth/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ error: "All fields are required" });
        const exists = await AuthUser.findOne({ email });
        if (exists) return res.status(400).json({ error: "Email already registered" });
        const hashed = await bcrypt.hash(password, 10);
        const user = await AuthUser.create({ name, email, password: hashed });
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { name: user.name, email: user.email, avatar: user.avatar } });
    } catch (err) { res.status(500).json({ error: "Signup failed" }); }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: "Email and password are required" });
        const user = await AuthUser.findOne({ email });
        if (!user || !user.password)
            return res.status(400).json({ error: "Invalid credentials" });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Invalid credentials" });
        const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { name: user.name, email: user.email, avatar: user.avatar } });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

// Google OAuth
app.get("/auth/google", (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
        return res.redirect('/auth.html?error=google_not_configured');
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});
app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth.html?error=google_failed" }),
    (req, res) => {
        const token = jwt.sign({ id: req.user._id, name: req.user.name, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.redirect(`/auth.html?token=${token}&name=${encodeURIComponent(req.user.name)}&email=${encodeURIComponent(req.user.email)}&avatar=${encodeURIComponent(req.user.avatar || '')}`);
    }
);

// Root API
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, 'auth.html'));
});

// GET users
app.get("/users", async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Error fetching data" });
    }
});

// POST
app.post("/submit", async (req, res) => {
    try {
        const { name, age } = req.body;
        if (!name || age === undefined) return res.status(400).json({ error: "name and age are required" });
        const newUser = new User({ name: String(name), age: Number(age) });
        await newUser.save();
        res.json({ message: "Data saved in DB ✅" });
    } catch (error) {
        res.status(500).json({ error: "Error saving data" });
    }
});

// PUT (update)
app.put("/update/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id))
            return res.status(400).json({ error: "Invalid ID" });
        const { name, age } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { name: String(name), age: Number(age) },
            { new: true }
        );
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: "Error updating user" });
    }
});

// DELETE
app.delete("/delete/:id", async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id))
            return res.status(400).json({ error: "Invalid ID" });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "User deleted ✅" });
    } catch (error) {
        res.status(500).json({ error: "Error deleting user" });
    }
});

// User count
app.get("/api/user-count", async (req, res) => {
    try {
        const count = await AuthUser.countDocuments();
        res.json({ count });
    } catch { res.status(500).json({ count: 0 }); }
});

// Test API
app.get("/api/test", (req, res) => {
    res.send("API is working ✅");
});

app.post("/api/predict", async (req, res) => {
    try {
        const age = Number(req.body.age);

        if (!age || age <= 0) {
            return res.status(400).json({ error: "Valid age is required" });
        }

        if (!req.body.gender) {
            return res.status(400).json({ error: "Gender is required" });
        }

        const prediction = getPrediction(req.body);

        const assessment = new Assessment({
            name: req.body.name || "",
            age,
            gender: req.body.gender,
            symptoms: Array.isArray(req.body.symptoms) ? req.body.symptoms : [],
            riskFactors: Array.isArray(req.body.riskFactors) ? req.body.riskFactors : [],
            oxygenLevel: Number(req.body.oxygenLevel) || 98,
            bodyTemperature: Number(req.body.bodyTemperature) || 37,
            prediction: prediction.prediction,
            riskLevel: prediction.riskLevel,
            riskPercent: prediction.riskPercent
        });

        assessment.save().catch(() => {
            console.log("Assessment not saved because MongoDB is unavailable");
        });

        res.json(prediction);
    } catch (error) {
        res.status(500).json({ error: "Prediction failed" });
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Frontend not found. Make sure Frontend folder is in the repo root.');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
