//-------------------------------------------------
// Dependencies
//-------------------------------------------------
const joi = require('joi');


//-------------------------------------------------
// Validation Schema
//-------------------------------------------------
const schema = joi.object({
  NETATMO_CLIENT_ID: joi.string()
    .required(),
  NETATMO_CLIENT_SECRET: joi.string()
    .required(),
  NETATMO_USERNAME: joi.string()
    .required(),
  NETATMO_PASSWORD: joi.string()
    .required()                  
}).unknown() // allows for extra fields (i.e that we don't check for) in the object being checked.
  .required();


//-------------------------------------------------
// Validate
//-------------------------------------------------
// i.e. check that process.env contains all the environmental variables we expect/need.
// It's important to use the 'value' that joi.validate spits out from now on, as joi has the power to do type conversion and add defaults, etc, and thus it may be different from the original process.env. 
const {error: err, value: envVars} = joi.validate(process.env, schema);

if (err) {
  throw new Error(`An error occured whilst validating process.env: ${err.message}`);
}


//-------------------------------------------------
// Create config object
//-------------------------------------------------
// Pull out the properties we need to create this particular config object. 
const config = {
  netatmo: {
    clientId: envVars.NETATMO_CLIENT_ID,
    clientSecret: envVars.NETATMO_CLIENT_SECRET,
    username: envVars.NETATMO_USERNAME,
    password: envVars.NETATMO_PASSWORD
  }
};

module.exports = config;