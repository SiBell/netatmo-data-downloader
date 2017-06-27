// Load any environmental variables set in the .env file into process.env
require('dotenv').config();

// Retrieve each of our configuration components
const netatmo = require('./components/netatmo');

// Combine all our components into a single object to be exported for use elsewhere in the app.
module.exports = Object.assign({}, netatmo);
// allows you to do something like this: const port = require('./config/config').server.port