const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../../models/users'); // Update path if needed
const bcrypt = require('bcrypt');

function configurePassport(passport) {
    passport.use(new LocalStrategy(
        async (username, password, done) => {
            try {
                console.log('Attempting to authenticate:', { username, password }); // Debugging line
                // Look up user by adminUsername
                const user = await User.findOne({ adminUsername: username });
                if (!user) {
                    console.log('User not found'); // Debugging line
                    return done(null, false, { message: 'Invalid username or password' });
                }

                // Check if the password matches
                const isMatch = await bcrypt.compare(password, user.adminPassword);
                if (!isMatch) {
                    console.log('Password mismatch'); // Debugging line
                    return done(null, false, { message: 'Invalid username or password' });
                }

                return done(null, user);
            } catch (err) {
                console.error('Error during authentication:', err); // Debugging line
                return done(err);
            }
        }
    ));

    // Serialize user into session
    passport.serializeUser((user, done) => {
        done(null, user.userId); // Serialize by userId
    });

    // Deserialize user from session
    passport.deserializeUser(async (userId, done) => {
        try {
            const user = await User.findOne({ userId: userId }); // Deserialize by userId
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}

module.exports = configurePassport;
