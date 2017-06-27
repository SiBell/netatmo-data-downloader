

const request  = require('request');
const check    = require('check-types');
const async    = require('async');
const csv      = require('csv');
const fs       = require('fs');
const d3       = require('d3');
const json2csv = require('json2csv');

// API request limits are as follows:
// Application level : 200 API requests per 10 seconds, 2000 per hour.
// User Level        : 50  API requests per 10 seconds, 500  per hour.  

//-------------------------------------------------
// Exports
//-------------------------------------------------
exports = module.exports = {
  getToken,
  getPublic,
  makeStationList,
  stations2csv,
  csv2stations,
  getMeasures,
  getManyMeasures,
  multipleStats,
  multipleVars,
  docs2csv,
  getStationList
};


//-------------------------------------------------
// Get access token
//-------------------------------------------------
function getToken(creds, callback) {

  // creds is an object containing your netamo assigned credentials 
  // Check creds has a valid form
  if (check.not.like(creds, {client_id: '', client_secret: '', username: '', password: ''})) {
    return callback(new Error('Format of credentials object is not as expected'));
  }

	// Whether they already set it or not, let's set the grant_type as password as when we're getting a token for
	// the first time this is what it should be set as.
	creds.grant_type = 'password';

	// Make the post request to the netatmo API for an access token
  request.post(
    'https://api.netatmo.net/oauth2/token',
    {form: creds, json: true},
    (error, response, body) => {

      if (!error && response.statusCode == 200) {
      
        const access_token = body.access_token;

        // Check we actually got an access_token back
        if (check.not.nonEmptyString(access_token)) {
          return callback(new Error('Did not receive an access_token from the netamo api')) ;
        }

        console.log(`\nYou have been given the access_token: ${access_token} which will expire in ${body.expires_in} seconds`);
        // Return the access_token
        return callback(null, access_token);

      } else {

        if (error) {
          return callback(error);
        } else {
          return callback(new Error(`Error querying netamo api, status code: ${response.statusCode}`));
        }

      }
    }
  );
}



//-------------------------------------------------
// Get public data
//-------------------------------------------------
function getPublic(params, callback) {

	// Check the params object looks right, the 99's are there just to indicate the value should be a number.
  if (check.not.like(params, {access_token: '', lat_ne: 99, lon_ne: 99, lat_sw: 99, lon_sw: 99})) {
    return callback(new Error ('The paramaters argument to the getPublic function do not look as expected')) ;
  }


  // Make the request
  request.post(
    'https://api.netatmo.net/api/getpublicdata',
    {form: params, json:true},
    (error, response, body) => {

      if (!error && response.statusCode == 200) {

        if (body.status !== 'ok') {
          return callback(new Error(`Netatmo returned the status: ${body.status}`));
        }
        
        // Extract the actual data
        const publicData = body.body;

        // Return an error if no public data was returned
        if (publicData.length === 0) {
          return callback(new Error('Netatmo returned no public data, bounding box could be too small?'));
        }

        // console.log(`Retrieved public data from ${publicData.length} netatmo stations\n`);

        // Print out data
        // console.log(JSON.stringify(publicData,null,1));

        return callback(null, publicData);

      } else {

        if (error) {
          return callback(error);
        } else {
          return callback(new Error(`Error querying netamo api, status code: ${response.statusCode}`));
        }

      }
    }	
  );

}



//-------------------------------------------------
// Create Station List
//-------------------------------------------------
// Convert the data returned by a 'get public data' request into an array of station details. 
function makeStationList(pData) {

  // pData is the body.body from a netatmo getpublicdata request, should be an array
  check.assert.array(pData);

  // Create an empty array to hold the station list
  const list = [];

  // Loop through each station
  pData.forEach((s, idx) => {
    
    // Create a new object to hold info about this station
    const sObj = {};

    // Add standard info
    sObj.device_id = s._id;
    sObj.lon       = s.place.location[0];
    sObj.lat       = s.place.location[1];
    sObj.altitude  = s.place.altitude;
    sObj.timezone  = s.place.timezone;

    sObj.variables = {};

    // Now workout what observations it makes and what the module id is that measures each of these variable
    for (let mod_id in s.measures) {

      // Rain data is formatted a bit different in this section, e.g. it doesn't have a type field like the other
      // modules, what does seem to be consistent however is that rain modules ids always begin 05 and, as far as 
      // I can tell, none of the other modules start with 05. As such if a module id starts with 05 I'll add
      // Rain: '05...etc..etc'
      
      // If Rain module
      if (mod_id.slice(0, 2) === '05') {
        sObj.variables.rain = mod_id;
      
      // If Wind module
      } else if (mod_id.slice(0, 2) === '06') {	

        sObj.variables.wind = mod_id;

      // Non-rain or wind modules
      } else {

        const modType = s.measures[mod_id].type;

        // modType is an array, let's loop through it and for each variable this module measures let's note that this
        // variable is measured by this particular module id
        for (let t = 0; t < modType.length; t++) {

          sObj.variables[modType[t]] = mod_id;

        }

      }
    }

    // Add this station's details to the main list
    list.push(sObj);

  });//forEach

  // return the complete list
  return list;

}

//-------------------------------------------------
// Get Station List
//-------------------------------------------------
// Arguments when useExisting === true:
// 1) useExisting: true
// 2) csvFile: a string with the csv file name/path
// 3) publicParams: not used, so can be set as {}
// 3) callback

// Arguments when useExisting === false:
// 1) useExisting: false
// 2) csvFile: a string with the csv file name/path
// 3) publicParams: object with parameters for the getpublicdata request
// 4) callback

// When useExisting is true a csv is loaded, when false a the new station list of netatmo is saved as a csv.

function getStationList(useExisting, csvFile, publicParams, callback) {

  check.assert.boolean(useExisting);
  check.assert.nonEmptyString(csvFile);
  check.assert.object(publicParams);
  check.assert.function(callback);

  //--------------------
  // Load Existing CSV
  //--------------------
  if (useExisting === true) {

    csv2stations(csvFile, (err, statList) => {

      if (err) return callback(err);
      return callback(null, statList);

    });

  //--------------------
  // Get New Station List
  //--------------------
  } else {

    // Get the public data
    getPublic(publicParams, (err, publicData) => {

      if (err) return callback(err);

      // Turn the public data into a station list and return it
      const statList = makeStationList(publicData);

      // Save the station list
      stations2csv(statList, csvFile, (err) => {

        if (err) return callback(err);

        // Return the station list
        return callback(null, statList);

      });

    });

  }
}


//-------------------------------------------------
// Station List to CSV
//-------------------------------------------------
// Convert the list of stations, created by the makeStationList function, to a csv.
// The station list should be an array of objects.
function stations2csv(list, savepath, callback) {

  const fields = ['device_id', 'lon', 'lat', 'altitude', 'timezone', 'variables.temperature', 'variables.humidity', 'variables.pressure', 'variables.rain'];
  const fieldNames = ['device_id', 'lon', 'lat', 'altitude', 'timezone', 't_id', 'h_id', 'p_id', 'r_id'];
  const quotes = ''; // Set as '' if you don't want quote marks around strings. Defaults to " if unspecified.
    
  json2csv({data: list, fields, fieldNames, quotes}, (err, csv) => {
    if (err) return callback(err);

    fs.writeFile(savepath, csv, (err) => {
      if (err) return callback(err);
      
      // File Saved
      return callback();
    });
  });

}


//-------------------------------------------------
// CSV to Station List
//-------------------------------------------------
// The opposite of stations2csv, it loads the csv of station details as an array of objects in the same format
// as it was before being saved. e.g:
// [
//   { 
//   	 device_id: '70:ee:50:02:3d:2c',
//     lon: -1.983330427919,
//     lat: 52.463739090891,
//     altitude: 201,
//     timezone: 'Europe/London',
//     variables: { 
//      	temperature: '02:00:00:02:39:ba',
//        humidity: '02:00:00:02:39:ba',
//        rain: '05:00:00:00:e4:58',
//        pressure: '70:ee:50:02:3d:2c' 
//     } 
//   },
//   {...} 
// ]
function csv2stations(filepath, callback) {

  const header2var = {
    t_id: 'temperature',
    h_id: 'humidity',
    p_id: 'pressure',
    r_id: 'rain'
  };


  fs.readFile(filepath, 'utf8', (err, data) => {

    if (err) {
      return callback(err);
    }

    // d3 parses it to an array of objects, with headers acting as the keys. All the values are currently strings
    const parsed = d3.csvParse(data);
    
    // Now format it row by row
    const formatted = parsed.map((row) => {

      const variables = {};

      for (let header in header2var) {
        if (row[header]) {
          variables[header2var[header]] = row[header];
        }
      }

      return {
        device_id: row.device_id,
        lon: Number(row.lon),
        lat: Number(row.lat),
        altitude: Number(row.altitude),
        timezone: row.timezone,
        variables: variables
      };

    });

    return callback(null, formatted);

  });

}


//-------------------------------------------------
// Get Measurements (for a single station)
//-------------------------------------------------
function getMeasures(params, callback) {

  // Check the params object looks right. At the very least it must contain the access_token, the device_id, the
  // scale and the type. Each of these should be strings.
  if (check.not.like(params, {access_token: '', device_id: '', scale: '', type: ''})) {
    return callback(new Error ('The parameters argument to the getMeasures function do not look as expected')) ;
  }

  // console.log("About to get " + params.type + " observations for " + params.device_id);

  // I always want the data to NOT be 'optimized' as it is easier to work with this way, and this is what the code
  // expects.
  params.optimize = false;

  // Make the request
  request.post(
    'https://api.netatmo.net/api/getmeasure',
    {form: params, json:true},
    (error, response, body) => {
      if (!error && response.statusCode == 200) {
        
        // Extract the actual data
        const obs = body.body;
        
        // Print out?
        // console.log(JSON.stringify(obs,null,1));

        // If the 1024 limit was reached then display a warning saying as such.
        // Note that if you requested type:"Temperature,Humidity" then you would still get 1024 timesteps, so 
        // would actually get 2048 measurements.
        if (Object.keys(obs).length === 1024) {
          console.log('Note that netatmo limit of 1024 timesteps has been reached');
        }

        // Return the observations
        return callback(null, obs);

      } else {

        // If netamo responded with an error message
        if (body.error) {
          return callback(new Error(`Netatmo returned the error: ${body.error.message}`));
        }	  		

        if (error) {
          return callback(error);
        } else {
          return callback(new Error(`Error querying netamo api, status code: ${response.statusCode}`));
        }

      }
    }	
  );  

}



//-------------------------------------------------
// Get Many Measurements (for a single station)
//-------------------------------------------------
// Use this function when you suspect that the 1024 observations limit will be reached.
// It will run the getMeasures function for you and will handling running it multiple times if needs be.
function getManyMeasures(params, callback) {

  // Owing to Javascript's annoying mutable characteristic I'm going to create a new parameters object here,
  // making sure not to copy over any objects, only values. If I don't then when I change the date_begin property
  // below it will end up changing it in all the parent objects as well, which I definitely don't want as they
  // hold the initial start and end dates as set by the user.
  const mmparams = {
    access_token : params.access_token,
    device_id    : params.device_id,
    module_id    : params.module_id,
    type         : params.type,
    date_begin   : params.date_begin,
    date_end     : params.date_end,
    scale        : params.scale		
  } ;

  // As netamo returns the measurements within an object rather than an array (makes things a bit trickier but
  // let's roll with it) let's create an empty object ready to be filled or appended to with each response.
  const allObs = {};
  // Initialise nObs = 1024 to ensure the 'whilst' test passes and thus we query the netatmo api at least once
  let nObs = 1024; 
    
  async.whilst(
    // If the following function is true then it will process the next function
    () => {
      return nObs === 1024;
    },
    // This next function is called each time the test passes. 
    // The function is passed a callback(err), which must be called once it has completed (optional err argument).
    (callback) => {

      // Run our asynchronous function, which will call the callback when it's finished
      setTimeout(() => {
      
        getMeasures(mmparams, (err, obs) => {

          if (err) {
            return callback(err);
          }

          // Count how many obs we got in this response to see if we hit the 1024 limit
          nObs = Object.keys(obs).length;			  

          const times = Object.keys(obs) ;
          // What was the last timestep we got? This will be in seconds not milliseconds. 
          const lasttime = times[times.length - 1];
          // Now use this as the start time of the next request (assuming there will be another request)
          mmparams.date_begin = lasttime;

          // One benefit of using an object to hold each timestep object (as supposed to an array) is that if for
          // example the 'lasttime' timestep appeared in both the previous current request and therefore we
          // unnecessarily got it's data twice then it would still only be stored once as it would just overwrite
          // itself.

          // Add newly acquired to what we have already
          for (let key in obs) {
            allObs[key] = obs[key];
          } 

          callback(null);

        });
          
      }, 200); // 200 is 1/5 of a second

    },
    // This next function (a callback) is called after the test fails.
    (err) => {
      if (err) {
        return callback(err);
      }

      // Return all the observations
      return callback (null, allObs);	

    }
  );

} 



//-------------------------------------------------
// Get Multiple Variables (for a single station)
//-------------------------------------------------
// The output of this function will be an array of objects, much like a mongo document where each object is 
// pretty independent, with a structure like this:
// [
// 	{
// 		device_id: "1234",
// 		timestamp : "4567",
//    date      : date     //<-- added for convience 
// 		temperature: 12.6, 
// 		humidity:    100,
// 		pressure:    1000,
// 		rain:        0
// 	}
// ]
function multipleVars(sInfo, params, variables, callback) {

  // Check the variables argument is an array
  check.assert.array(variables, 'The variables argument is not an array'); 
  // Add to a check to see if there's any unexpected variables in here???
  // params is the getmeasures parameter object which will be checked in the getMeasures function later.
  // Check the callback is a function
  check.assert.function(callback, 'The callback is not a function');

  // Create a intermediary object that will be gradually filled with the data in the following format
  // {
  // 	"1425015706" : {
  // 		temperature: 16.5,
  // 		pressure   : 1000
  // 	}
  // }
  const inter = {};

  // Get measurements for each variable 
  async.eachSeries(variables, (variable, eachCallback) => {

    // Given the variable specified by the user convert it into one of the main variables, i.e. that corresponds to
    // a module when you get a getPublicData request, e.g. temperature, humidity, pressure, wind. Basically if a
    // user asks for 'max_hum' then the function will output 'humidity' so that in a second we can check that this
    // station actually records humidity. At the same time
    const modVar = var2modVar(variable);   

    // Check the station's info to see if this station has a module that measures this variable.
    if (sInfo.variables[modVar]) {

      // Construct our params object for this particular device, module and variable
      const vParams = {
        access_token : params.access_token,
        device_id    : sInfo.device_id,
        module_id    : sInfo.variables[modVar],
        type         : variable,
        date_begin   : params.date_begin,
        date_end     : params.date_end,
        scale        : params.scale
      } ;

      // Going to assume that the 1024 is likely to be broken so will call the getManyMeasures function
      getManyMeasures(vParams, (err, obs) => {

        if (err) return eachCallback(err);

        // Let's get the returned data into an intermediary format which will then be tidied up once all the 
        // variables have been gathered
        for (let key in obs) {

          if (!inter[key]) {
            inter[key] = {};
          } 
          // Now add the value of this variable to our intermediatary structure
          inter[key][variable] = obs[key][0];
        }

        // Having added this variable's obs to our inter object let's move onto the next variable
        eachCallback();

      });

    } else {

      // Don't need to do anything except call the callback to move onto the next variable
      // console.log("This station doesn't record the variable " + variable +
      //             " or this code doesn't recognise this variable as a valid variable that netatmo allows");
      eachCallback();

    }

  }, (err) => {

    // if any errors occured then return them
    if (err) return callback(err);

    // Otherwise all the data was succesfully retrieved.
    // Now to format the inter structure into the much nicer format described above this function.
    // First create an empty array to be filled.
    const dataArr = [];
    // Loop over each timestep in the intermediary object
    for (let key in inter) {
      // Create an object for this timestep
      const tstep = {
        device_id: sInfo.device_id,
        timestamp: key,
        date: new Date(key * 1000)
      };

      // Now to add in the variable observations this station has recorded
      //for (var v in inter[key]) { tstep[v] = inter[key][v]; }
      // Use the following format so that variables which this station doesn't record still get added but just
      // without a value, this ensures the csv code later will still add a column for them.
      for (let i = 0; i < variables.length; i++) {
        const v = variables[i];
        // console.log(v + " set as " + inter[key][v]);
        tstep[v] = inter[key][v];
      }

      // Add this formatted timestep of info to the array
      dataArr.push(tstep);
    }

    // Now that the data has been nicely formatted let's return it
    callback(null, dataArr);

  });	

}





//-------------------------------------------------
// Get Multiple Stations
//-------------------------------------------------
function multipleStats(statList, params, variables, callback) {

  // The statList should be an array of object, with each object holding information about a given station.
  check.assert.array(statList, 'The station list is not an array'); 
  // Don't really need to check the params object here as it will be checked once it reaches the getMeasures
  // function.
  // Likewise the variables will be checked upon reaching the multipleVars function
  // Check the callback is a function.
  check.assert.function(callback, 'The callback is not a function');

  // Create, what could become a pretty massive, array to hold the observation objects for all the stations. Each 
  // object will hold multiple variables, as formatted by the multipleVars function.
  let allObs = []; 

  // Use async's eachSeries function to call the multipleVars function for every station and wait for all the data
  // from all the station's to be collected before calling the callback.
  // You might be able to get away with using each, the only worry is the netatmo api limit.
  async.eachSeries(statList, (station, eachCallback) => {

    console.log(`Processing station: ${station.device_id}`);

    // Pass this station's details to the multipleVars function
    multipleVars(station, params, variables, (err, sObs) => {

      if (err) return eachCallback(err) ;

      // Having got this stations observations (now in an array of objects) add them to the observations of all
      // the other stations.
      allObs = allObs.concat(sObs);

      // Now move onto the next station
      eachCallback();

    }); 


  }, (err) => {

    if (err) return callback(err) ;	

    // If everything went ok then return the big data array.
    callback(null, allObs);

  });

}


//-------------------------------------------------
// Obs (in docs format) to csv
//-------------------------------------------------
// Take the obs in the format outputted by the multipleVars function and save them to a csv file
function docs2csv(obs, savepath) {

  const stringifier = csv.stringify({header:true});

  csv.transform (obs, (record) => {
    // Add a human-readable time field
    record.isoTime = new Date(record.timestamp * 1000).toISOString();
    return record;
  })
  .pipe(stringifier)
  .pipe(fs.createWriteStream(savepath));

}


//-------------------------------------------------
// User variable to module variable
//-------------------------------------------------
// Create the mapping
const varMap = {
  temperature: 'temperature', 
  co2: 'pressure',
  humidity: 'humidity', // technically could use temperature here
  pressure: 'pressure',
  noise: 'pressure',
  rain: 'rain',
  min_temp: 'temperature',
  max_temp: 'temperature',
  min_hum: 'humidity',
  max_hum: 'humidity',
  min_pressure: 'pressure',
  max_pressure: 'pressure',
  min_noise: 'pressure',
  max_noise: 'pressure',
  sum_rain: 'rain',
  date_min_temp: 'temperature',
  date_max_temp: 'temperature',
  date_min_hum: 'humidity',
  date_max_hum: 'humidity',
  date_min_pressure: 'pressure',
  date_max_pressure: 'pressure',
  date_min_noise: 'pressure',
  date_max_noise: 'pressure',
  date_min_co2: 'pressure',
  date_max_co2: 'pressure',
};


// Take the obs in the format outputted by the multipleVars function and save them to a csv file
function var2modVar(userVar) {

  // Make sure the userVar is all lowercase as in the varMap object
  const userVarLower = userVar.toLowerCase();

  if (varMap[userVarLower]) {
    return varMap[userVarLower] ;
  } else {
    // If this wasn't found then just return the users unknown variable string
    return userVarLower;
  }

}



