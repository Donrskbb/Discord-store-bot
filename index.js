// Import required modules
require('./utils/ProcessHandlers.js')();
require('./utils/InteractionOverrides.js')();

const { Client, PermissionsBitField: { Flags: Permissions } } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const configurePassport = require('./website/config/passport');
const User = require('./models/users.js');
const Nitro = require('./models/nitro.js');
const methodOverride = require('method-override');
const Handlebars = require('handlebars');
const { SESSION_SECRET_COOKIE_ID, DEFAULT_NAME, DEFAULT_ICON } = require('./config.js')
// Initialize Discord client
const client = new Client({
    intents: [
        'Guilds',
        'GuildMessages',
        'MessageContent',
        'GuildMembers',
        'GuildBans'
    ]
});

client.config = require('./config.js');
client.logs = require('./utils/Logs.js');
client.cooldowns = new Map();

// Load other bot components
require('./utils/ComponentLoader.js')(client);
require('./utils/EventLoader.js')(client);
require('./utils/RegisterCommands.js')(client);

// Log in to Discord
client.logs.info(`Logging in...`);
client.login(client.config.TOKEN);

// MongoDB connection function
async function connectToMongo() {
    try {
        await mongoose.connect(client.config.MONGO_URI);
        client.logs.custom('Connected to MongoDB', 0x7946ff);
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

// On bot ready
client.on('ready', function () {
    client.logs.custom(`Logged in as ${client.user.tag}!`, 0x7946ff);

    client.user.setPresence({
        activities: [{ name: 'with code', type: 'PLAYING' }],
        status: 'online',
    });

    connectToMongo();
    require('./utils/CheckIntents.js')(client);
    require('./utils/FileWatch.js')(client);
});

// Initialize Express server
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'website', 'public')));
app.use(methodOverride('_method'));

// Define custom Handlebars helper
Handlebars.registerHelper('hasWarnings', function (warningsCount, minWarnings, options) {
    if (warningsCount >= minWarnings) {
        return options.fn(this);
    } else {
        return options.inverse(this);
    }
});

Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

// Setup Handlebars
app.engine('hbs', exphbs.engine({
    extname: 'hbs',
    layoutsDir: path.join(__dirname, 'website', 'views', 'layouts'),
    defaultLayout: 'main',
    runtimeOptions: {
        allowProtoPropertiesByDefault: true
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'website', 'views'));

// Setup session and Passport
app.use(session({
    secret: SESSION_SECRET_COOKIE_ID,
    resave: false,
    saveUninitialized: false
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Fetch Discord user details
app.use(async (req, res, next) => {
    if (req.isAuthenticated()) {
        try {
            const discordUser = await client.users.fetch(req.user.userId);
            res.locals.discordUser = {
                username: discordUser.username || DEFAULT_NAME,
                avatarURL: discordUser.displayAvatarURL({ size: 512 }) || DEFAULT_ICON
            };
            res.locals.isAuthenticated = true; // Flag for authentication
            res.locals.isAdmin = req.user.isAdmin === 1; // Flag for admin status
        } catch (error) {
            console.error('Error fetching Discord user data:', error);
            // Set backup values if there's an error
            res.locals.discordUser = {
                username: DEFAULT_NAME,
                avatarURL: DEFAULT_ICON
            };
            res.locals.isAuthenticated = true; // Still authenticated if an error occurs
            res.locals.isAdmin = req.user.isAdmin === 1;
        }
    } else {
        res.locals.isAuthenticated = false; // Flag for authentication
        res.locals.isAdmin = false; // Flag for admin status
    }
    next();
});

// Setup theme middleware
app.use((req, res, next) => {
    res.locals.theme = req.session.theme || 'light';
    next();
});

// Passport configuration
configurePassport(passport);

// Authentication middlewares
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin === 1) {
        return next();
    }
    res.redirect('/login?error=Access denied');
}

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/dashboard'); // Redirect to dashboard if authenticated
    } else {
        res.redirect('/login'); // Redirect to login if not authenticated
    }
});

// Serve login page
app.get('/login', (req, res) => {
    const error = req.query.error || req.flash('error');
    res.render('login', { title: 'Login', error });
});

// Handle login form submission
app.post('/login', (req, res, next) => {
    console.log('Request body:', req.body); // Debugging line
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next);
});

// Handle logout
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err); // Pass the error to the error handler
        }
        req.session.destroy(() => {
            res.redirect('/'); // Redirect to homepage after session is destroyed
        });
    });
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const loggedInUserId = req.user.id;
        const topSpenders = await User.find().sort({ totalAmount: -1 }).limit(10).lean();
        const userData = await User.findOne({ _id: loggedInUserId }).lean();

        // Aggregate and count product purchases
        const productCounts = await User.aggregate([
            { $unwind: "$vouchDetails" },
            { $group: { _id: "$vouchDetails.product", totalQuantity: { $sum: "$vouchDetails.quantity" } } },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        // Render the dashboard with bot information, top spenders, and top products
        res.render('dashboard', {
            title: 'Bot Dashboard',
            bot: {
                username: client.user.username,
                tag: client.user.tag,
                status: client.user.presence.status,
                activity: client.user.presence.activities[0] ? client.user.presence.activities[0].name : 'None',
                guildCount: client.guilds.cache.size,
                userCount: client.users.cache.size
            },
            topSpenders,
            topProducts: productCounts,
            userPurchases: userData ? userData.vouchDetails : []
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Create a new route for user details (admin-only)
app.get('/user/:id', ensureAdmin, async (req, res) => {
    try {
        const userId = req.params.id; // This is the string userId from the URL parameter
        const user = await User.findOne({ userId: userId }).lean(); // Fetch user data

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Fetch Discord user details
        const discordUser = await client.users.fetch(userId);

        // Render the user details page
        res.render('userDetail', {
            title: `User Details - ${discordUser.username}`,
            user: {
                id: discordUser.id,
                username: discordUser.username,
                totalAmount: user.totalAmount,
                notes: user.notes,
                warnings: user.warnings,
                isAdmin: user.isAdmin,
                avatarURL: discordUser.displayAvatarURL({ size: 512 }),
                userPurchases: user.vouchDetails // Pass the user's purchase history
            }
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).send('Error fetching user details');
    }
});

// Serve the list of all users (admin-only)
app.get('/users', ensureAdmin, async (req, res) => {
    const search = req.query.search || '';
    try {
        const regex = new RegExp(search, 'i'); // Case-insensitive search
        const users = await User.find({
            $or: [
                { username: regex },
                { userId: regex }
            ]
        });
        const userPromises = users.map(async (user) => {
            const discordUser = await client.users.fetch(user.userId);
            return {
                username: discordUser.username,
                tag: discordUser.tag,
                id: user.userId,
                totalAmount: user.totalAmount,
                notesCount: user.notes.length,
                warningsCount: user.warnings.length,
                isAdmin: user.isAdmin
            };
        });

        const userList = await Promise.all(userPromises);

        res.render('users', {
            title: 'User List',
            users: userList,
            search
        });
    } catch (error) {
        console.error('Error fetching user list:', error);
        res.status(500).send('Error fetching user list');
    }
});

app.get('/settings', ensureAuthenticated, async (req, res) => {
    try {
        res.render('settings', {
            title: 'Bot Settings',
            bot: {
                username: client.user.username,
                tag: client.user.tag,
                status: client.user.presence.status,
                activity: client.user.presence.activities[0] ? client.user.presence.activities[0].name : 'None',
                guildCount: client.guilds.cache.size,
                userCount: client.users.cache.size
            },
            theme: req.session.theme || 'light', // Pass the theme to the view
            isAdmin: res.locals.isAdmin // Ensure isAdmin is passed
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/settings/theme', ensureAuthenticated, (req, res) => {
    const { theme } = req.body;
    if (theme && ['light', 'dark'].includes(theme)) {
        req.session.theme = theme; // Store theme in session
        res.redirect('/settings'); // Redirect to settings page
    } else {
        res.status(400).send('Invalid theme selection');
    }
});

app.get('/stock', ensureAdmin, async (req, res) => {
    try {
        const nitroItems = await Nitro.find(); // Fetch all Nitro stock data
        res.render('stock', { nitroItems }); // Render the 'stock' view and pass the data
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while fetching Nitro stock.');
    }
});

// Ensure 'aboutme' comes from the request body (form input)
app.post('/settings/update', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { botname, aboutme } = req.body; // Make sure aboutme is part of the request body

    if (!aboutme) {
        return res.redirect('/settings?error=aboutme_missing'); // Handle missing aboutme
    }

    try {
        // Update bot username
        await client.user.setUsername(botname);

        // Update bot's About Me (set as custom status)
        client.user.setPresence({
            activities: [{
                name: 'VisualVerse',  // Activity name
                state: aboutme,         // The "aboutme" status from the form input
                type: 0,                // 0 = Playing, 1 = Streaming, etc.
            }],
        });

        res.redirect('/settings?success=true');
    } catch (error) {
        console.error('Error updating bot settings:', error);
        res.redirect('/settings?error=true');
    }
});

// Add a note
app.post('/user/:id/note/add', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    const { noteContent } = req.body;

    if (!noteContent) {
        return res.status(400).send('Note content is required');
    }

    try {
        const newNote = {
            _id: new mongoose.Types.ObjectId(), // Generate a new ObjectId for the note
            content: noteContent,
            createdAt: new Date() // Add createdAt field
        };

        await User.updateOne(
            { userId: userId },
            { $push: { notes: newNote } }
        );

        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).send('Error adding note');
    }
});

// Remove a note
app.post('/user/:id/note/remove', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    const { noteId } = req.body;

    console.log('Removing note:', { userId, noteId }); // Debug line

    try {
        await User.updateOne({ userId: userId }, {
            $pull: { notes: { _id: noteId } }
        });
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error removing note:', error);
        res.status(500).send('Error removing note');
    }
});

// Add a warning
app.post('/user/:id/warning/add', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    const { warningReason } = req.body;
    try {
        await User.updateOne({ userId: userId }, {
            $push: { warnings: { reason: warningReason, issuedBy: req.user.username } }
        });
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error adding warning:', error);
        res.status(500).send('Error adding warning');
    }
});

// Remove a warning
app.post('/user/:id/warning/remove', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    const { warningId } = req.body;

    console.log('Removing warning:', { userId, warningId }); // Debug line

    try {
        await User.updateOne({ userId: userId }, {
            $pull: { warnings: { _id: warningId } }
        });
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error removing warning:', error);
        res.status(500).send('Error removing warning');
    }
});

// Ban user
app.post('/user/:id/ban', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const guild = client.guilds.cache.first(); // Adjust to select the correct guild
        const member = await guild.members.fetch(userId);
        await member.ban({ reason: 'Banned by admin' });
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).send('Error banning user');
    }
});

// Timeout user
app.post('/user/:id/timeout', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const guild = client.guilds.cache.first(); // Adjust to select the correct guild
        const member = await guild.members.fetch(userId);
        await member.timeout(7 * 24 * 60 * 60 * 1000, 'Timeout by admin'); // 1 week
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error timing out user:', error);
        res.status(500).send('Error timing out user');
    }
});

app.post('/user/:id/kick', ensureAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const guild = client.guilds.cache.first(); // Adjust to select the correct guild
        const member = await guild.members.fetch(userId);
        await member.kick('Kicked by admin');
        res.redirect(`/user/${userId}`);
    } catch (error) {
        console.error('Error kicking user:', error);
        res.status(500).send('Error kicking user');
    }
});

// Start the server
app.listen(port, () => {
    client.logs.custom(`Server is running on http://localhost:${port}`, 0x7946ff);
});
